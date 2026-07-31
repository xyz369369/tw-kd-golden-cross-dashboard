import sqlite3, requests, time, json, re, os
from functools import lru_cache
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
DB = os.path.join(BASE_DIR, "data", "tw_stocks.db")
STOCK_CODE_RE = re.compile(r"^\d{4,5}[A-Z]?$")  # 4-5 digit codes with optional letter (for ETFs like 00991A)

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
            foreign_buy REAL, foreign_sell REAL, foreign_net REAL,
            trust_buy REAL, trust_sell REAL, trust_net REAL,
            dealer_buy REAL, dealer_sell REAL, dealer_net REAL,
            turnover_rate REAL,
            margin_balance REAL, margin_buy REAL, margin_sell REAL,
            short_balance REAL, short_buy REAL, short_sell REAL,
            PRIMARY KEY(date, code)
        )
    """)
    # 為舊資料庫新增欄位 (若不存在)
    for col, typ in [
        ("turnover_rate", "REAL"),
        ("margin_balance", "REAL"), ("margin_buy", "REAL"), ("margin_sell", "REAL"),
        ("short_balance", "REAL"), ("short_buy", "REAL"), ("short_sell", "REAL"),
    ]:
        try:
            conn.execute(f"ALTER TABLE daily_prices ADD COLUMN {col} {typ}")
        except Exception:
            pass
    conn.commit()
    return conn


@lru_cache(maxsize=1)
def fetch_twse_shares_map() -> dict:
    """抓取 TWSE 公司基本資料中的已發行普通股數。"""
    url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
    try:
        rows = requests.get(url, timeout=30).json()
    except Exception as e:
        print("TWSE company shares err", e)
        return {}

    result = {}
    for row in rows:
        code = str(row.get("公司代號", "")).strip()
        if not STOCK_CODE_RE.match(code):
            continue
        shares = to_float(row.get("已發行普通股數或TDR原股發行股數"))
        if shares and shares > 0:
            result[code] = shares
    return result

# ── TWSE 官方資料：一次抓一天全市場 ─────────────────────────────────────────

def fetch_twse_instit(d: date) -> dict:
    """抓取 TWSE 三大法人買賣超（T86，全市場）。回傳 {code: {foreign_net, trust_net, dealer_net, ...}}"""
    ymd = d.strftime("%Y%m%d")
    url = f"https://www.twse.com.tw/fund/T86?response=json&date={ymd}&selectType=ALL"
    try:
        r = requests.get(url, timeout=20)
        j = r.json()
    except Exception as e:
        print(f"TWSE T86 err {ymd}", e)
        return {}
    if j.get("stat") not in ("OK", "ok"):
        return {}

    result = {}
    tables = j.get("tables") or []
    target = None
    for t in tables:
        flds = t.get("fields") or []
        if flds and len(flds) >= 3:
            target = t
            break
    if not target:
        # 非 tables 格式，直接用 fields/data
        target = j
    flds = target.get("fields") or []
    # 欄位順序（繁中可能亂碼，用位置）:
    # 0:代號 1:名稱 2:外資買進 3:外資賣出 4:外資買賣超 5:外資自營買進 6:外資自營賣出 7:外資自營買賣超
    # 8:投信買進 9:投信賣出 10:投信買賣超 11:自營商買賣超 12:自營商買進(自) 13:自營商賣出(自) 14:自營商買賣超(自)
    # 15:自營商買進(避) 16:自營商賣出(避) 17:自營商買賣超(避) 18:三大法人買賣超
    for row in target.get("data", []):
        if len(row) < 5:
            continue
        code = str(row[0]).strip()
        if not STOCK_CODE_RE.match(code):
            continue
        result[code] = {
            "foreign_buy":  to_float(row[2]) or 0,
            "foreign_sell": to_float(row[3]) or 0,
            "foreign_net":  to_float(row[4]) or 0,
            "trust_buy":    to_float(row[8]) or 0 if len(row) > 8 else 0,
            "trust_sell":   to_float(row[9]) or 0 if len(row) > 9 else 0,
            "trust_net":    to_float(row[10]) or 0 if len(row) > 10 else 0,
            "dealer_buy":   to_float(row[12]) or 0 if len(row) > 12 else 0,
            "dealer_sell":  to_float(row[13]) or 0 if len(row) > 13 else 0,
            "dealer_net":   to_float(row[11]) or 0 if len(row) > 11 else 0,
        }
    return result


def fetch_twse_turnover(d: date, twse_rows: list[tuple]) -> dict:
    """以成交股數 / 已發行普通股數估算 TWSE 換手率(%)."""
    shares_map = fetch_twse_shares_map()
    if not shares_map:
        return {}

    result = {}
    for row in twse_rows:
        code = row[2]
        volume = row[8]
        shares = shares_map.get(code)
        if shares and volume is not None:
            result[code] = round(float(volume) / float(shares) * 100, 4)
    return result


def fetch_twse_margin(d: date) -> dict:
    """抓取 TWSE 融資融券（MI_MARGN，全市場）。回傳 {code: {margin_balance, margin_buy, margin_sell, short_balance, ...}}"""
    ymd = d.strftime("%Y%m%d")
    url = f"https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date={ymd}&selectType=ALL"
    try:
        r = requests.get(url, timeout=30)
        j = r.json()
    except Exception as e:
        print(f"TWSE MI_MARGN err {ymd}", e)
        return {}
    if j.get("stat") not in ("OK", "ok"):
        return {}

    result = {}
    tables = j.get("tables") or []
    # table index=1 為個股明細
    # 欄位: 0:代號 1:名稱 | 融資: 2:買進 3:賣出 4:現償 5:前餘額 6:今餘額 7:限額 | 融券: 8:賣出 9:買進 10:現償 11:前餘額 12:今餘額 13:限額 | 14:資券相抵 15:備註
    for t in tables:
        rows = t.get("data", [])
        if not rows or len(rows[0]) < 10:
            continue
        for row in rows:
            code = str(row[0]).strip()
            if not STOCK_CODE_RE.match(code):
                continue
            result[code] = {
                "margin_buy":     to_float(row[2]) or 0,   # 融資買進(張)
                "margin_sell":    to_float(row[3]) or 0,   # 融資賣出(張)
                "margin_balance": to_float(row[6]) or 0,   # 融資今日餘額(張)
                "short_sell":     to_float(row[8]) or 0,   # 融券賣出(張)
                "short_buy":      to_float(row[9]) or 0,   # 融券買進(張)
                "short_balance":  to_float(row[12]) or 0,  # 融券今日餘額(張)
            }
        if result:
            break
    return result


def fetch_tpex_instit(d: date) -> dict:
    """抓取 TPEx 三大法人買賣超。回傳 {code: {foreign_net, trust_net, dealer_net, ...}}"""
    dstr = f"{d.year - 1911:03d}/{d.month:02d}/{d.day:02d}"
    url = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php"
    try:
        r = requests.get(url, params={"l": "zh-tw", "o": "json", "d": dstr, "s": "0,asc"}, timeout=30, verify=False)
        j = r.json()
    except Exception as e:
        print(f"TPEx instit err {dstr}", e)
        return {}
    if j.get("stat") not in ("ok", "OK"):
        return {}

    result = {}
    tables = j.get("tables") or []
    if not tables:
        return {}

    for row in tables[0].get("data", []):
        if len(row) < 24:
            continue
        code = str(row[0]).strip()
        if not STOCK_CODE_RE.match(code):
            continue
        result[code] = {
            "foreign_buy":  to_float(row[8]) or 0,
            "foreign_sell": to_float(row[9]) or 0,
            "foreign_net":  to_float(row[10]) or 0,
            "trust_buy":    to_float(row[11]) or 0,
            "trust_sell":   to_float(row[12]) or 0,
            "trust_net":    to_float(row[13]) or 0,
            "dealer_buy":   to_float(row[20]) or 0,
            "dealer_sell":  to_float(row[21]) or 0,
            "dealer_net":   to_float(row[22]) or 0,
        }
    return result


def fetch_tpex_margin(d: date) -> dict:
    """抓取 TPEx 融資融券餘額。回傳 {code: {margin_balance, margin_buy, margin_sell, short_balance, ...}}"""
    dstr = f"{d.year:04d}/{d.month:02d}/{d.day:02d}"
    url = "https://www.tpex.org.tw/www/zh-tw/margin/balance"
    try:
        r = requests.get(url, params={"date": dstr, "response": "json"}, timeout=30, verify=False)
        j = r.json()
    except Exception as e:
        print(f"TPEx margin err {dstr}", e)
        return {}

    tables = j.get("tables") or []
    if not tables:
        return {}

    result = {}
    for row in tables[0].get("data", []):
        if len(row) < 15:
            continue
        code = str(row[0]).strip()
        if not STOCK_CODE_RE.match(code):
            continue
        result[code] = {
            "margin_buy":     to_float(row[3]) or 0,
            "margin_sell":    to_float(row[4]) or 0,
            "margin_balance": to_float(row[6]) or 0,
            "short_sell":     to_float(row[11]) or 0,
            "short_buy":      to_float(row[12]) or 0,
            "short_balance":  to_float(row[14]) or 0,
        }
    return result


def fetch_tpex_turnover(d: date) -> dict:
    """以成交股數 / 發行股數估算 TPEx 換手率(%)."""
    dstr = f"{d.year:04d}/{d.month:02d}/{d.day:02d}"
    url = "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes"
    try:
        r = requests.get(url, params={"date": dstr, "response": "json"}, timeout=20, verify=False)
        j = r.json()
    except Exception as e:
        print("TPEx turnover err", dstr, e)
        return {}
    if j.get("date") and j["date"] != d.strftime("%Y%m%d"):
        return {}

    result = {}
    for t in j.get("tables", []):
        fields = t.get("fields") or []
        if fields and fields[0] == "代號":
            for row in t.get("data", []):
                if len(row) < 16:
                    continue
                code = str(row[0]).strip()
                if not STOCK_CODE_RE.match(code):
                    continue
                volume = to_float(row[8])
                shares = to_float(row[15])
                if volume is not None and shares and shares > 0:
                    result[code] = round(float(volume) / float(shares) * 100, 4)
            break
    return result


# ── 價格資料（與原版相同）────────────────────────────────────────────────────

def fetch_twse(d: date):
    ymd = d.strftime("%Y%m%d")
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={ymd}&type=ALLBUT0999"
    try:
        r = requests.get(url, timeout=15)
        j = r.json()
    except Exception as e:
        print("TWSE price err", ymd, e)
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
    # NOTE: 使用正確端點 (afterTrading/dailyQuotes)，會驗證日期正確性
    dstr = f"{d.year:04d}/{d.month:02d}/{d.day:02d}"
    url = "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes"
    j = None
    for attempt in range(3):
        try:
            r = requests.get(url, params={"date": dstr, "response": "json"}, timeout=20, verify=False)
            j = r.json()
            break
        except Exception as e:
            print("TPEx price err", dstr, e, f"(attempt {attempt + 1}/3)")
            time.sleep(1.5)
    if j is None:
        return []
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
    # 1. 抓價格
    twse_rows = fetch_twse(d)
    tpex_rows = fetch_tpex(d)
    price_rows = twse_rows + tpex_rows
    if not price_rows:
        return 0, 0

    # 2. 抓法人資料（TWSE 用官方 T86，TPEx 嘗試抓）
    twse_instit = fetch_twse_instit(d)
    time.sleep(0.3)
    tpex_instit = fetch_tpex_instit(d)
    time.sleep(0.3)

    # 3. 抓換手率
    twse_turnover = fetch_twse_turnover(d, twse_rows)
    time.sleep(0.3)
    tpex_turnover = fetch_tpex_turnover(d)
    time.sleep(0.3)

    # 4. 抓融資融券
    twse_margin = fetch_twse_margin(d)
    time.sleep(0.3)
    tpex_margin = fetch_tpex_margin(d)
    time.sleep(0.3)

    # 5. 合併並寫入
    final_rows = []
    for row in price_rows:
        date_str, market, code = row[0], row[1], row[2]
        instit_map = twse_instit if market == "TWSE" else tpex_instit
        turnover_map = twse_turnover if market == "TWSE" else tpex_turnover
        margin_map = twse_margin if market == "TWSE" else tpex_margin

        inst = instit_map.get(code, {})
        turnover = turnover_map.get(code, None)
        mgn  = margin_map.get(code, {})

        fb = inst.get("foreign_buy", 0)
        fs = inst.get("foreign_sell", 0)
        fn = inst.get("foreign_net", fb - fs)
        tb = inst.get("trust_buy", 0)
        ts = inst.get("trust_sell", 0)
        tn = inst.get("trust_net", tb - ts)
        db = inst.get("dealer_buy", 0)
        ds = inst.get("dealer_sell", 0)
        dn = inst.get("dealer_net", db - ds)

        mb   = mgn.get("margin_buy", None)
        ms   = mgn.get("margin_sell", None)
        mbal = mgn.get("margin_balance", None)
        sb   = mgn.get("short_buy", None)
        ss   = mgn.get("short_sell", None)
        sbal = mgn.get("short_balance", None)

        final_rows.append(row + (fb, fs, fn, tb, ts, tn, db, ds, dn, turnover, mbal, mb, ms, sbal, sb, ss))

    conn.executemany(
        """INSERT OR REPLACE INTO daily_prices
        (date,market,code,name,open,high,low,close,volume,
         foreign_buy,foreign_sell,foreign_net,
         trust_buy,trust_sell,trust_net,
         dealer_buy,dealer_sell,dealer_net,
         turnover_rate,
         margin_balance,margin_buy,margin_sell,
         short_balance,short_buy,short_sell)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        final_rows,
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
        time.sleep(0.5)
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
