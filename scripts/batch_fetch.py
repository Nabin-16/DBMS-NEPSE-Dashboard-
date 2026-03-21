"""
NEPSE Batch Fetcher
==================
Uses merolagani.com StockQuote.aspx date endpoint for historical daily snapshots.

Usage:
    python scripts/batch_fetch.py --days 30
    python scripts/batch_fetch.py --from 2026-01-01 --to 2026-03-20
    python scripts/batch_fetch.py --from 2026-01-01 --to 2026-03-20 --symbol ADBL
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

MERO_URL = "https://www.merolagani.com/StockQuote.aspx"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.merolagani.com/",
}

COL_MAP = {
    "Symbol": "symbol",
    "LTP": "close_price",
    "% Change": "percent_change",
    "High": "high_price",
    "Low": "low_price",
    "Open": "open_price",
    "Qty.": "volume",
    "Turnover": "turnover",
}


def to_mero_date(d: str) -> str:
    return d.replace("-", "/")


def is_trading_day(d: str) -> bool:
    # NEPSE trades Sun-Thu; skip Fri/Sat.
    return datetime.strptime(d, "%Y-%m-%d").weekday() not in (4, 5)


def date_range(from_date: str, to_date: str):
    cur = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")
    while cur <= end:
        yield cur.strftime("%Y-%m-%d")
        cur += timedelta(days=1)


def _find_price_table(tables: list[pd.DataFrame]) -> pd.DataFrame | None:
    for t in tables:
        cols = [str(c).strip().lower() for c in t.columns]
        if "symbol" in cols and ("ltp" in cols or "open" in cols or "high" in cols):
            return t
    if tables:
        return max(tables, key=len)
    return None


def fetch_day(d: str) -> pd.DataFrame:
    mero_date = to_mero_date(d)
    try:
        resp = requests.get(
            MERO_URL,
            headers=HEADERS,
            params={"date": mero_date},
            timeout=25,
        )
        resp.raise_for_status()
        tables = pd.read_html(StringIO(resp.text))
    except Exception as e:
        print(f"  x  {d} fetch error: {e}")
        return pd.DataFrame()

    table = _find_price_table(tables)
    if table is None:
        print(f"  x  {d} no table")
        return pd.DataFrame()

    df = table.rename(columns={k: v for k, v in COL_MAP.items() if k in table.columns})
    keep = [v for v in COL_MAP.values() if v in df.columns]
    df = df[keep].copy()

    if "symbol" not in df.columns or "close_price" not in df.columns:
        print(f"  x  {d} required columns missing")
        return pd.DataFrame()

    if "open_price" not in df.columns:
        df["open_price"] = df["close_price"]
    if "high_price" not in df.columns:
        df["high_price"] = df["close_price"]
    if "low_price" not in df.columns:
        df["low_price"] = df["close_price"]

    for col in ["close_price", "high_price", "low_price", "open_price", "volume", "turnover", "percent_change"]:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(",", "", regex=False)
                .str.replace("%", "", regex=False)
                .str.strip()
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()
    df["date"] = d

    df = df.dropna(subset=["symbol", "close_price"])
    df = df[df["symbol"].str.len() > 1]
    df = df[df["close_price"] > 0]
    df = df[~df["symbol"].isin(["SYMBOL", "NAN", "#"])]

    return df


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

        self.cur.execute(
            "SELECT session_id FROM trading_session WHERE trading_date=%s LIMIT 1",
            (trading_date,),
        )
        row = self.cur.fetchone()
        if row:
            sid = row[0]
        else:
            self.cur.execute(
                "INSERT INTO trading_session (trading_date, open_time, close_time, is_holiday, remarks) VALUES (%s,'11:00:00','15:00:00',0,'merolagani_fetch')",
                (trading_date,),
            )
            self.conn.commit()
            sid = self.cur.lastrowid

        self.session_cache[trading_date] = sid
        return sid

    def load_df(self, df: pd.DataFrame, trading_date: str, symbol_filter: str | None = None):
        if df.empty:
            return 0, 0

        sid = self.session_id(trading_date)
        loaded = 0
        dupes = 0

        for _, row in df.iterrows():
            sym = str(row.get("symbol", "")).upper().strip()
            if not sym:
                continue
            if symbol_filter and sym != symbol_filter.upper():
                continue

            cid = self.company_id(sym)
            if cid is None:
                continue

            o = self._num(row.get("open_price"))
            h = self._num(row.get("high_price"))
            l = self._num(row.get("low_price"))
            c = self._num(row.get("close_price"))
            v = self._int(row.get("volume"))
            t = self._num(row.get("turnover"))
            pct = self._num(row.get("percent_change"))

            prev_close = None
            if pct is not None and c is not None and pct != 0:
                try:
                    prev_close = round(c / (1 + pct / 100), 2)
                except Exception:
                    prev_close = None

            if None in (o, h, l, c, v) or c <= 0:
                continue
            if h < l:
                h, l = l, h

            try:
                self.cur.execute(
                    "INSERT INTO price_data (company_id, session_id, open_price, high_price, low_price, close_price, volume, turnover, prev_close, percent_change) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (cid, sid, o, h, l, c, v, t, prev_close, pct),
                )
                price_id = self.cur.lastrowid
                self.cur.execute(
                    "INSERT INTO data_source (price_id, source_name, entered_by, entry_method) VALUES (%s,'merolagani.com','batch_fetch','merolagani')",
                    (price_id,),
                )
                self.conn.commit()
                loaded += 1
            except (mysql.connector.IntegrityError, pymysql.err.IntegrityError):
                self.conn.rollback()
                dupes += 1
            except Exception:
                self.conn.rollback()

        return loaded, dupes

    @staticmethod
    def _num(v):
        try:
            return float(str(v).replace(",", "").strip())
        except Exception:
            return None

    @staticmethod
    def _int(v):
        try:
            return int(float(str(v).replace(",", "").strip()))
        except Exception:
            return None


def main():
    parser = argparse.ArgumentParser(description="NEPSE batch fetcher (merolagani)")
    parser.add_argument("--from", dest="from_date", help="Start date YYYY-MM-DD")
    parser.add_argument("--to", dest="to_date", help="End date YYYY-MM-DD")
    parser.add_argument("--days", type=int, help="Last N days")
    parser.add_argument("--symbol", default=None, help="Single company symbol")
    args = parser.parse_args()

    today = date.today().strftime("%Y-%m-%d")

    if args.days:
        to_date = today
        from_date = (date.today() - timedelta(days=args.days)).strftime("%Y-%m-%d")
    elif args.from_date and args.to_date:
        from_date = args.from_date
        to_date = args.to_date
    else:
        print("Usage: python scripts/batch_fetch.py --days 90")
        print("   or: python scripts/batch_fetch.py --from 2026-01-01 --to 2026-03-20")
        sys.exit(1)

    trading_days = [d for d in date_range(from_date, to_date) if is_trading_day(d)]

    print(f"NEPSE Batch Fetcher (merolagani)")
    print(f"Range: {from_date} -> {to_date}")
    if args.symbol:
        print(f"Symbol: {args.symbol.upper()}")
    print(f"Trading days to fetch: {len(trading_days)}")

    loader = Loader()
    total_loaded = 0
    total_dupes = 0
    failed_dates = []

    for idx, d in enumerate(trading_days, 1):
        print(f"[{idx:3d}/{len(trading_days)}] {d} ...", end=" ", flush=True)
        df = fetch_day(d)
        if df.empty:
            failed_dates.append(d)
            print("no data")
            time.sleep(0.8)
            continue

        loaded, dupes = loader.load_df(df, d, symbol_filter=args.symbol)
        total_loaded += loaded
        total_dupes += dupes

        sample_symbol = (args.symbol or "ADBL").upper()
        sample = df[df["symbol"] == sample_symbol]
        if not sample.empty:
            r = sample.iloc[0]
            print(
                f"ok {loaded} loaded ({dupes} dupes) "
                f"[{sample_symbol}: O={r.get('open_price', '-')}, H={r.get('high_price', '-')}, "
                f"L={r.get('low_price', '-')}, C={r.get('close_price', '-')}, V={r.get('volume', '-')}]"
            )
        else:
            print(f"ok {loaded} loaded ({dupes} dupes)")
        time.sleep(0.8)

    loader.close()

    print("DONE")
    print(f"Total loaded: {total_loaded}")
    print(f"Total dupes: {total_dupes}")
    if failed_dates:
        print(f"Failed dates: {len(failed_dates)}")


if __name__ == "__main__":
    main()
