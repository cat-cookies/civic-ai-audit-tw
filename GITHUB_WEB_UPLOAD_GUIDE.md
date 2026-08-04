# GitHub 網頁上傳與 Actions 修復指南

本專案的 GitHub Actions 必須位於儲存庫根目錄：

```text
.github/
└── workflows/
    ├── main.yml
    ├── test.yml
    ├── collect.yml
    ├── model-status.yml
    └── codeql.yml
```

## 為什麼 Actions 顯示「Get started」

若 Code 頁面看不到 `.github`，代表瀏覽器上傳時漏掉點開頭的路徑。GitHub 只會搜尋根目錄的 `.github/workflows`，其他位置即使有相同 YAML，也不會執行。

## 最容易的修復方式

1. 開啟儲存庫的 **Actions**。
2. 點 **set up a workflow yourself**。
3. 將檔名改為：

```text
.github/workflows/main.yml
```

4. 刪除編輯器原有內容。
5. 貼上本專案 `GITHUB_ACTIONS_BOOTSTRAP/main.yml` 的全部內容。
6. 按 **Commit changes**。
7. 回到 Actions，確認出現 `Publish reviewed static site`。
8. 工作流程成功後，前往：

```text
Settings → Pages → Deploy from a branch → gh-pages → /(root) → Save
```

## 其餘工作流程

網站先以 `main.yml` 啟動即可。之後可依相同方法建立：

- `.github/workflows/test.yml`
- `.github/workflows/collect.yml`
- `.github/workflows/model-status.yml`
- `.github/workflows/codeql.yml`

`GITHUB_ACTIONS_BOOTSTRAP` 只是可見備份，不會被 GitHub 自動執行。
