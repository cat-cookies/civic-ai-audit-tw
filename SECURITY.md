# Security Policy

- API 金鑰只能存放於 GitHub Actions Secrets 或本機環境變數，不能寫入前端 JavaScript、JSON、Issues 或提交紀錄。
- GitHub Pages 是公開靜態網站，任何部署檔案都視為公開資訊。
- 不接受包含身分證字號、私人電話、住址、醫療資訊、未公開案件資料或其他敏感個資的 Issue。
- 發現金鑰外洩時，立即撤銷金鑰、清除 Git 歷史中的秘密，並重新部署。
- 安全漏洞請透過 GitHub Security Advisories 私下通報，不要建立公開 Issue。
