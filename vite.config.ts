import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Search-engine setup that depends on where the site is deployed.
 *
 * The public address comes from SITE_URL if set (e.g. a custom domain),
 * otherwise from Vercel's VERCEL_PROJECT_PRODUCTION_URL. Preview deployments
 * (VERCEL_ENV = "preview") are marked noindex so only production is indexed.
 */
function seo(): Plugin {
  const env = process.env;
  const host = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const site = host.replace(/\/+$/, "");
  const indexable = !env.VERCEL_ENV || env.VERCEL_ENV === "production";
  const description =
    "Name the Pokémon from its silhouette, then watch the anime-style reveal. All 1,025 Pokémon, six game modes and a daily challenge.";

  const tags: string[] = [];
  if (!indexable) tags.push(`<meta name="robots" content="noindex, nofollow" />`);
  if (env.GOOGLE_SITE_VERIFICATION) {
    tags.push(`<meta name="google-site-verification" content="${env.GOOGLE_SITE_VERIFICATION}" />`);
  }
  if (site) {
    tags.push(
      `<link rel="canonical" href="${site}/" />`,
      `<meta property="og:url" content="${site}/" />`,
      `<meta property="og:image" content="${site}/og-image.png" />`,
      `<meta name="twitter:image" content="${site}/og-image.png" />`,
    );
  } else {
    tags.push(`<meta property="og:image" content="./og-image.png" />`);
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Who's That Pokémon?",
    description,
    genre: ["Quiz", "Trivia"],
    gamePlatform: "Web browser",
    applicationCategory: "GameApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(site ? { url: `${site}/`, image: `${site}/og-image.png` } : {}),
  };
  tags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

  return {
    name: "seo",
    transformIndexHtml(html) {
      return html.replace(/<!-- seo:site[^>]*-->/, tags.join("\n    "));
    },
    generateBundle() {
      const robots = indexable
        ? `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`
        : "User-agent: *\nDisallow: /\n";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      if (site && indexable) {
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
            `  <url><loc>${site}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
            `</urlset>\n`,
        });
      }
    },
  };
}

// Relative base so the built game works from any folder or sub-path.
export default defineConfig({
  base: "./",
  plugins: [react(), seo()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
