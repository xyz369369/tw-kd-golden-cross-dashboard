"""Export full-market per-stock history (price / volume / MA20 / KD) for the
individual stock lookup feature. Produces a single docs/stocks_history.json
file (one commit-friendly file instead of thousands of tiny per-stock files).
"""
import sqlite3, json, os
import pandas as pd
from datetime import datetime

from compute_screen import compute_kd  # reuse the exact same KD(9,3,3) logic

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE_DIR, "data", "tw_stocks.db")
OUT_JSON = os.path.join(BASE_DIR, "docs", "stocks_history.json")

KEEP_TRADING_DAYS = 60  # ~90 calendar days of pruning already caps this naturally


def load_data():
    conn = sqlite3.connect(DB)
    df = pd.read_sql_query(
        "SELECT date, market, code, name, open, high, low, close, volume FROM daily_prices ORDER BY code, date",
        conn,
    )
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
