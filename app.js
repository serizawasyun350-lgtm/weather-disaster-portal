
const express = require("express");
const path = require("path");

const app = express();

// Renderのポート設定
const PORT = process.env.PORT || 3000;

// JSONを受け取る設定
app.use(express.json());

// publicフォルダを公開
app.use(express.static(path.join(__dirname, "public")));

// メインページ
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// API動作確認
app.get("/api/status", (req, res) => {
  res.json({
    status: "OK",
    message: "気象・地震・防災ポータル稼働中",
    server: "Render",
    time: new Date().toISOString()
  });
});

// サーバー起動
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
