# 免費 LLM 虛擬後端部署

## 建議選擇：Hugging Face Docker Space

專案的 `backend/hf-space` 可直接建立為 Docker Space。用途是把 API Key 放在 Space Secrets，讓 GitHub Pages 只呼叫受控後端。

### 步驟

1. 在 Hugging Face 建立新 Space，SDK 選 Docker。
2. 上傳 `backend/hf-space` 內全部檔案。
3. 在 Space Settings → Variables and secrets 設定：
   - `ALLOWED_ORIGINS=https://cat-cookies.github.io`
   - `BACKEND_TOKEN=自行產生的長隨機字串`
   - 至少一個供應商金鑰：`OPENROUTER_API_KEY`、`GEMINI_API_KEY` 或 `GROQ_API_KEY`
   - OpenRouter 建議設定 `OPENROUTER_ALLOWED_PROVIDER_SLUGS`
   - 若已人工確認 Gemini 專案使用免費層，再設定 `ENABLE_GEMINI_FREE_TIER=true`
   - 若已人工確認 Groq 帳戶使用開發方案，再設定 `ENABLE_GROQ_DEVELOPER_TIER=true`
   - 建議設定 `MAX_TASKS_PER_HOUR=12`、`MAX_FALLBACKS_PER_STAGE=1`，限制免費資源消耗
4. Space 啟動後，在網站「免費 AI 與後端」填入 Space 網址及後端權杖。
5. 先按「測試虛擬後端」，再檢查模型。

## 免費不等於永久可用

- Gemini API 有免費層與模型／專案速率限制，但可用模型與配額會變動。
- Groq Developer Plan 有模型別速率限制與模型停用公告。
- Cloudflare Workers AI 有免費配置，超額時可回傳限額錯誤；帳戶若為付費方案仍須另設預算控制。
- OpenRouter 的 `:free` 或零價格模型有不同限流與可用性；隨機免費路由不適合本專案的來源與供應商限制。
- Hugging Face Spaces 可部署 Docker 應用並使用 Secrets，但免費硬體可能休眠或受限。

官方文件：

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/deprecations
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://openrouter.ai/docs/guides/routing/model-variants/free
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/privacy/provider-logging
- https://huggingface.co/docs/hub/spaces-overview
- https://huggingface.co/docs/hub/spaces-sdks-docker
- https://huggingface.co/docs/hub/security-secrets


## 成本與安全硬限制

- OpenRouter 只有 prompt 與 completion 價格均明確為零的模型才會進入候選清單。
- Gemini 與 Groq 的模型清單 API 不足以證明目前帳戶不會被收費，因此預設不加入後端模型候選；必須由管理者核對帳戶方案後明確啟用。
- 每小時任務量與每階段備援次數都有上限。備援只處理技術失敗，不以多模型投票取代證據。
- 外部來源僅允許白名單政府網域；重新導向後仍會再檢查最終網域，避免跳轉至非核准來源。
- 後端拒絕疑似個資與過大請求；Space Secrets 不得寫入公開儲存庫或前端 JavaScript。
