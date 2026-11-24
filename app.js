const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

const NHK_RSS_BASE = "https://news.web.nhk/n-data/conf/na/rss/";
const rssCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getAllowedFeedUrl(req) {
  const category = req.query.category;
  if (typeof category === "string" && /^cat[0-7]$/.test(category)) {
    return `${NHK_RSS_BASE}${category}.xml`;
  }

  const raw = req.query.url;
  if (typeof raw !== "string" || raw.length > 500) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const allowedHosts = new Set(["news.web.nhk", "www.nhk.or.jp"]);
  const allowedPath = /^\/(?:n-data\/conf\/na\/rss\/cat[0-7]\.xml|rss\/news\/cat[0-7]\.xml)$/;
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || !allowedPath.test(url.pathname)) {
    return null;
  }
  return url.toString();
}

app.get("/api/status", (_req, res) => {
  res.json({ ok: true, service: "weather-disaster-portal", time: new Date().toISOString() });
});

app.get("/api/nhk-rss", async (req, res) => {
  const feedUrl = getAllowedFeedUrl(req);
  if (!feedUrl) {
    return res.status(400).json({
      error: "NHK公式RSSのcat0〜cat7のみ取得できます。URLを確認してください。"
    });
  }

  const cached = rssCache.get(feedUrl);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60");
    return res.status(200).send(cached.body);
  }

  try {
    const upstream = await fetch(feedUrl, {
      headers: {
        "User-Agent": "WeatherDisasterPortal/1.0 (+https://www.nhk.or.jp/)",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      },
      signal: AbortSignal.timeout(12000),
      redirect: "error"
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `NHK RSSからHTTP ${upstream.status}が返されました。` });
    }

    const body = await upstream.text();
    if (!body || !/<(?:rss|rdf:RDF|feed)\b/i.test(body)) {
      return res.status(502).json({ error: "NHK RSSの応答形式が正しくありません。" });
    }

    rssCache.set(feedUrl, { body, savedAt: Date.now() });
    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60");
    return res.status(200).send(body);
  } catch (error) {
    console.error("NHK RSS fetch failed:", error.message);
    return res.status(502).json({
      error: "NHK RSSを取得できませんでした。時間をおいて再試行してください。"
    });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
