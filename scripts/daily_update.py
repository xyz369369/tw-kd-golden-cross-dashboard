"""
Runs inside GitHub Actions (or locally) to:
1. Backfill any missing trading days (incl. re-fetching the last stored date,
   in case TPEx had only partial/intraday data when it was previously fetched).
2. Recompute the KD/MA20 screen and write docs/data.json + docs/history.json.
3. Prune old rows so the SQLite DB (committed to the repo) stays small.

No Perplexity-specific tooling here — pure Python + requests + pandas so it
runs for free on GitHub Actions.
"""
import sqlite3
import os
from datetime import date, timedelta

import fetch_history as fh
import compute_screen as cs


def backfill_missing():
    conn = fh.init_db()
    cur = conn.execute("SELECT MAX(date) FROM daily_prices")
    row = cur.fetchone()
    last_date = row[0]

    if last_date is None:
        print("No existing data — bootstrapping last 55 days")
        conn.close()
        fh.bootstrap(days_back=55)
        return

    from datetime import datetime as dt
    start = dt.strptime(last_date, "%Y-%m-%d").date()
    today = date.today()

    fetched_days = []
    d = start
    while d <= today:
        if d.weekday() < 5:  # skip weekends
            twn, tpn = fh.upsert_day(conn, d)
            if twn or tpn:
                fetched_days.append(d.isoformat())
                print(d.isoformat(), "TWSE:", twn, "TPEx:", tpn)
        d += timedelta(days=1)
    conn.close()
    return fetched_days


if __name__ == "__main__":
    fetched = backfill_missing() or []
    result = cs.screen()
    fh.prune(keep_days=90)
    print("FETCHED_DAYS:", fetched)
    print("MATCH_COUNT:", result["match_count"])
    print("NEW_MATCHES_TODAY:", result["new_matches_today"])
