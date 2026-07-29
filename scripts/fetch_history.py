import sqlite3, requests, time, json, re, os
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
DB = os.path.join(BASE_DIR, "data", "tw_stocks.db")
STOCK_CODE_RE = re.compile(r"^[1-9]\d{3}$")  # normal 4-digit common stocks, excludes 00xx ETFs

def to_float(x):
    if x is None:
        return None
    s = str(x).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None

def init_db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_prices (
            date TEXT, market TEXT, code TEXT, name TEXT,
            open REAL, high REAL, low REAL, close REAL, volume REAL,
            PRIMARY KEY(date, code)
        )
    """)
    conn.commit()
    return conn

def fetch_twse(d: date):
    ymd = d.strftime("%Y%m%d")
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={ymd}&type=ALLBUT0999"
    try:
        r = requests.get(url, timeout=15)
        j = r.json()
    except Exception as e:
        print("TWSE err", ymd, e)
        return []
    if j.get("stat") not in ("OK", "ok"):
        return []
    rows_out = []
    for t in j.get("tables", []):
        fields = t.get("fields") or []
        if fields and fields[0] == "證券代號":
            idx = {f: i for i, f in enumerate(fields)}
            for row in t.get("data", []):
                code = row[idx["證券代號"]].strip()
                if not STOCK_CODE_RE.match(code):
                    continue
                name = row[idx["證券名稱"]].strip()
                o = to_float(row[idx["開盤價"]])
                h = to_float(row[idx["最高價"]])
                l = to_float(row[idx["最低價"]])
                c = to_float(row[idx["收盤價"]])
                v = to_float(row[idx["成交股數"]])
                if c is None or v is None:
                    continue
                rows_out.append((d.isoformat(), "TWSE", code, name, o, h, l, c, v))
            break
    return rows_out

def fetch_tpex(d: date):
    # NOTE: the legacy endpoint below (stk_quote_result.php with an ROC-year
    # "d=115/07/28"-style date) silently IGNORES the requested date and always
    # returns the latest trading day's snapshot. Discovered 2026-07-29: this had
    # been corrupting every TPEx (上櫃) stock's stored history with the same
    # duplicated values across all dates ever since the initial bootstrap.
    # The current working endpoint is the newer "www/zh-tw/afterTrading" one,
    # which correctly honors a plain YYYY/MM/DD `date` param and echoes back
    # the actual date served in its "date" response field.
    dstr = f"{d.year:04d}/{d.month:02d}/{d.day:02d}"
    url = "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes"
    j = None
    for attempt in range(3):
        try:
            r = requests.get(url, params={"date": dstr, "response": "json"}, timeout=20)
            j = r.json()
            break
        except Exception as e:
            print("TPEx err", dstr, e, f"(attempt {attempt + 1}/3)")
            time.sleep(1.5)
    if j is None:
        return []
    # Sanity check: the response must actually echo back the requested date.
    if j.get("date") and j["date"] != d.strftime("%Y%m%d"):
        print("TPEx date mismatch, skipping", dstr, "got", j.get("date"))
        return []
    rows_out = []
    for t in j.get("tables", []):
        fields = t.get("fields") or []
        if fields and fields[0] == "代號":
            idx = {f: i for i, f in enumerate(fields)}
            for row in t.get("data", []):
                code = row[idx["代號"]].strip()
                if not STOCK_CODE_RE.match(code):
                    continue
                name = row[idx["名稱"]].strip()
                o = to_float(row[idx["開盤"]])
                h = to_float(row[idx["最高"]])
                l = to_float(row[idx["最低"]])
                c = to_float(row[idx["收盤"]])
                v = to_float(row[idx["成交股數"]])
                if c is None or v is None:
                    continue
                rows_out.append((d.isoformat(), "TPEx", code, name, o, h, l, c, v))
            break
    return rows_out

def upsert_day(conn, d: date):
    twse_rows = fetch_twse(d)
    tpex_rows = fetch_tpex(d)
    rows = twse_rows + tpex_rows
    if rows:
        conn.executemany(
            "INSERT OR REPLACE INTO daily_prices (date,market,code,name,open,high,low,close,volume) VALUES (?,?,?,?,?,?,?,?,?)",
            rows,
        )
        conn.commit()
    return len(twse_rows), len(tpex_rows)

def bootstrap(days_back=55):
    conn = init_db()
    today = date.today()
    total_days = 0
    for i in range(days_back):
        d = today - timedelta(days=i)
        if d.weekday() >= 5:
            continue
        twn, tpn = upsert_day(conn, d)
        if twn or tpn:
            total_days += 1
            print(d.isoformat(), "TWSE:", twn, "TPEx:", tpn)
        else:
            print(d.isoformat(), "no data (holiday/weekend)")
        time.sleep(0.3)
    print("Bootstrapped trading days with data:", total_days)

def prune(keep_days=90):
    """Keep only the most recent keep_days calendar days of rows so the DB (and repo) stay small."""
    cutoff = (date.today() - timedelta(days=keep_days)).isoformat()
    conn = sqlite3.connect(DB)
    conn.execute("DELETE FROM daily_prices WHERE date < ?", (cutoff,))
    conn.commit()
    conn.execute("VACUUM")
    conn.close()

if __name__ == "__main__":
    bootstrap(days_back=55)
