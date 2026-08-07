import sqlite3
conn = sqlite3.connect(r'd:\PYTHON\股巿開發工具\data\tw_stocks.db')
cursor = conn.cursor()

# 檢查融資融券資料的最新日期
cursor.execute('SELECT MAX(date) FROM daily_prices WHERE margin_balance IS NOT NULL OR short_balance IS NOT NULL')
latest_margin_date = cursor.fetchone()[0]
print(f"融資融券資料最新日期: {latest_margin_date}")

# 檢查 2330 的融資融券資料
cursor.execute('SELECT date, margin_balance, margin_buy, margin_sell, short_balance, short_buy, short_sell FROM daily_prices WHERE code = "2330" ORDER BY date DESC LIMIT 10')
print("\n2330 最近 10 天融資融券資料:")
for row in cursor.fetchall():
    print(f"  {row[0]}: 融資餘額={row[1]}, 融資買={row[2]}, 融資賣={row[3]}, 融券餘額={row[4]}, 融券買={row[5]}, 融券賣={row[6]}")

conn.close()
