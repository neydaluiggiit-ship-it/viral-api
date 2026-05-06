const express = require("express");
const cors = require("cors");
 
const app = express();
app.use(cors());
app.use(express.json());
 
const SC_KEY = process.env.SC_KEY;
 
// ── Health check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Viral Research API v2 - ScrapeCreators" });
});
 
// ── RESEARCH endpoint principal ───────────────────────────
// Busca en TikTok Search Top + Instagram Hashtag en paralelo
app.post("/research", async (req, res) => {
  const { sector = "", niche = "", ssdd = "", audience = "" } = req.body;
 
  // Keywords estratégicas basadas en el sector del cliente
  const tkQueries = [
    sector,                          // sector en español
    niche,                           // nicho exacto
    "emprendimiento femenino",       // audiencia general ES
    "women entrepreneur mindset",    // EN
    "empreendedorismo feminino",     // PT Brasil
    `${ssdd} personal development`,  // SSDD en inglés
  ].filter(Boolean).slice(0, 4);    // máx 4 queries
 
  const igHashtags = [
    sector.replace(/\s+/g, "").toLowerCase().slice(0, 30),
    "emprendimientofemenino",
    "womenentrepreneur",
    "desarrollopersonal",
  ].filter(Boolean).slice(0, 3);
 
  const results = { tiktok: [], instagram: [], errors: [] };
 
  // ── TikTok Search Top (endpoint correcto) ────────────────
  await Promise.allSettled(
    tkQueries.map(async (q) => {
      try {
        // Endpoint correcto: /v1/tiktok/search/top
        const r = await fetch(
          `https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(q)}&count=8`,
          { headers: { "x-api-key": SC_KEY }, signal: AbortSignal.timeout(20000) }
        );
        const data = await r.json();
 
        // La respuesta tiene items con statistics.play_count
        const items = data?.items || data?.data || data?.videos || [];
        items.forEach(v => {
          const views = v.statistics?.play_count || v.stats?.playCount || v.playCount || 0;
          if (views > 50000) { // Solo videos con más de 50K vistas
            results.tiktok.push({
              title: (v.desc || v.text || "").slice(0, 150).trim(),
              author: v.author?.unique_id || v.author?.uniqueId || "desconocido",
              views,
              likes: v.statistics?.digg_count || v.stats?.diggCount || 0,
              id: v.id || v.aweme_id || "",
              lang: v.desc_language || "es",
              region: v.region || "LATAM",
              query: q,
            });
          }
        });
      } catch (e) {
        results.errors.push(`TikTok search "${q}": ${e.message}`);
      }
    })
  );
 
  // ── Instagram Hashtag (endpoint correcto) ────────────────
  await Promise.allSettled(
    igHashtags.map(async (tag) => {
      try {
        // Endpoint correcto: /v1/instagram/hashtag
        const r = await fetch(
          `https://api.scrapecreators.com/v1/instagram/hashtag?hashtag=${encodeURIComponent(tag)}&count=6`,
          { headers: { "x-api-key": SC_KEY }, signal: AbortSignal.timeout(20000) }
        );
        const data = await r.json();
        const posts = data?.data || data?.posts || data?.items || [];
        posts
          .filter(p => p.media_type === "VIDEO" || p.is_video || p.type === "video")
          .forEach(p => {
            results.instagram.push({
              title: (p.caption || p.edge_media_to_caption?.edges?.[0]?.node?.text || "").slice(0, 150).trim(),
              author: p.owner?.username || p.user?.username || "desconocido",
              views: p.play_count || p.video_view_count || 0,
              likes: p.like_count || p.edge_liked_by?.count || 0,
              shortcode: p.shortcode || "",
              url: p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : "",
              hashtag: tag,
            });
          });
      } catch (e) {
        results.errors.push(`Instagram hashtag "${tag}": ${e.message}`);
      }
    })
  );
 
  // ── Ordenar por views y formatear para Claude ─────────────
  const topTK = results.tiktok
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);
 
  const topIG = results.instagram
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);
 
  let referencesText = "";
 
  if (topTK.length > 0) {
    referencesText += "=== TIKTOK — VIDEOS VIRALES REALES ===\n";
    topTK.forEach((v, i) => {
      const url = v.id
        ? `https://www.tiktok.com/@${v.author}/video/${v.id}`
        : `https://www.tiktok.com/@${v.author}`;
      referencesText += `${i + 1}. "${v.title}"\n`;
      referencesText += `   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas · ❤️ ${Number(v.likes).toLocaleString()} · 🌍 ${v.region} [${(v.lang || "es").toUpperCase()}]\n`;
      referencesText += `   🔗 ${url}\n`;
      referencesText += `   🔍 Búsqueda: "${v.query}"\n\n`;
    });
  }
 
  if (topIG.length > 0) {
    referencesText += "=== INSTAGRAM REELS — VIDEOS REALES ===\n";
    topIG.forEach((v, i) => {
      referencesText += `${i + 1}. "${v.title}"\n`;
      referencesText += `   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas · ❤️ ${Number(v.likes).toLocaleString()}\n`;
      referencesText += `   🔗 ${v.url || `https://www.instagram.com/${v.author}/`}\n`;
      referencesText += `   #️⃣ hashtag: ${v.hashtag}\n\n`;
    });
  }
 
  if (!referencesText) {
    referencesText = `No se encontraron videos. Errores: ${results.errors.join(" | ")}`;
  }
 
  res.json({
    referencesText,
    totalFound: topTK.length + topIG.length,
    tiktok: topTK.length,
    instagram: topIG.length,
    errors: results.errors,
    raw: { tiktok: topTK, instagram: topIG },
  });
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Viral Research API v2 running on port ${PORT}`));
 
