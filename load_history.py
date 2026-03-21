"""
NEPSE Historical Loader
======================
Downloads daily CSVs (or combined Excel) from OmitNomis ShareSansarScraper archive
and loads normalized OHLCV rows into nepse_db.

Usage:
    python load_history.py --days 90
    python load_history.py --from 2025-01-01 --to 2026-03-20
    python load_history.py --from 2025-01-01 --symbol ADBL
    python load_history.py --excel
"""

import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta
from io import StringIO

import mysql.connector
import pandas as pd
import pymysql
import requests


DB = dict(
    host=os.getenv("NEPSE_DB_HOST", "localhost"),
    port=int(os.getenv("NEPSE_DB_PORT", "3306")),
    user=os.getenv("NEPSE_DB_USER", "root"),
    password=os.getenv("NEPSE_DB_PASSWORD", ""),
    database=os.getenv("NEPSE_DB_NAME", "nepse_db"),
)

CSV_URL = "https://raw.githubusercontent.com/OmitNomis/ShareSansarScraper/master/docs/Data/{date}.csv"
EXCEL_URL = "https://raw.githubusercontent.com/OmitNomis/ShareSansarScraper/master/docs/Data/combined_excel.xlsx"
EXCEL_LOCAL = "nepse_historical.xlsx"

HEADERS = {"User-Agent": "Mozilla/5.0"}


def is_trading_day(d: str) -> bool:
    return datetime.strptime(d, "%Y-%m-%d").weekday() not in (4, 5)


def date_range(from_date: str, to_date: str):
    cur = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")
    while cur <= end:
        ds = cur.strftime("%Y-%m-%d")
        if is_trading_day(ds):
            yield ds
        cur += timedelta(days=1)


def clean_num(v):
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except Exception:
        return None


def clean_int(v):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except Exception:
        return None


def normalize_df(df: pd.DataFrame, trading_date: str | None = None) -> pd.DataFrame:
    col_map = {
        "Symbol": "symbol",
        "symbol": "symbol",
        "SYMBOL": "symbol",
        "Open": "open_price",
        "open": "open_price",
        "High": "high_price",
        "high": "high_price",
        "Low": "low_price",
        "low": "low_price",
        "Close": "close_price",
        "close": "close_price",
        "LTP": "close_price",
        "Ltp": "close_price",
        "Volume": "volume",
        "volume": "volume",
        "Vol": "volume",
        "Qty.": "volume",
        "Traded Shares": "volume",
        "Turnover": "turnover",
        "turnover": "turnover",
        "Amount": "turnover",
        "Prev. Close": "prev_close",
        "Previous Close": "prev_close",
        "prev_close": "prev_close",
        "% Change": "percent_change",
        "Percent Change": "percent_change",
        "percent_change": "percent_change",
        "Diff %": "percent_change",
        "Date": "date",
        "date": "date",
        "Trading Date": "date",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})
    # Multiple source columns can map to the same normalized name (e.g., Close/LTP).
    # Keep the first mapped column to avoid duplicate-column assignment issues.
    df = df.loc[:, ~df.columns.duplicated()]

    if "symbol" not in df.columns:
        return pd.DataFrame()

    if "date" not in df.columns:
        if trading_date is None:
            return pd.DataFrame()
        df["date"] = trading_date

    def parse_date(v):
        if isinstance(v, datetime):
            return v.strftime("%Y-%m-%d")
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(str(v).strip(), fmt).strftime("%Y-%m-%d")
            except Exception:
                pass
        return None

    df["date"] = df["date"].apply(parse_date)
    df = df.dropna(subset=["date"])

    for col in ["open_price", "high_price", "low_price", "close_price", "volume", "turnover", "prev_close", "percent_change"]:
        if col in df.columns:
            df[col] = df[col].apply(clean_num)

    if "close_price" not in df.columns:
        return pd.DataFrame()

    if "open_price" not in df.columns:
        df["open_price"] = df["close_price"]
    if "high_price" not in df.columns:
        df["high_price"] = df["close_price"]
    if "low_price" not in df.columns:
        df["low_price"] = df["close_price"]
    if "volume" not in df.columns:
        df["volume"] = 0

    df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()
    df = df.dropna(subset=["symbol", "close_price"])
    df = df[df["symbol"].str.len() > 1]
    df = df[df["close_price"] > 0]
    df = df[~df["symbol"].isin(["SYMBOL", "NAN", "#", "S.NO", "SN"])]

    return df


