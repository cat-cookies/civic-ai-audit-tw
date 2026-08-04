# 貢獻與人工覆核流程

## 新增查證題目

編輯 `data/inbox.json`，新增一筆 `status: "ready"` 的機構或制度性題目。每一項至少應包含：

- 明確題目與政策領域
- 可驗證的具體主張
- 官方原始來源名稱、HTTPS 網址與日期
- 不把政黨主張混入政府事實

## 人工覆核

`scripts/analyze.py` 只會把結果寫入被 `.gitignore` 排除的 `data/review_queue.json`。不要將該檔案提交至公開儲存庫。覆核者應逐一：

1. 開啟每一個原始來源並核對全文與日期。
2. 確認現行法、草案、函釋、裁判、統計及政黨主張沒有混淆。
3. 檢查是否省略反方解釋、制度限制或相反資料。
4. 修改錯誤文字，填入 `human_reviewed: true`、`reviewer`、`reviewed_at`、`approval_note`。
5. 若含指控性語句，另填 `legal_risk_signoff`；否則不得發布。
6. 執行 `python scripts/publish_reviewed.py --id <ID>`。

## 政黨資料

政黨立場只能來自該黨官方網站、正式新聞稿、黨綱、政策文件、立法院正式提案或可核對的原始發言。不同政黨各自儲存，不合併為「國家事實」。矛盾判斷必須對齊議題、時間、說話者、文件版本與上下文。
