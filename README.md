# 國家資料 AI 查證與改革觀測站 v5.0.0

以官方資料、可驗證推論與學術文獻為核心的公共資料研究網站。公開前台可部署於 GitHub Pages；需要即時模型分析時，可選配 Hugging Face Docker Space 後端。模型用來整理、批判與產生待覆核草稿，不是證據，也不得自動認定任何個人、政黨、機關或團體涉及違法或其他責任。

## 這一版解決的問題

- 搜尋不再把官方入口清單當成答案，而是先辨識問題意圖、核心概念、法規名稱、比較需求與可能的研究方法。
- 相關概念不再冒充近義詞；只有正式名稱、通行簡稱與明確語形變體可自動展開。
- AI 摘要改為原子主張、來源識別碼、反證、衝突來源、推論前提、失敗條件與不確定性。
- 法律、政策、政治協商與執行問題分開分析，避免把政策偏好寫成法律義務。
- 「學說與期刊」頁提供理論核心主張、作用機制、診斷問題、適用限制、研究方法與代表性期刊論文。
- 修法工具保留 A 最小修正、B 權衡修正、C 制度性修正三種版本，並可下載 XLSX 條文對照表與修法理由。
- 一般問題原則上一個模型階段；複雜問題兩個階段；高風險或零證據問題最多三個階段。沒有合格零成本模型即停止，不轉入付費。

## 使用流程

1. 輸入一般問題、政策名稱、機關、法案或完整法條。
2. 系統先在本地索引中建立查詢計畫，顯示命中原因、資料類型與推論邊界。
3. 使用者選擇官方來源及其他可驗證材料，建立 evidence packet。
4. 規則式檢查先處理法條格式、來源類型、日期、資料效力及引用識別碼。
5. 選配 AI 產生規劃、批判與綜合結果；前端驗證模型引用的來源、理論與文獻識別碼。
6. 高風險內容仍須人工閱讀原文、確認法源效力、研究設計及發布風險。

## 搜尋與推論

搜尋排序採相關性硬門檻：

- 文件必須實際命中查詢詞、受控名稱變體、多個核心詞或明確議題關聯，才可進榜。
- 官方性、人工覆核及證據等級只能在已有相關性的結果間微調排序。
- 完整法條採精確路由；只輸入條次而未提供法規名稱時，系統拒絕猜測。
- 結果會區分直接命中、受控變體命中、相關資料及官方定位入口。
- AI 最終輸出必須揭露「可直接回答」「目前不能下結論」「反方證據」「來源衝突」「推論前提」與「推論失敗條件」。

## 學說與期刊文獻

`data/theory_catalog.json` 與 `data/literature_catalog.json` 建立可追溯的關聯：

```text
問題意圖
→ 理論核心主張
→ 作用機制
→ 診斷問題
→ 可檢驗命題
→ 適合研究方法
→ 代表性期刊論文
→ 適用限制
```

目前目錄涵蓋公共政策、政治制度、國會與問責、政策執行、協力治理、政策回饋、高可靠度組織、安全科學、實施科學、因果推論、AI 查證、比例原則及法律明確性等。每篇內建代表性文獻均附 DOI；頁面另可透過 Crossref 與 Europe PMC 擴充中繼資料，並輸出 APA、RIS 與 BibTeX。

文獻目錄只是理論與方法的代表性起點，不是系統性回顧，也不以期刊名稱、引用次數或 API 排序自動判定證據品質。詳細規則見 `docs/ACADEMIC_EVIDENCE_METHOD.md`。

## 免費模型與虛擬後端

前台沒有金鑰仍可使用搜尋、資料入口、理論文獻、研究方法及修法 XLSX 功能。即時模型分析可部署 `backend/hf-space`：

- 模型金鑰存放於 Hugging Face Space Secrets，不寫入 GitHub Pages。
- OpenRouter 只接受即時價格欄位明確為零且供應商符合白名單的模型。
- Gemini 與 Groq 預設停用；只有管理者確認帳戶方案後，才以環境變數明確啟用。
- 每小時任務量、每階段備援次數、輸入大小及允許來源網域均有限制。
- 外部來源擷取會檢查初始網域與最終重新導向網域。
- 疑似個資、醫療個案、司法個案、陳情內容及未公開資料會被阻擋。

設定與部署方法見 `docs/VIRTUAL_LLM_BACKEND.md` 及 `backend/hf-space/README.md`。

## 修法草案與 Excel

修法頁可產生：

- A 版：最小修正，處理最明確的規範缺口。
- B 版：權衡修正，兼顧權利保障、行政成本與執行彈性。
- C 版：制度性修正，處理權責、程序、監督、資料與配套制度。

每版均包含修正條文、現行條文、修法理由、優點、風險、執行需求、財政影響與待查核事項。下載的 `.xlsx` 包含版本比較、條文對照表、修法理由、來源與待查核四張工作表。未提供現行條文或可靠來源時，系統不得捏造條文。

## 部署至現有 GitHub 儲存庫

本專案已配合：

```text
https://github.com/cat-cookies/civic-ai-audit-tw
```

使用瀏覽器上傳時，請將 ZIP 解壓後的全部內容覆蓋至 `main` 分支，並確認 `.github/workflows/main.yml` 存在。既有工作流程會建立 `_site` 並推送至 `gh-pages`。GitHub Pages 來源維持：

```text
gh-pages / (root)
```

公開部署只包含白名單檔案，不包含 `review/`、原始模型輸出、私人資料、模型設定或金鑰。

## 本機驗證

```bash
python -m compileall -q scripts tests backend/hf-space
python -m unittest discover -s tests -v
node --check search.js
node --check academic.js
node --check ai-engine.js
node --check legislation.js
node --check xlsx-export.js
node --check app.js
node tests/search_quality.test.js
node tests/academic_quality.test.js
node tests/legislation_xlsx.test.js
python scripts/build_search_index.py
python scripts/build_site.py
python scripts/check_site.py
python scripts/sbom.py
```

## 已知限制

- GitHub Pages 不是全文搜尋引擎，無法即時索引所有政府動態網站、PDF、裁判與歷史版本。
- Crossref 與 Europe PMC 主要提供中繼資料與檢索結果，不能取代全文閱讀、偏誤評估或系統性回顧。
- 理論推薦只提供候選解釋；必須核對作用機制、反例、可檢驗命題與失敗條件。
- 免費模型、免費額度與供應商政策可能變更，系統不保證永久可用。
- 已完成靜態、單元、資料契約、XLSX 及建置測試；外部 API、模型供應商與正式瀏覽器環境仍須於部署後驗證。

工程自我批判、殘餘風險與發布驗收門檻見 `docs/SELF_CRITIQUE_V5.md`。
