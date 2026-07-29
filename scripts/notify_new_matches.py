"""Create a GitHub Issue when the daily screen finds new golden-cross matches.

Split out of .github/workflows/daily.yml because embedding this as a raw
Python heredoc inside a YAML `run: |` block scalar is fragile: every line of
a YAML block scalar must stay indented at least as far as its first line, but
an unindented `<<'PY' ... PY` heredoc body breaks that rule. That mismatch
produced a YAML parse error ("could not find expected ':'"), which silently
failed EVERY run of this workflow (including the daily 14:45 Taipei
schedule) from the commit that introduced it onward — no scheduled runs
executed successfully, so no new market data was auto-fetched until this was
found and fixed on 2026-07-29.
"""
import json
import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JSON = os.path.join(BASE_DIR, "docs", "data.json")


def main():
    with open(DATA_JSON, encoding="utf-8") as f:
        data = json.load(f)

    new_codes = data.get("new_matches_today", [])
    if not new_codes:
        print("No new matches today, skipping notification.")
        return

    new_matches = [m for m in data["matches"] if m["code"] in new_codes]
    lines = [f"資料日期：{data['data_date']}", "", "新增符合條件標的：", ""]
    for m in new_matches:
        lines.append(
            f"- {m['code']} {m['name']}（{m['market']}）收盤 {m['close']} / MA20 {m['ma20_close']} "
            f"K={m['K']} D={m['D']}"
        )
    body = "\n".join(lines)
    title = f"台股KD黃金交叉：新增{len(new_matches)}筆符合條件（{data['data_date']}）"

    subprocess.run(
        ["gh", "issue", "create", "--title", title, "--body", body],
        check=True,
    )


if __name__ == "__main__":
    main()
