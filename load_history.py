"""
NEPSE Historical Loader
======================
Fetches OHLCV history from merolagani chart and synchronizes it to nepse_db.

Usage:
    python load_history.py --days 90
    python load_history.py --from 2025-01-01 --to 2026-03-20
    python load_history.py --from 2025-01-01 --symbol ADBL
    python load_history.py --symbol NABIL --days 180
"""

import argparse
import csv
import os
import sys
import time
from datetime import UTC, date, datetime, timedelta

import mysql.connector
import pymysql
import requests


DB = dict(
    host=os.getenv("NEPSE_DB_HOST") or os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("NEPSE_DB_PORT") or os.getenv("DB_PORT", "3306")),
    user=os.getenv("NEPSE_DB_USER") or os.getenv("DB_USER", "root"),
    password=os.getenv("NEPSE_DB_PASSWORD") or os.getenv("DB_PASS", ""),
    database=os.getenv("NEPSE_DB_NAME") or os.getenv("DB_NAME", "nepse_db"),
)

CHART_URL = (
    "https://www.merolagani.com/handlers/TechnicalChartHandler.ashx"
    "?type=get_advanced_chart&symbol={sym}&resolution=1D"
    "&rangeStartDate={fr}&rangeEndDate={to}"
    "&from=&isAdjust=1&currencyCode=NPR"
)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
        "Origin": "https://www.merolagani.com",
    }
)
SESSION_INIT = False


def to_ts(d: str) -> int:
    return int(datetime.strptime(d, "%Y-%m-%d").timestamp())


def today_iso() -> str:
    return date.today().strftime("%Y-%m-%d")


def ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")


def init_session(symbol: str):
    global SESSION_INIT
    if SESSION_INIT:
        return
    SESSION.headers["Referer"] = f"https://www.merolagani.com/CompanyDetail.aspx?symbol={symbol}"
    try:
        SESSION.get(f"https://www.merolagani.com/CompanyDetail.aspx?symbol={symbol}", timeout=15)
        SESSION_INIT = True
    except Exception:
        pass