def fetch_csv_day(d: str) -> pd.DataFrame:
    archive_date = d.replace('-', '_')
    url = CSV_URL.format(date=archive_date)
    try:
        r = requests.get(url, headers=HEADERS, timeout=25)
        if r.status_code == 404:
            return pd.DataFrame()
        r.raise_for_status()
        raw = pd.read_csv(StringIO(r.text))
        if raw.empty:
            return pd.DataFrame()
        return normalize_df(raw, trading_date=d)
    except Exception:
        return pd.DataFrame()


def load_excel_archive(path: str) -> pd.DataFrame:
    raw = pd.read_excel(path, sheet_name=0)
    if raw.empty:
        return pd.DataFrame()
    return normalize_df(raw)


class Loader:
    def __init__(self):
        self.driver = "mysql-connector"
        try:
            self.conn = mysql.connector.connect(**DB)
            self.cur = self.conn.cursor()
        except Exception as first_err:
            self.driver = "pymysql"
            try:
                self.conn = pymysql.connect(
                    host=DB["host"],
                    port=DB["port"],
                    user=DB["user"],
                    password=DB["password"],
                    database=DB["database"],
                    autocommit=False,
                    charset="utf8mb4",
                )
                self.cur = self.conn.cursor()
            except Exception:
                raise first_err

        self.company_cache = {}
        self.session_cache = {}

    def close(self):
        self.cur.close()
        self.conn.close()

    def company_id(self, symbol: str):
        if symbol in self.company_cache:
            return self.company_cache[symbol]

        self.cur.execute("SELECT company_id FROM company WHERE symbol=%s LIMIT 1", (symbol,))
        row = self.cur.fetchone()
        if row:
            self.company_cache[symbol] = row[0]
            return row[0]

        try:
            self.cur.execute(
                "INSERT INTO company (symbol, name, sector_id, is_active) VALUES (%s,%s,14,1)",
                (symbol, symbol),
            )
            self.conn.commit()
            cid = self.cur.lastrowid
            self.company_cache[symbol] = cid
            return cid
        except Exception:
            self.conn.rollback()
            return None

    def session_id(self, trading_date: str):
        if trading_date in self.session_cache:
            return self.session_cache[trading_date]

        self.cur.execute("SELECT session_id FROM trading_session WHERE trading_date=%s LIMIT 1", (trading_date,))
        row = self.cur.fetchone()
        if row:
            sid = row[0]
        else:
            self.cur.execute(
                "INSERT INTO trading_session (trading_date, open_time, close_time, is_holiday, remarks) VALUES (%s,'11:00:00','15:00:00',0,'archive')",
                (trading_date,),
            )
            self.conn.commit()
            sid = self.cur.lastrowid

        self.session_cache[trading_date] = sid
        return sid

    def insert_df(self, df: pd.DataFrame, symbol_filter: str | None = None):
        loaded = 0
        dupes = 0

        for _, row in df.iterrows():
            sym = str(row.get("symbol", "")).upper().strip()
            ds = str(row.get("date", "")).strip()
            if not sym or not ds:
                continue
            if symbol_filter and sym != symbol_filter.upper():
                continue

            cid = self.company_id(sym)
            if not cid:
                continue
            sid = self.session_id(ds)

            o = clean_num(row.get("open_price"))
            h = clean_num(row.get("high_price"))
            l = clean_num(row.get("low_price"))
            c = clean_num(row.get("close_price"))
            v = clean_int(row.get("volume"))
            t = clean_num(row.get("turnover"))
            p = clean_num(row.get("prev_close"))
            pct = clean_num(row.get("percent_change"))

            if None in (o, h, l, c, v) or c <= 0:
                continue
            if h < l:
                h, l = l, h

            try:
                self.cur.execute(
                    "INSERT INTO price_data (company_id, session_id, open_price, high_price, low_price, close_price, volume, turnover, prev_close, percent_change) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (cid, sid, o, h, l, c, v, t, p, pct),
                )
                pid = self.cur.lastrowid
                self.cur.execute(
                    "INSERT INTO data_source (price_id, source_name, entered_by, entry_method) VALUES (%s,'OmitNomis/ShareSansarScraper','load_history','archive')",
                    (pid,),
                )
                self.conn.commit()
                loaded += 1
            except (mysql.connector.IntegrityError, pymysql.err.IntegrityError):
                self.conn.rollback()
                dupes += 1
            except Exception:
                self.conn.rollback()

        return loaded, dupes


