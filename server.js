const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors());
app.use(express.json());

// ── IN-MEMORY STORE ──────────────────────────────────────────
let latestPrices = {};          // { itemId: price }
let priceHistory = {};          // { itemId: [{timestamp, price}] }
const MAX_HISTORY = 10000;      // points per item before trimming

// ── ROBLOX PUSHES HERE ───────────────────────────────────────
// In PriceServer.lua, fire this every broadcast tick
// Body: { secret: "your-secret", prices: { sword: 150, ... } }
const SECRET = process.env.PUSH_SECRET || "changeme";

app.post('/push', (req, res) => {
  const { secret, prices } = req.body;
  if (secret !== SECRET) return res.status(401).json({ error: 'bad secret' });

  const now = Math.floor(Date.now() / 1000);
  for (const [id, price] of Object.entries(prices)) {
    latestPrices[id] = price;
    if (!priceHistory[id]) priceHistory[id] = [];
    priceHistory[id].push({ timestamp: now, price });
    if (priceHistory[id].length > MAX_HISTORY)
      priceHistory[id].shift();
  }
  res.json({ ok: true, count: Object.keys(prices).length });
});

// ── WEBSITE READS THESE ──────────────────────────────────────
app.get('/prices', (req, res) => {
  res.json(latestPrices);
});

app.get('/history/:itemId', (req, res) => {
  const { itemId } = req.params;
  const window = Math.min(parseInt(req.query.window) || 86400, 2592000);
  const cutoff = Math.floor(Date.now() / 1000) - window;
  const pts    = (priceHistory[itemId] || []).filter(p => p.timestamp >= cutoff);
  res.json(pts);
});

app.get('/ohlc/:itemId', (req, res) => {
  const { itemId } = req.params;
  const window = Math.min(parseInt(req.query.window) || 86400, 2592000);
  const bucket = Math.min(parseInt(req.query.bucket) || 300, 86400);
  const cutoff = Math.floor(Date.now() / 1000) - window;
  const raw    = (priceHistory[itemId] || []).filter(p => p.timestamp >= cutoff);

  const buckets = {};
  for (const pt of raw) {
    const key = Math.floor(pt.timestamp / bucket) * bucket;
    if (!buckets[key]) {
      buckets[key] = { time: key, open: pt.price, high: pt.price, low: pt.price, close: pt.price };
    } else {
      const b = buckets[key];
      if (pt.price > b.high) b.high = pt.price;
      if (pt.price < b.low)  b.low  = pt.price;
      b.close = pt.price;
    }
  }

  const result = Object.values(buckets).sort((a, b) => a.time - b.time);
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`margin.trade API running on ${PORT}`));
