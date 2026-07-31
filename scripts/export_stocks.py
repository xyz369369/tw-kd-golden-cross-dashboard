"""Export full-market per-stock history (price / volume / MA20 / KD / institutional / margin)
for the individual stock lookup feature. Produces a single docs/stocks_history.json file.
"""
import sqlite3, json, os
import pandas as pd
from datetime import datetime

from compute_screen import compute_kd  # reuse the exact same KD(9,3,3) logic

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE_DIR, "data", "tw_stocks.db")
OUT_JSON = os.path.join(BASE_DIR, "docs", "stocks_history.json")

KEEP_TRADING_DAYS = 60  # ~90 calendar days


def _col_exists(conn, table, col):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def load_data():
    conn = sqlite3.connect(DB)
    # 動態組裝 SELECT，讓舊版資料庫也能執行
    base_cols = "date, market, code, name, open, high, low, close, volume, foreign_net, trust_net, dealer_net"
    extra_cols = []
    for col in ["turnover_rate", "margin_balance", "margin_buy", "margin_sell",
                "short_balance", "short_buy", "short_sell"]:
        if _col_exists(conn, "daily_prices", col):
            extra_cols.append(col)
        else:
            extra_cols.append(f"NULL AS {col}")
    sql = f"SELECT {base_cols}, {', '.join(extra_cols)} FROM daily_prices ORDER BY code, date"
    df = pd.read_sql_query(sql, conn)
    conn.close()
    return df


def export_all():
    df = load_data()
    df = df.dropna(subset=["close", "volume", "high", "low"])

    stocks = {}
    stock_list = []

    for code, g in df.groupby("code"):
        g = g.sort_values("date").reset_index(drop=True)
        if len(g) < 2:
            continue
        g["ma20_close"] = g["close"].rolling(20, min_periods=1).mean()
        g["ma20_volume"] = g["volume"].rolling(20, min_periods=1).mean()
        g = compute_kd(g)
        g = g.tail(KEEP_TRADING_DAYS)

        name = g["name"].iloc[-1]
        market = g["market"].iloc[-1]

        def safe_int_list(col):
            """將欄位轉為整數列表，None/NaN 填 0。"""
            if col not in g.columns:
                return [0] * len(g)
            return [int(x) if pd.notna(x) else 0 for x in g[col]]

        def safe_float_list(col, decimals=2):
            """將欄位轉為浮點數列表，None/NaN 填 None。"""
            if col not in g.columns:
                return [None] * len(g)
            return [round(float(x), decimals) if pd.notna(x) else None for x in g[col]]

        stocks[code] = {
            "name": name,
            "market": market,
            "dates": g["date"].tolist(),
            "close": [round(float(x), 2) for x in g["close"]],
            "volume": [int(x) for x in g["volume"]],
            "ma20_close": [round(float(x), 2) for x in g["ma20_close"]],
            "ma20_volume": [int(x) for x in g["ma20_volume"]],
            "K": [round(float(x), 2) for x in g["K"]],
            "D": [round(float(x), 2) for x in g["D"]],
            # 三大法人（股）
            "foreign_net": safe_int_list("foreign_net"),
            "trust_net":   safe_int_list("trust_net"),
            "dealer_net":  safe_int_list("dealer_net"),
            # 換手率 (%)
            "turnover_rate": safe_float_list("turnover_rate"),
            # 融資（張）
            "margin_balance": safe_int_list("margin_balance"),
            "margin_buy":     safe_int_list("margin_buy"),
            "margin_sell":    safe_int_list("margin_sell"),
            # 融券（張）
            "short_balance": safe_int_list("short_balance"),
            "short_buy":     safe_int_list("short_buy"),
            "short_sell":    safe_int_list("short_sell"),
        }
        stock_list.append({"code": code, "name": name, "market": market})

    stock_list.sort(key=lambda x: x["code"])

    output = {
        "generated_at": datetime.now().isoformat(),
        "count": len(stock_list),
        "list": stock_list,
        "stocks": stocks,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Exported {len(stock_list)} stocks to {OUT_JSON}")
    return output


if __name__ == "__main__":
    export_all()
