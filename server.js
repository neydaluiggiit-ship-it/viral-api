const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
 
const SC_KEY = process.env.SC_KEY;
const DEEPL_KEY = process.env.DEEPL_KEY;
 
app.get("/", (req, res) => res.json({ status: "ok", message: "Viral Research API v4 - Universal + DeepL" }));
 
// ── Traducir texto con DeepL ─────────────────────────────
async function translate(text, targetLang) {
  try {
    const r = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}` },
      body: JSON.stringify({ text: [text], target_lang: targetLang }),
      signal: AbortSignal.timeout(5000)
    });
    const data = await r.json();
    return data?.translations?.[0]?.text || text;
  } catch(e) { return text; }
}
 
app.post("/research", async (req, res) => {
  const { sector="", niche="", ssdd="", audience="" } = req.body;
 
  // ── PASO 1: Traducir sector y nicho a EN y PT ────────────
  const [sectorEN, nicheEN, sectorPT, nichePT] = await Promise.all([
    translate(sector, "EN"),
    translate(niche, "EN"),
    translate(sector, "PT-BR"),
    translate(niche, "PT-BR"),
  ]);
 
  // ── PASO 2: Queries universales ──────────────────────────
  const tkQueries = [
    sector,     // sector ES España/LATAM
    niche,      // nicho ES España/LATAM
    sectorEN,   // sector EN EEUU/UK/Dubai
    nicheEN,    // nicho EN EEUU/UK/Dubai
    sectorPT,   // sector PT Brasil
    nichePT,    // nicho PT Brasil
  ].filter(Boolean)
   .map(q => q.trim())
   .filter((q,i,arr) => arr.findIndex(x => x.toLowerCase()===q.toLowerCase())===i)
   .slice(0, 6);
 
  const igHashtags = [
    sector.replace(/\s+/g,"").toLowerCase().slice(0,30),
    niche.replace(/\s+/g,"").toLowerCase().slice(0,30),
    sectorEN.replace(/\s+/g,"").toLowerCase().slice(0,30),
    nicheEN.replace(/\s+/g,"").toLowerCase().slice(0,30),
  ].filter(Boolean)
   .filter((q,i,arr) => arr.findIndex(x => x.toLowerCase()===q.toLowerCase())===i)
   .slice(0, 4);
 
  const results = { tiktok: [], instagram: [], errors: [] };
 
  // ── PASO 3: TikTok Search ────────────────────────────────
  await Promise.allSettled(tkQueries.map(async (q) => {
    try {
      const r = await fetch(
        `https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(q)}&count=8`,
        { headers: { "x-api-key": SC_KEY }, signal: AbortSignal.timeout(20000) }
      );
      const data = await r.json();
      (data?.items || data?.data || []).forEach(v => {
        const views = v.statistics?.play_count || 0;
        if (views > 50000) results.tiktok.push({
          title: (v.desc||"").slice(0,150).trim(),
          author: v.author?.unique_id || v.author?.uniqueId || "?",
          views, likes: v.statistics?.digg_count || 0,
          id: v.id || "", lang: v.desc_language || "?",
          region: v.region || "?", query: q,
        });
      });
    } catch(e) { results.errors.push(`TK "${q}": ${e.message}`); }
  }));
 
  // ── PASO 4: Instagram Hashtag ────────────────────────────
  await Promise.allSettled(igHashtags.map(async (tag) => {
    try {
      const r = await fetch(
        `https://api.scrapecreators.com/v1/instagram/hashtag?hashtag=${encodeURIComponent(tag)}&count=6`,
        { headers: { "x-api-key": SC_KEY }, signal: AbortSignal.timeout(20000) }
      );
      const data = await r.json();
      (data?.data||data?.posts||[]).filter(p=>p.media_type==="VIDEO"||p.is_video).forEach(p => {
        results.instagram.push({
          title: (p.caption||"").slice(0,150).trim(),
          author: p.owner?.username||"?",
          views: p.play_count||p.video_view_count||0,
          likes: p.like_count||0,
          url: p.shortcode?`https://www.instagram.com/p/${p.shortcode}/`:"",
          hashtag: tag,
        });
      });
    } catch(e) { results.errors.push(`IG "${tag}": ${e.message}`); }
  }));
 
  // ── PASO 5: Formatear ────────────────────────────────────
  const topTK = results.tiktok.sort((a,b)=>b.views-a.views).slice(0,15);
  const topIG = results.instagram.sort((a,b)=>b.views-a.views).slice(0,8);
 
  let referencesText = "";
  if (topTK.length) {
    referencesText += "=== TIKTOK VIRAL ===\n";
    topTK.forEach((v,i) => {
      referencesText += `${i+1}. "${v.title}"\n   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas · 🌍 ${v.region} [${v.lang.toUpperCase()}]\n   🔗 https://www.tiktok.com/@${v.author}/video/${v.id}\n   🔍 "${v.query}"\n\n`;
    });
  }
  if (topIG.length) {
    referencesText += "=== INSTAGRAM REELS ===\n";
    topIG.forEach((v,i) => {
      referencesText += `${i+1}. "${v.title}"\n   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas · ❤️ ${Number(v.likes).toLocaleString()}\n   🔗 ${v.url}\n\n`;
    });
  }
  if (!referencesText) referencesText = `Sin resultados. Queries usadas: ${tkQueries.join(" | ")}. Errores: ${results.errors.join(" | ")}`;
 
  res.json({
    referencesText,
    totalFound: topTK.length+topIG.length,
    tiktok: topTK.length,
    instagram: topIG.length,
    translations: { sectorEN, nicheEN, sectorPT, nichePT },
    queries: tkQueries,
    errors: results.errors,
  });
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Viral Research API v4 (Universal + DeepL) en puerto ${PORT}`));
