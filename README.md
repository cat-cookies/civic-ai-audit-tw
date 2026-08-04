# 國家資料 AI 查證與改革觀測站

**定位：可部署暨待整合驗證 MVP。** 本站以中華民國政府公開資料為優先，提供本地搜尋、來源導覽、政策與法律分層、質詢題庫、政黨政策立場一致性與變動分析、理論比較及修法草案結構。模型只協助整理、反駁與辨識風險，不是證據，也不會直接發布結果。

## 核心使用方式

- 民眾輸入一般關鍵字，例如「居家服務 未應門」，由瀏覽器中的可重現模糊排序找出相關官方入口、已核准分析及理論資料，不需要模型金鑰。
- 輸入完整法條，例如「老人福利法第48條」，系統切換為法條精確模式，解析法規名稱與條次，導向全國法規資料庫、立法院議事暨公報資訊網、立法院法律系統、行政院公報與總統府公報。
- 只輸入「第48條」時，系統拒絕猜測法規名稱。
- 未設定受控後端時，GitHub Pages 只提供靜態查詢與已核准內容，不提供即時外部模型查證。

## 與兩個原始 ZIP 的整合判斷

保留原觀測站的八分頁、63個官方入口、政府／政黨資料分庫、人工覆核、發布白名單及 GitHub Pages 架構。另參考多語學術助理中可合法吸收的通用設計思想，自行重寫法域路由、主張—證據矩陣、反方審查、風險分流與人工核准閘門；沒有直接併入含 CC BY-NC 或授權不明的程式與資產。

## 安全架構

1. **公開展示層**：GitHub Pages 只部署 `_site` 白名單內容。
2. **受控處理層**：GitHub Actions、本機指令列或選配 Cloudflare Worker 負責 API 擷取與模型分析。
3. **人工審核層**：所有模型輸出只寫入 `review/`，不在公開部署清單內；高風險內容要求雙人核准。

資料進模型前會先分級。疑似個資、醫療／司法／陳情個案、未公開資料或高風險指控，原則上禁止送入外部免費模型。官方文件中的任何提示詞或指令均視為不可信資料。

## 免費模型與自動替換

`python scripts/model_registry.py` 會在執行時探索模型：

- 模型仍存在；
- 管理者預先核准；
- 價格欄位明確為零，或屬本機模型；
- 實際推論供應商在白名單；
- 免費狀態查核未過期；
- 資料政策允許。

只有全部成立才可列入候選。沒有合格模型即停止；`allow_paid_fallback=false`，不會自動付費。模型更名、退役、限流或免費層變更時，系統只會在預先核准的候選範圍內替換。

## GitHub 網頁上傳注意事項

若使用瀏覽器上傳，完成後必須在 Code 頁面確認 `.github` 存在。GitHub Actions 只辨識根目錄的 `.github/workflows/*.yml`。若 Actions 顯示「Get started」，請依 `GITHUB_WEB_UPLOAD_GUIDE.md`，使用 Actions 編輯器建立 `.github/workflows/pages.yml`。本版另在 `GITHUB_ACTIONS_BOOTSTRAP/` 保存可見備份，避免點開頭路徑漏傳後無法取用。

## 直接部署

1. 將本專案全部內容上傳至 GitHub 公開儲存庫的 `main` 分支。
2. 執行：

```bash
python scripts/init_repo.py --owner 你的帳號 --repo 你的儲存庫名稱
```

3. 先確認 Actions 已辨識 `.github/workflows/pages.yml`；工作流程成功建立 `gh-pages` 後，在 GitHub `Settings → Pages` 選擇 `Deploy from a branch`，指定 `gh-pages`／`root`。
4. 推送 `main` 後，`pages.yml` 只把經白名單建置的 `_site` 推至 `gh-pages`。
5. 啟用 branch protection、secret scanning、private vulnerability reporting 與 Actions environment 保護。

## 本機驗證

```bash
python -m compileall -q scripts tests
python -m unittest discover -s tests -v
node --check app.js
python scripts/build_search_index.py
python scripts/build_site.py
python scripts/check_site.py
python scripts/sbom.py
python -m http.server 8000 --directory _site
```

## 尚未完成的驗證

封裝環境沒有外部 DNS，因此尚未實際呼叫立法院、政府資料開放平臺、全國法規資料庫或司法院 API，也未呼叫任何模型。連接器皆保留 `online_contract_status`，首次部署後應手動執行 API 契約測試。靜態測試不能替代正式環境可靠度、攻防、法律發布流程及災難復原演練。

詳見 `docs/ARCHITECTURE.md`、`docs/MODEL_POLICY.md`、`docs/LEGAL_GOVERNANCE.md`、`docs/COMPARISON.md`。
