# 乘車服務品質比較 Dashboard

## 目標架構

這個 Dashboard 是靜態網頁，可部署到 GitHub Pages，並自動讀取 Google 表單回覆試算表中的 `Dashboard資料` 分頁。

建議流程：

1. Google 表單收集隊輔搭乘回饋。
2. Google 表單回覆自動進入 Google Sheets。
3. Apps Script 將回覆整理到 `Dashboard資料` 分頁。
4. Dashboard 每 5 分鐘重新讀取 Google Sheets，畫面自動更新。

## Google Sheets 設定

1. 打開表單回覆試算表。
2. 確認試算表共用權限為「知道連結的任何人可檢視」。
3. 確認 Apps Script 已建立並更新 `Dashboard資料` 分頁。
4. Dashboard 會依 `config.js` 內的試算表連結自動讀取資料。

## 欄位需求

Dashboard 會讀取以下欄位名稱：

- 月份
- 分公司
- 隊輔姓名
- 平台
- 搭乘日期
- 車種
- 實際車資
- App叫車
- 接單等候
- 服務態度
- 車內環境
- 行車安全
- 路線車資付款
- 整體評價
- 最滿意的地方
- 最需改善的地方

如果 CSV 裡已有「加權總分」，Dashboard 會優先使用；如果沒有，會依權重自動計算：

- App 叫車 10%
- 接單等候 15%
- 服務態度 25%
- 車內環境 15%
- 行車安全 20%
- 路線車資付款 10%
- 整體評價 5%

## 部署方式

可將整個 `dashboard` 資料夾部署到任何靜態網站服務：

- Netlify
- GitHub Pages
- 公司內部 Web Server
- IIS / Nginx / Apache

部署後就是可分享的網址版 Dashboard。

## 自動更新

頁面每 5 分鐘會自動重新讀取 CSV。也可以按右上角「重新整理」立即更新。

## 固定 Google Sheets 資料來源

如果要讓每台電腦打開 Dashboard 都自動讀同一份 Google Sheets，請編輯 `config.js`：

```js
window.DASHBOARD_CONFIG = {
  sheetUrl: "https://docs.google.com/spreadsheets/d/你的試算表ID/edit#gid=...",
};
```

設定後重新部署到 GitHub Pages，使用者打開網址就會自動讀取該資料來源，不需要手動貼連結。

## GitHub Pages 發布

1. 將本資料夾內的檔案放在 GitHub repository 根目錄。
2. 到 repository 的 `Settings` > `Pages`。
3. Source 選擇 `Deploy from a branch`。
4. Branch 選擇 `main`，資料夾選擇 `/root`。
5. 儲存後等待 GitHub 產生網址。
