import sqlite3, json, os
import pandas as pd
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
DB = os.path.join(BASE_DIR, "data", "tw_stocks.db")
OUT_JSON = os.path.join(BASE_DIR, "docs", "data.json")
HISTORY_JSON = os.path.join(BASE_DIR, "docs", "history.json")


def _col_exists(conn, table, col):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())

def load_data():
    conn = sqlite3.connect(DB)
    base_cols = "date, market, code, name, open, high, low, close, volume"
    extra_cols = []
    for col in ["turnover_rate", "foreign_net", "trust_net", "dealer_net"]:
        if _col_exists(conn, "daily_prices", col):
            extra_cols.append(col)
        else:
            extra_cols.append(f"NULL AS {col}")
    sql = f"SELECT {base_cols}, {', '.join(extra_cols)} FROM daily_prices ORDER BY code, date"
    df = pd.read_sql_query(sql, conn)
    conn.close()
    return df

def compute_kd(g, n=9, k_smooth=3, d_smooth=3):
    low_n = g["low"].rolling(n, min_periods=n).min()
    high_n = g["high"].rolling(n, min_periods=n).max()
    rsv = (g["close"] - low_n) / (high_n - low_n) * 100
    rsv = rsv.fillna(50)
    k_vals = []
    d_vals = []
    k_prev, d_prev = 50.0, 50.0
    for r in rsv:
        k_cur = k_prev * (k_smooth - 1) / k_smooth + r / k_smooth
        d_cur = d_prev * (d_smooth - 1) / d_smooth + k_cur / d_smooth
        k_vals.append(k_cur)
        d_vals.append(d_cur)
        k_prev, d_prev = k_cur, d_cur
    g["K"] = k_vals
    g["D"] = d_vals
    return g

def screen():
    df = load_data()
    df = df.dropna(subset=["close", "volume", "high", "low"])
    results = []
    twse_dates = df.loc[df["market"] == "TWSE", "date"]
    latest_date = twse_dates.max() if len(twse_dates) else df["date"].max()
    df = df[df["date"] <= latest_date]

    for code, g in df.groupby("code"):
        g = g.sort_values("date").reset_index(drop=True)
        if len(g) < 21:
            continue
        g["ma20_close"] = g["close"].rolling(20).mean()
        g["ma20_vol"] = g["volume"].rolling(20).mean()
        g = compute_kd(g)
        last = g.iloc[-1]
        prev = g.iloc[-2]
        if last["date"] != latest_date:
            continue

        cond_price = last["close"] < 150
        cond_ma_price = last["close"] > last["ma20_close"]
        cond_vol_min = last["volume"] > 1000000  # 成交量 > 1,000 張 (1000000股)
        cond_ma_vol = last["volume"] > last["ma20_vol"]
        golden_cross = (prev["K"] <= prev["D"]) and (last["K"] > last["D"])

        if cond_price and cond_ma_price and cond_vol_min and cond_ma_vol and golden_cross:
            results.append({
                "code": code,
                "name": last["name"],
                "market": last["market"],
                "date": last["date"],
                "close": round(float(last["close"]), 2),
                "ma20_close": round(float(last["ma20_close"]), 2),
                "volume": int(last["volume"]),
                "ma20_volume": int(last["ma20_vol"]),
                "turnover_rate": round(float(last["turnover_rate"]), 2) if "turnover_rate" in last and pd.notna(last["turnover_rate"]) else None,
                "foreign_net": int(last["foreign_net"]) if "foreign_net" in last and pd.notna(last["foreign_net"]) else 0,
                "trust_net": int(last["trust_net"]) if "trust_net" in last and pd.notna(last["trust_net"]) else 0,
                "dealer_net": int(last["dealer_net"]) if "dealer_net" in last and pd.notna(last["dealer_net"]) else 0,
                "K": round(float(last["K"]), 2),
                "D": round(float(last["D"]), 2),
                "prev_K": round(float(prev["K"]), 2),
                "prev_D": round(float(prev["D"]), 2),
            })

    results.sort(key=lambda x: x["close"])

    try:
        with open(OUT_JSON, "r", encoding="utf-8") as f:
            prev_run = json.load(f)
        prev_codes = set(m["code"] for m in prev_run.get("matches", []))
    except FileNotFoundError:
        prev_codes = set()

    new_codes = [m["code"] for m in results if m["code"] not in prev_codes]

    output = {
        "generated_at": datetime.now().isoformat(),
        "data_date": latest_date,
        "criteria": "股價<150, 收盤價>MA20, 成交量>1000張, 成交量>量MA20, KD(9,3,3)黃金交叉",
        "match_count": len(results),
        "new_matches_today": new_codes,
        "matches": results,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    try:
        with open(HISTORY_JSON, "r", encoding="utf-8") as f:
            history = json.load(f)
    except FileNotFoundError:
        history = []
    history.append({
        "date": latest_date,
        "match_count": len(results),
        "codes": [m["code"] for m in results],
        "new_codes": new_codes,
    })
    # keep history log from growing unbounded
    history = history[-180:]
    with open(HISTORY_JSON, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"Data date: {latest_date}, matches: {len(results)}, new today: {new_codes}")
    return output

if __name__ == "__main__":
    screen()
