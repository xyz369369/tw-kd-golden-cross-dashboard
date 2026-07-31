"""One-off repair: re-fetch TPEx (上櫃) history with the fixed endpoint and
overwrite the corrupted duplicate rows written by the original bootstrap.

Only touches market='TPEx' rows; TWSE rows are untouched.
"""
import sqlite3
from datetime import date, timedelta

import fetch_history as fh


def repair(days_back=65):
    conn = fh.init_db()
    today = date.today()
    fixed_days = 0
    total_rows = 0
    for i in range(days_back):
        d = today - timedelta(days=i)
        if d.weekday() >= 5:
            continue
        rows = fh.fetch_tpex(d)
        if rows:
            conn.executemany(
                "INSERT OR REPLACE INTO daily_prices (date,market,code,name,open,high,low,close,volume) VALUES (?,?,?,?,?,?,?,?,?)",
                rows,
            )
            conn.commit()
            fixed_days += 1
            total_rows += len(rows)
            print(d.isoformat(), "TPEx repaired:", len(rows), "rows")
        else:
            print(d.isoformat(), "no TPEx data (holiday/weekend/unavailable)")
        fh.time.sleep(0.4)
    print(f"Repaired {fixed_days} trading days, {total_rows} row-writes total")
    conn.close()


if __name__ == "__main__":
    repair()
