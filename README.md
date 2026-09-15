# 🧱 照片打磚塊（Photo Arkanoid）

用兩張照片做出專屬的打磚塊（Breakout / Arkanoid）網頁遊戲，產生連結分享給朋友。
手機瀏覽器（觸控）和電腦瀏覽器（滑鼠 / 鍵盤）都能玩。

## 玩法流程

1. 打開首頁，上傳兩張照片：
   - **磚塊照片**：每一塊磚塊都會顯示這張照片。
   - **底圖照片**：被磚塊擋住，磚塊打掉後才會露出來。
2. 選擇磚塊數量（每列 6 / 8 / 10 塊），按「產生遊戲連結」。
3. 把連結傳給朋友，朋友打開就能玩你設定的遊戲。
4. 破關（或失敗）後的畫面可以「再玩一次」、「分享這個遊戲」，或「建立新遊戲」回到首頁用自己的照片再做一個。

操作方式：

| 裝置 | 移動板子 | 發射球 |
| --- | --- | --- |
| 手機 / 平板 | 手指在畫面上左右滑動 | 點一下畫面 |
| 電腦 | 滑鼠移動，或 ← → / A D 鍵 | 點一下畫面，或 空白鍵 / Enter |

三條命，把所有磚塊打掉就破關，底圖照片會完整揭曉。

## 安裝與執行

需要 Node.js 18 以上，沒有任何第三方相依套件。

```bash
npm start          # 預設 http://localhost:3000
PORT=8080 npm start
```

遊戲資料（兩張照片 + 設定）以 JSON 檔存在 `data/games/`，可用環境變數 `DATA_DIR` 改位置。
照片在瀏覽器端就先縮小壓縮（磚塊最長邊 256px、底圖最長邊 1000px 的 JPEG），伺服器不做影像處理。

### Docker

```bash
docker build -t photo-arkanoid .
docker run -p 3000:3000 -v $(pwd)/data:/app/data photo-arkanoid
```

### 部署

任何能跑 Node.js 的平台都可以（Render、Railway、Fly.io、VPS…），啟動指令就是 `node server.js`。
記得把 `data/` 掛成持久化磁碟，否則重新部署後舊的遊戲連結會失效。

### 最簡單的做法：GitHub Pages（免費、不用伺服器）

1. 程式碼在 GitHub 上（任何一個在 workflow 裡列出的分支都可以）。
2. 到 GitHub 的 **Settings → Pages**，**Source** 選 **GitHub Actions**。
3. 等 **Actions** 分頁的 "Deploy to GitHub Pages" 跑完（約一分鐘），網址會是
   `https://<你的帳號>.github.io/ArkanoidGame/`。

之後每次推到 `main` 都會自動重新部署。這個模式沒有後端，會用下面說的「內嵌模式」產生連結。

### 沒有伺服器也能用（純靜態主機，例如 GitHub Pages）

把 `public/` 目錄整個放到靜態主機上也能運作：建立頁偵測不到 API 時，
會自動改用「內嵌模式」，把兩張照片壓得很小（磚塊 80px、底圖 480px）後直接編進網址的 `#` 後面，
所以不需要後端就能分享。缺點是網址很長（通常 1 到 3 萬字元），部分通訊軟體可能會截斷，
建議用系統「分享」功能或直接複製到瀏覽器開啟。有伺服器時則會產生像 `/p/AbC123xy` 這樣的短網址。

## 路由 / API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/` | 建立遊戲頁面 |
| POST | `/api/games` | 建立遊戲。JSON：`{ "brick": dataURL, "bg": dataURL, "cols": 6\|8\|10 }`，回傳 `{ "id", "url" }` |
| GET | `/api/games/:id` | 取得遊戲設定 |
| GET | `/p/:id` | 遊玩頁面（分享用的連結） |
| GET | `/play.html#d=…` | 內嵌模式的遊玩頁面 |
| GET | `/healthz` | 健康檢查 |

單張圖片上限 3 MB（data URL 長度），只接受 JPEG / PNG / WebP。

## 專案結構

```
server.js          零相依的 Node.js 伺服器（靜態檔案 + API + JSON 檔案儲存）
public/
  index.html       建立遊戲頁
  create.js        照片讀取、壓縮、產生連結（伺服器模式 / 內嵌模式）
  play.html        遊玩頁
  game.js          遊戲本體（Canvas、碰撞、觸控 / 滑鼠 / 鍵盤操作）
  shared.js        共用工具（圖片縮放、連結編碼、複製 / 分享）
  style.css        樣式（手機優先）
Dockerfile
```
