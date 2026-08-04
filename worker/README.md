# 選配 Cloudflare Worker

Worker 只接受已聲明為公開官方資料的來源節錄，先阻擋疑似個資、醫療個案及高風險指控，再依管理者明確指定的模型進行單次整理。它不會自動轉付費，也不會把結果直接發布到 GitHub Pages。

1. 複製 `wrangler.toml.example` 為 `wrangler.toml`。
2. 以 `wrangler secret put` 設定金鑰。
3. 明確指定已查核仍可免費使用的 `GROQ_MODEL` 或 `GEMINI_MODEL`。
4. 設定 GitHub Pages 網域白名單與每日上限。
5. 部署後，仍須自行把輸出送入人工審核流程；本 Worker 不提供自動公開功能。
