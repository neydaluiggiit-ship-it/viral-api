const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors()); // permite llamadas desde cualquier origen (tu artifact)
app.use(express.json());

const APIFY_KEY = process.env.APIFY_KEY;
const SC_KEY = process.env.SC_KEY;

// ── Health check ──────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", message: "Viral Research API running" }));

// ── TikTok Search via ScrapeCreators ─────────────────────
app.get("/tiktok/search", async (req, res) => {
  const { query, count = 10 } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    const r = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(query)}&count=${count}`,
      { headers: { "x-api-key": SC_KEY } }
    );
    const data = await r.json();
    const videos = (data?.data || data?.videos || data?.items || []).map(v => ({
      title: (v.desc || v.text || "").slice(0, 150),
      author: v.author?.uniqueId || "desconocido",
      views: v.stats?.playCount || v.playCount || 0,
      likes: v.stats?.diggCount || v.diggCount || 0,
      url: `https://www.tiktok.com/@${v.author?.uniqueId || "unknown"}/video/${v.id || ""}`,
      cover: v.video?.cover || "",
    }));
    res.json({ source: "tiktok_search", query, videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TikTok Profile videos via ScrapeCreators ─────────────
app.get("/tiktok/profile", async (req, res) => {
  const { handle, count = 10 } = req.query;
  if (!handle) return res.status(400).json({ error: "handle required" });

  try {
    const r = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&count=${count}`,
      { headers: { "x-api-key": SC_KEY } }
    );
    const data = await r.json();
    const videos = (data?.data || data?.videos || []).map(v => ({
      title: (v.desc || v.text || "").slice(0, 150),
      author: handle,
      views: v.stats?.playCount || v.playCount || 0,
      likes: v.stats?.diggCount || v.diggCount || 0,
      url: `https://www.tiktok.com/@${handle}/video/${v.id || ""}`,
    }));
    res.json({ source: "tiktok_profile", handle, videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TikTok Trending via Apify ─────────────────────────────
app.post("/tiktok/trending", async (req, res) => {
  const { keywords = [], count = 8 } = req.body;
  if (!keywords.length) return res.status(400).json({ error: "keywords required" });

  try {
    const results = await Promise.all(
      keywords.slice(0, 3).map(async (kw) => {
        const r = await fetch(
          `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${APIFY_KEY}&timeout=60`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hashtags: [kw.replace(/\s+/g, "")],
              resultsPerPage: count,
              shouldDownloadVideos: false,
              shouldDownloadCovers: false,
            }),
          }
        );
        if (!r.ok) return [];
        const data = await r.json();
        return (data || []).map(v => ({
          title: (v.text || v.desc || "").slice(0, 150),
          author: v.authorMeta?.name || v.author?.uniqueId || "desconocido",
          views: v.playCount || v.plays || 0,
          likes: v.diggCount || v.likes || 0,
          url: v.webVideoUrl || `https://www.tiktok.com/@${v.authorMeta?.name || "unknown"}`,
          keyword: kw,
        }));
      })
    );

    const videos = results.flat()
      .filter(v => v.views > 100000)
      .sort((a, b) => b.views - a.views)
      .slice(0, 20);

    res.json({ source: "tiktok_trending_apify", keywords, videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Instagram Hashtag via ScrapeCreators ─────────────────
app.get("/instagram/hashtag", async (req, res) => {
  const { hashtag, count = 10 } = req.query;
  if (!hashtag) return res.status(400).json({ error: "hashtag required" });

  try {
    const r = await fetch(
      `https://api.scrapecreators.com/v1/instagram/hashtag?hashtag=${encodeURIComponent(hashtag)}&count=${count}`,
      { headers: { "x-api-key": SC_KEY } }
    );
    const data = await r.json();
    const posts = (data?.data || data?.posts || data?.items || [])
      .filter(p => p.media_type === "VIDEO" || p.is_video)
      .map(p => ({
        title: (p.caption || "").slice(0, 150),
        author: p.owner?.username || p.user?.username || "desconocido",
        views: p.play_count || p.video_view_count || 0,
        likes: p.like_count || 0,
        url: p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : "",
      }));
    res.json({ source: "instagram_hashtag", hashtag, posts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Instagram Profile via ScrapeCreators ─────────────────
app.get("/instagram/profile", async (req, res) => {
  const { handle, count = 10 } = req.query;
  if (!handle) return res.status(400).json({ error: "handle required" });

  try {
    const r = await fetch(
      `https://api.scrapecreators.com/v1/instagram/profile/posts?handle=${encodeURIComponent(handle)}&count=${count}`,
      { headers: { "x-api-key": SC_KEY } }
    );
    const data = await r.json();
    const posts = (data?.data || data?.posts || [])
      .filter(p => p.media_type === "VIDEO" || p.is_video)
      .map(p => ({
        title: (p.caption || "").slice(0, 150),
        author: handle,
        views: p.play_count || p.video_view_count || 0,
        likes: p.like_count || 0,
        url: p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : `https://www.instagram.com/${handle}/`,
      }));
    res.json({ source: "instagram_profile", handle, posts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RESEARCH COMBINADO — endpoint principal ───────────────
// Llama a todos los endpoints en paralelo y devuelve referencias consolidadas
app.post("/research", async (req, res) => {
  const { sector, niche, ssdd, audience, lang = "es" } = req.body;
  if (!sector) return res.status(400).json({ error: "sector required" });

  const queries = {
    es: [sector, niche, "emprendimiento femenino", "desarrollo personal mujeres"],
    en: ["women entrepreneur mindset", "personal development women", `${sector} english`],
    pt: ["empreendedorismo feminino", "desenvolvimento pessoal mulheres"],
  };

  const igHashtags = [
    sector.replace(/\s+/g, "").toLowerCase(),
    "emprendimientofemenino",
    "womenentrepreneur",
  ];

  try {
    // Paralelo: TikTok Search (ES + EN) + Instagram hashtags
    const [tkEs, tkEn, igRes] = await Promise.allSettled([
      // TikTok ES
      Promise.all(queries.es.slice(0, 2).map(q =>
        fetch(`https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(q)}&count=6`,
          { headers: { "x-api-key": SC_KEY } })
          .then(r => r.json())
          .then(d => (d?.data || d?.videos || []).map(v => ({
            title: (v.desc || v.text || "").slice(0, 150),
            author: v.author?.uniqueId || "desconocido",
            views: v.stats?.playCount || 0,
            url: `https://www.tiktok.com/@${v.author?.uniqueId}/video/${v.id}`,
            lang: "es", source: "tiktok",
          })))
          .catch(() => [])
      )).then(r => r.flat()),

      // TikTok EN
      Promise.all(queries.en.slice(0, 2).map(q =>
        fetch(`https://api.scrapecreators.com/v1/tiktok/search/top?query=${encodeURIComponent(q)}&count=5`,
          { headers: { "x-api-key": SC_KEY } })
          .then(r => r.json())
          .then(d => (d?.data || d?.videos || []).map(v => ({
            title: (v.desc || v.text || "").slice(0, 150),
            author: v.author?.uniqueId || "desconocido",
            views: v.stats?.playCount || 0,
            url: `https://www.tiktok.com/@${v.author?.uniqueId}/video/${v.id}`,
            lang: "en", source: "tiktok",
          })))
          .catch(() => [])
      )).then(r => r.flat()),

      // Instagram hashtags
      Promise.all(igHashtags.slice(0, 2).map(tag =>
        fetch(`https://api.scrapecreators.com/v1/instagram/hashtag?hashtag=${tag}&count=5`,
          { headers: { "x-api-key": SC_KEY } })
          .then(r => r.json())
          .then(d => (d?.data || d?.posts || [])
            .filter(p => p.media_type === "VIDEO" || p.is_video)
            .map(p => ({
              title: (p.caption || "").slice(0, 150),
              author: p.owner?.username || "desconocido",
              views: p.play_count || p.video_view_count || 0,
              url: p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : "",
              lang: "es", source: "instagram",
            })))
          .catch(() => [])
      )).then(r => r.flat()),
    ]);

    const allVideos = [
      ...(tkEs.status === "fulfilled" ? tkEs.value : []),
      ...(tkEn.status === "fulfilled" ? tkEn.value : []),
      ...(igRes.status === "fulfilled" ? igRes.value : []),
    ].sort((a, b) => b.views - a.views);

    // Format for Claude
    let referencesText = "";
    const tkVideos = allVideos.filter(v => v.source === "tiktok").slice(0, 12);
    const igVideos = allVideos.filter(v => v.source === "instagram").slice(0, 8);

    if (tkVideos.length) {
      referencesText += "=== TIKTOK VIRAL ===\n";
      tkVideos.forEach((v, i) => {
        referencesText += `${i+1}. "${v.title}"\n   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas [${v.lang.toUpperCase()}]\n   🔗 ${v.url}\n\n`;
      });
    }

    if (igVideos.length) {
      referencesText += "=== INSTAGRAM REELS ===\n";
      igVideos.forEach((v, i) => {
        referencesText += `${i+1}. "${v.title}"\n   👤 @${v.author} · 👁 ${Number(v.views).toLocaleString()} vistas\n   🔗 ${v.url}\n\n`;
      });
    }

    if (!referencesText) referencesText = "No se encontraron videos. Usa conocimiento del sector.";

    res.json({
      referencesText,
      totalFound: allVideos.length,
      tiktok: tkVideos.length,
      instagram: igVideos.length,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Viral Research API running on port ${PORT}`));
