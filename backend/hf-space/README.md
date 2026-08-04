---
title: Civic AI Free Model Router
emoji: 🏛️
colorFrom: teal
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Civic AI Free Model Router

This optional Docker Space is a controlled backend for the GitHub Pages site. It keeps provider API keys in Hugging Face Space Secrets, fetches a limited set of public official sources, and runs a one-, two-, or three-stage research pipeline.

## Space Secrets

Configure only the providers you intend to use:

- `OPENROUTER_API_KEY`
- `OPENROUTER_ALLOWED_PROVIDER_SLUGS` (comma-separated; recommended)
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `BACKEND_TOKEN` (optional bearer token required from the website)
- `ALLOWED_ORIGINS` (comma-separated, e.g. `https://cat-cookies.github.io`)

The router never intentionally selects paid fallback models. OpenRouter models must report zero input and output prices. Gemini and Groq use live model discovery, but account-level free eligibility cannot be proven by code; use a dedicated account/project without billing if fail-closed behavior is required.

## Endpoints

- `GET /health`
- `GET /models`
- `POST /api/research`
- `POST /api/legislation`
- `POST /api/literature`
- `POST /api/discover`
- `POST /api/extract`
- `POST /api/grill`
- `POST /api/expand`
- `POST /api/network`

The backend accepts only public-source research material. Personal data, medical records, private complaints and unpublished documents are rejected.


## 政黨社群資料限制

中央黨部官網可由 `/api/fetch-official` 擷取。Facebook Page Public Content Access、Meta Content Library、Instagram 與 Threads API 另有核准、帳號授權及研究者資格限制。後端只把核准介面或使用者提供的官方貼文原文納入分析，不使用未經授權的隱蔽爬蟲，也不宣稱資料完整。

## v6.1 線上搜尋與合法擷取

新增環境變數：

```text
ENABLE_BRAVE_SEARCH=false
BRAVE_SEARCH_API_KEY=
BRAVE_MONTHLY_QUERY_LIMIT=900
OPENALEX_API_KEY=
DISCOVERY_USER_AGENT=CivicAIResearchBot/6.1 (+你的公開專案網址)
```

- Brave Search API 必須由管理者明確啟用；系統另設本機每月安全上限，達限即停止，不切換付費服務。
- Crossref 與 Europe PMC 用於公開學術中繼資料；OpenAlex 只有設定 API Key 才啟用。
- `/api/discover` 依資料領域、法域與網域範圍搜尋。
- `/api/extract` 只擷取通過 DNS、SSRF、重新導向、robots.txt、內容類型及大小檢查的公開頁面。
- 使用者指定網域時，只允許明確列出的完整網域，不接受萬用字元。

## v7.0 提示詞中心研究後端

新增端點：

- `POST /api/grill`：對過廣提示提出3至6個問題界定追問。
- `POST /api/expand`：只提出正式名稱、縮寫、英文對應、上位詞、下位詞與替代術語。
- `POST /api/network`：建立帶來源ID與假設狀態的概念關聯網絡。
- `POST /api/extract`：只從合法公開網址解析 HTML、PDF、DOCX、PPTX與圖檔；沒有檔案上傳端點。

OCR 預設關閉。只有設定 `ENABLE_OCR=true` 才會使用 Tesseract 處理掃描 PDF 或圖檔；可用 `OCR_LANG=chi_tra+eng` 調整語言。

新增可選 Cloudflare Workers AI：

```text
ENABLE_CLOUDFLARE_FREE_ALLOCATION=false
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_MODEL_IDS=@cf/meta/llama-3.2-3b-instruct
```

免費配額、模型與服務政策可能變動；任何供應商皆不得自動轉為付費。


非中國大陸模型政策同時檢查供應商前綴與模型識別碼片段。`deepseek`、`qwen`、`z-ai`／`zai-org`、`glm`、`moonshot`／`kimi`、`minimax`、`baidu`、`tencent`、`01-ai`、`thudm`及`stepfun`等識別碼會被拒絕；管理者仍應定期核對模型權利人、實際推論供應商、資料處理地及日誌政策。
