import sqlite3
conn = sqlite3.connect(r'd:\PYTHON\股巿開發工具\data\tw_stocks.db')
cursor = conn.cursor()
cursor.execute('SELECT DISTINCT code, name FROM daily_prices WHERE code LIKE "00991%"')
results = cursor.fetchall()
print("Codes matching 00991%:")
for code, name in results:
    print(f"  {code}: {name}")
conn.close()