def main():
    ap = argparse.ArgumentParser(description="NEPSE historical loader from archive")
    ap.add_argument("--from", dest="from_d")
    ap.add_argument("--to", dest="to_d")
    ap.add_argument("--days", type=int)
    ap.add_argument("--symbol", default=None)
    ap.add_argument("--excel", action="store_true", help="Use combined Excel archive")
    args = ap.parse_args()

    today = date.today().strftime("%Y-%m-%d")
    loader = Loader()
    total_loaded = 0
    total_dupes = 0

    if args.excel:
        if not os.path.exists(EXCEL_LOCAL):
            r = requests.get(EXCEL_URL, headers=HEADERS, timeout=180)
            r.raise_for_status()
            with open(EXCEL_LOCAL, "wb") as f:
                f.write(r.content)

        df = load_excel_archive(EXCEL_LOCAL)
        if args.from_d:
            df = df[df["date"] >= args.from_d]
        if args.to_d:
            df = df[df["date"] <= args.to_d]
        if args.days:
            cutoff = (date.today() - timedelta(days=args.days)).strftime("%Y-%m-%d")
            df = df[df["date"] >= cutoff]

        for i, (_, batch) in enumerate(df.groupby("date"), 1):
            loaded, dupes = loader.insert_df(batch, symbol_filter=args.symbol)
            total_loaded += loaded
            total_dupes += dupes
            if i % 10 == 0 or i == 1:
                print(f"[{i:4d}] loaded={total_loaded} dupes={total_dupes}")
    else:
        if args.days:
            to_d = today
            from_d = (date.today() - timedelta(days=args.days)).strftime("%Y-%m-%d")
        elif args.from_d:
            from_d = args.from_d
            to_d = args.to_d or today
        else:
            print("Usage: python load_history.py --days 90")
            print("   or: python load_history.py --from 2025-01-01")
            print("   or: python load_history.py --excel --from 2025-01-01")
            loader.close()
            sys.exit(1)

        trading_days = list(date_range(from_d, to_d))
        print(f"Range: {from_d} -> {to_d}")
        print(f"Symbol: {args.symbol or 'ALL'}")
        print(f"Trading days: {len(trading_days)}")

        for idx, d in enumerate(trading_days, 1):
            print(f"[{idx:3d}/{len(trading_days)}] {d} ...", end=" ", flush=True)
            df = fetch_csv_day(d)
            if df.empty:
                print("no data")
                time.sleep(0.2)
                continue

            loaded, dupes = loader.insert_df(df, symbol_filter=args.symbol)
            total_loaded += loaded
            total_dupes += dupes

            sample_symbol = (args.symbol or "ADBL").upper()
            sample = df[df["symbol"] == sample_symbol]
            if not sample.empty:
                r = sample.iloc[0]
                print(f"ok {loaded} loaded ({dupes} dupes) [{sample_symbol}: C={r.get('close_price', '-')}, H={r.get('high_price', '-')}, V={r.get('volume', '-')}]")
            else:
                print(f"ok {loaded} loaded ({dupes} dupes)")
            time.sleep(0.2)

    loader.close()
    print("DONE")
    print(f"Total loaded: {total_loaded}")
    print(f"Total dupes: {total_dupes}")


if __name__ == "__main__":
    main()
