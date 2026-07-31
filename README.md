# 台股 KD 黃金交叉監控儀表板

每個交易日（週一至週五）台北時間約 14:45（台股收盤後）自動更新，篩選條件：

- 收盤價 < 150 元
- 收盤價 > 20 日均價 (MA20)
- 成交量 > 1,000 張
- 成交量 > 20 日均量 (量 MA20)
- KD(9,3,3) 出現黃金交叉（K 由下往上穿越 D）

資料來源：[臺灣證券交易所](https://www.twse.com.tw/)、[證券櫃買中心](https://www.tpex.org.tw/) 公開每日收盤資訊。

## 結構

- `scripts/fetch_history.py` — 抓取 TWSE/TPEx 每日收盤資料，寫入 `data/tw_stocks.db`
- `scripts/compute_screen.py` — 計算 MA20 / KD 指標並套用篩選條件，輸出 `docs/data.json`、`docs/history.json`
- `scripts/daily_update.py` — 每日執行入口：補齊缺漏交易日 → 重新篩選 → 修剪資料庫大小
- `docs/` — 靜態儀表板網頁（GitHub Pages 從此資料夾發布）
- `.github/workflows/daily.yml` — 每日自動排程（GitHub Actions，免費額度）

## 自動化

由 GitHub Actions 免費額度每日自動執行，完全不需要外部服務或付費資源。