def fetch_symbol_rows(symbol: str, from_ts: int, to_ts: int):
    init_session(symbol)
    SESSION.headers["Referer"] = f"https://www.merolagani.com/CompanyDetail.aspx?symbol={symbol}"

    try:
        res = SESSION.get(CHART_URL.format(sym=symbol, fr=from_ts, to=to_ts), timeout=25)
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        print(f"    fetch error: {e}")
        return []

    if data.get("s") != "ok" or not data.get("t"):
        return []

    rows = []
    seen = set()
    ts_list = data.get("t", [])
    o_list = data.get("o", [])
    h_list = data.get("h", [])
    l_list = data.get("l", [])
    c_list = data.get("c", [])
    v_list = data.get("v", [])

    for i, ts in enumerate(ts_list):
        try:
            day = datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d")
            if day in seen:
                continue
            seen.add(day)

            o = float(o_list[i])
            h = float(h_list[i])
            l = float(l_list[i])
            c = float(c_list[i])
            v = int(v_list[i])

            if c <= 0:
                continue
            if h < l:
                h, l = l, h

            rows.append(
                {
                    "date": day,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": v,
                }
            )
        except Exception:
            continue

    return rows


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
                "INSERT INTO trading_session (trading_date, open_time, close_time, is_holiday, remarks) VALUES (%s,'11:00:00','15:00:00',0,'merolagani_chart_api')",
                (trading_date,),
            )
            self.conn.commit()
            sid = self.cur.lastrowid

        self.session_cache[trading_date] = sid
        return sid

    def existing_dates(self, symbol: str, from_d: str, to_d: str):
        self.cur.execute(
            """SELECT DATE_FORMAT(t.trading_date,'%%Y-%%m-%%d')
               FROM price_data p
               JOIN company c ON p.company_id=c.company_id
               JOIN trading_session t ON p.session_id=t.session_id
               WHERE c.symbol=%s AND t.trading_date BETWEEN %s AND %s""",
            (symbol, from_d, to_d),
        )
        return {str(r[0]) for r in self.cur.fetchall()}

    def prev_close(self, company_id: int, d: str):
        self.cur.execute(
            """SELECT p.close_price FROM price_data p
               JOIN trading_session t ON p.session_id=t.session_id
               WHERE p.company_id=%s AND t.trading_date<%s
               ORDER BY t.trading_date DESC LIMIT 1""",
            (company_id, d),
        )
        row = self.cur.fetchone()
        return float(row[0]) if row else None

    def insert_rows(self, symbol: str, rows):
        loaded = 0
        dupes = 0

        cid = self.company_id(symbol)
        if not cid:
            return 0, len(rows)

        for row in rows:
            d = row["date"]
            sid = self.session_id(d)
            o = float(row["open"])
            h = float(row["high"])
            l = float(row["low"])
            c = float(row["close"])
            v = int(row["volume"])

            prev = self.prev_close(cid, d)
            pct = round((c - prev) / prev * 100, 2) if prev and prev > 0 else None

            try:
                self.cur.execute(
                    """INSERT INTO price_data
                       (company_id, session_id, open_price, high_price, low_price,
                        close_price, volume, prev_close, percent_change)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (cid, sid, o, h, l, c, v, prev, pct),
                )
                price_id = self.cur.lastrowid
                self.cur.execute(
                    "INSERT INTO data_source (price_id, source_name, entered_by, entry_method) VALUES (%s,'merolagani.com','load_history','chart_api')",
                    (price_id,),
                )
                self.conn.commit()
                loaded += 1
            except (mysql.connector.IntegrityError, pymysql.err.IntegrityError):
                self.conn.rollback()
                dupes += 1
            except Exception as e:
                self.conn.rollback()
                print(f"    DB error {symbol} {d}: {e}")

        return loaded, dupes

    def list_symbols_from_db(self):
        self.cur.execute("SELECT symbol FROM company WHERE is_active=1 ORDER BY symbol")
        rows = self.cur.fetchall()
        symbols = [str(r[0]).strip().upper() for r in rows if r and r[0]]
        return [s for s in symbols if s]


def list_symbols_from_csv() -> list[str]:
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nepse_data", "companies.csv")
    if not os.path.exists(csv_path):
        return []

    symbols = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            s = str(row.get("symbol", "")).strip().upper()
            if s:
                symbols.append(s)
    return symbols


def resolve_symbols(loader: Loader, symbol: str | None):
    if symbol:
        return [symbol.upper().strip()]

    from_db = loader.list_symbols_from_db()
    if from_db:
        return from_db

    from_csv = list_symbols_from_csv()
    if from_csv:
        return from_csv

    print("No symbols found. Add companies to DB first, or run with --symbol ADBL")
    return []


def main():
    ap = argparse.ArgumentParser(description="NEPSE historical loader from merolagani chart API")
    ap.add_argument("--from", dest="from_d")
    ap.add_argument("--to", dest="to_d")
    ap.add_argument("--days", type=int)
    ap.add_argument("--symbol", default=None)
    ap.add_argument("--all", action="store_true", help="Compatibility flag; all symbols are loaded when --symbol is omitted")
    args = ap.parse_args()

    to_d = args.to_d or today_iso()
    if args.from_d:
        from_d = args.from_d
    elif args.days:
        from_d = ago(args.days)
    else:
        from_d = ago(180)

    from_ts = to_ts(from_d)
    to_ts_exclusive = to_ts(to_d) + 86400

    loader = Loader()
    symbols = resolve_symbols(loader, args.symbol)
    if not symbols:
        loader.close()
        sys.exit(1)

    print(f"Range: {from_d} -> {to_d}")
    print(f"Symbols: {len(symbols)}")

    total_loaded = 0
    total_dupes = 0

    for idx, sym in enumerate(symbols, 1):
        prefix = f"[{idx:4d}/{len(symbols)}] {sym:<12}"
        existing = loader.existing_dates(sym, from_d, to_d)
        rows = fetch_symbol_rows(sym, from_ts, to_ts_exclusive)
        rows = [r for r in rows if from_d <= r["date"] <= to_d]

        if not rows:
            print(f"{prefix} no data")
            time.sleep(0.15)
            continue

        new_rows = [r for r in rows if r["date"] not in existing]
        if not new_rows:
            print(f"{prefix} up to date ({len(rows)} days)")
            time.sleep(0.05)
            continue

        loaded, dupes = loader.insert_rows(sym, new_rows)
        total_loaded += loaded
        total_dupes += dupes

        first = min(new_rows, key=lambda r: r["date"])
        last = max(new_rows, key=lambda r: r["date"])
        print(
            f"{prefix} +{loaded} rows "
            f"[{first['date']} C={first['close']} .. {last['date']} C={last['close']}]"
        )
        time.sleep(0.2)

    loader.close()
    print("DONE")
    print(f"Total loaded: {total_loaded}")
    print(f"Total dupes: {total_dupes}")


if __name__ == "__main__":
    main()
