import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const { MONGODB_URI, PORT = 3000 } = process.env;

console.log("Connecting to MongoDB:", MONGODB_URI);

// ---- Mongoose Models ----
const kbSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  tags: { type: [String], index: true },
  source: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now }
}, { collection: "know_base" });

// Create text index (important)
kbSchema.index({ question: "text", answer: "text", tags: "text" }, {
  name: "TextIdx_QA_Tags",
  weights: { question: 2, answer: 2, tags: 8 }
});

const KB = mongoose.model("KB", kbSchema);


// Query log schema
const logSchema = new mongoose.Schema({
  query: String,
  matchedDocId: mongoose.Schema.Types.ObjectId,
  score: Number,
  matchedBy: { type: String, enum: ["text", "regex", "tag", "none"], default: "none" },
  createdAt: { type: Date, default: Date.now }
}, { collection: "query_logs" });

const Log = mongoose.model("Log", logSchema);

// ---- Helpers ----
async function textSearch(query) {
  return KB.find(
    { $text: { $search: query } },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(1) // only best result
    .lean();
}

async function regexFallback(query) {
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(safe, "i");
  return KB.find({ $or: [{ question: rx }, { answer: rx }] }).limit(1).lean();
}

async function tagFilter(tags = []) {
  if (!Array.isArray(tags) || !tags.length) return [];
  return KB.find({ tags: { $in: tags.map(t => t.toLowerCase()) } }).limit(1).lean();
}

// ---- Routes ----
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Event Chatbot API" });
});

// Add KB item
app.post("/kb", async (req, res) => {
  try {
    const { question, answer, tags = [], source = "user" } = req.body;
    if (!question || !answer) return res.status(400).json({ error: "question & answer required" });
    const doc = await KB.create({ question, answer, tags: tags.map(t => t.toLowerCase()), source });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual search
app.get("/kb/search", async (req, res) => {
  try {
    const { q = "", tags } = req.query;
    const tagList = tags ? String(tags).split(",").map(t => t.trim().toLowerCase()) : [];
    let results = [];

    if (q) results = await textSearch(q);
    if (!results.length && q) results = await regexFallback(q);
    if (!results.length && tagList.length) results = await tagFilter(tagList);

    res.json({ query: q, tags: tagList, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { query = "", tags = [] } = req.body;
    let matchedBy = "none";
    let top = null;
    let score = null;

    if (query) {
      const textResults = await textSearch(query);
      if (textResults.length) {
        top = textResults[0];
        matchedBy = "text";
        score = top.score;
      }
    }

    if (!top && query) {
      const rx = await regexFallback(query);
      if (rx.length) { top = rx[0]; matchedBy = "regex"; }
    }

    if (!top && tags?.length) {
      const tg = await tagFilter(tags);
      if (tg.length) { top = tg[0]; matchedBy = "tag"; }
    }

    await Log.create({
      query, matchedDocId: top?._id, score: score || null, matchedBy
    });

    if (!top) return res.json({ answer: "Sorry, I don’t know yet.", matchedBy });

    res.json({
      answer: top.answer,
      source: top.source,
      tags: top.tags,
      matchedBy,
      score
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytics
app.get("/analytics/top-queries", async (_req, res) => {
  try {
    const agg = await Log.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    res.json(agg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Start ----
mongoose.connect(MONGODB_URI)
  .then(async () => {
    await KB.syncIndexes();
    app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });
