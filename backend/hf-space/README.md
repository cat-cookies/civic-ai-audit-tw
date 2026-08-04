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
