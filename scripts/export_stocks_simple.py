"""Export full-market per-stock history (price / volume / MA20 / KD / institutional / margin)
for the individual stock lookup feature. Produces a single docs/stocks_history.json file.
This version uses only sqlite3 and json, avoiding pandas/numpy dependency issues.
"""
import sqlite3, json, os
from datetime import datetime
from collections import defaultdict

# KD computation without pandas/numpy dependency
def compute_kd_simple(rows, n=9, k_smooth=3, d_smooth=3):
    """Compute KD(9,3,3) indicator for a list of row dicts."""
    k_vals = []
    d_vals = []
    k_prev, d_prev = 50.0, 50.0
    
    for i in range(len(rows)):
        # Get last n days
        start = max(0, i - n + 1)
        period_rows = rows[start:i+1]
        
        if len(period_rows) < n:
            # Not enough data, use previous values
            k_vals.append(k_prev)
            d_vals.append(d_prev)
            continue
        
        # Calculate RSV
        lows = [r['low'] for r in period_rows]
        highs = [r['high'] for r in period_rows]
        close = rows[i]['close']
        
        low_n = min(lows)
        high_n = max(highs)
        
        if high_n == low_n:
            rsv = 50
        else:
            rsv = (close - low_n) / (high_n - low_n) * 100
        
        # Calculate K and D
        k_cur = k_prev * (k_smooth - 1) / k_smooth + rsv / k_smooth
        d_cur = d_prev * (d_smooth - 1) / d_smooth + k_cur / d_smooth
        
        k_vals.append(k_cur)
        d_vals.append(d_cur)
        k_prev, d_prev = k_cur, d_cur
    
    # Add K and D to rows
    result = []
    for i, row in enumerate(rows):
        result.append({
            **row,
            'K': k_vals[i],
            'D': d_vals[i]
        })
    return result

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
    cursor = conn.execute(sql)
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    conn.close()
    
    # Convert to list of dicts
    data = []
    for row in rows:
        data.append(dict(zip(columns, row)))
    return data


def compute_rolling(data, col, window=20):
    """Simple rolling mean calculation."""
    result = []
    for i in range(len(data)):
        start = max(0, i - window + 1)
        values = [d[col] for d in data[start:i+1] if d[col] is not None]
        if values:
            result.append(sum(values) / len(values))
        else:
            result.append(None)
    return result


def export_all():
    data = load_data()
    
    # Group by code
    stocks_by_code = defaultdict(list)
    for row in data:
        if row['close'] is None or row['volume'] is None or row['high'] is None or row['low'] is None:
            continue
        stocks_by_code[row['code']].append(row)
    
    stocks = {}
    stock_list = []

    for code, rows in stocks_by_code.items():
        rows.sort(key=lambda x: x['date'])
        if len(rows) < 2:
            continue
        
        # Compute MA20
        close_values = [r['close'] for r in rows]
        volume_values = [r['volume'] for r in rows]
        
        ma20_close = compute_rolling(rows, 'close', 20)
        ma20_volume = compute_rolling(rows, 'volume', 20)
        
        # Add MA20 to rows for KD computation
        for i, row in enumerate(rows):
            row['ma20_close'] = ma20_close[i]
            row['ma20_volume'] = ma20_volume[i]
        
        # Compute KD using the local function
        kd_data = compute_kd_simple(rows)
        
        # Keep only last KEEP_TRADING_DAYS
        rows = rows[-KEEP_TRADING_DAYS:]
        kd_data = kd_data[-KEEP_TRADING_DAYS:]
        
        name = rows[-1]['name']
        market = rows[-1]['market']
        
        def safe_list(col, is_int=False):
            """Extract column values from rows."""
            result = []
            for r in rows:
                val = r.get(col)
                if val is None:
                    result.append(0 if is_int else None)
                else:
                    result.append(int(val) if is_int else round(float(val), 2))
            return result

        stocks[code] = {
            "name": name,
            "market": market,
            "dates": [r['date'] for r in rows],
            "close": [round(float(r['close']), 2) for r in rows],
            "volume": [int(r['volume']) for r in rows],
            "ma20_close": [round(float(r['ma20_close']), 2) for r in rows],
            "ma20_volume": [int(r['ma20_volume']) for r in rows],
            "K": [round(float(k['K']), 2) for k in kd_data],
            "D": [round(float(k['D']), 2) for k in kd_data],
            # 三大法人（股）
            "foreign_net": safe_list("foreign_net", is_int=True),
            "trust_net":   safe_list("trust_net", is_int=True),
            "dealer_net":  safe_list("dealer_net", is_int=True),
            # 換手率 (%)
            "turnover_rate": safe_list("turnover_rate"),
            # 融資（張）
            "margin_balance": safe_list("margin_balance", is_int=True),
            "margin_buy":     safe_list("margin_buy", is_int=True),
            "margin_sell":    safe_list("margin_sell", is_int=True),
            # 融券（張）
            "short_balance": safe_list("short_balance", is_int=True),
            "short_buy":     safe_list("short_buy", is_int=True),
            "short_sell":    safe_list("short_sell", is_int=True),
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
