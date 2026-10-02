// Fetches current supermarket prices and writes prices/prices.json for the app.
// Runs on GitHub Actions (internet access); see .github/workflows/prices.yml.
import { writeFile, mkdir } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; Wochentopf-Preisabruf/0.2; +https://github.com/stigohde-max/Wochentopf)" };
const report = { startedAt: new Date().toISOString(), probes: [] };
const get = async (url) => { const r = await fetch(url, { headers: UA }); return { status: r.status, text: await r.text(), type: r.headers.get("content-type") }; };
async function step(name, fn) { const t0 = Date.now(); try { report.probes.push({ name, ms: 0, ...(await fn()), ms: Date.now() - t0 }); } catch (e) { report.probes.push({ name, error: String(e), ms: Date.now() - t0 }); } }

// 1) Open Prices: which filters exist?
await step("openprices-openapi", async () => {
  const r = await get("https://prices.openfoodfacts.org/api/openapi.json");
  const j = JSON.parse(r.text);
  const params = p => (j.paths[p]?.get?.parameters || []).map(x => x.name);
  return { status: r.status, prices: params("/api/v1/prices"), locations: params("/api/v1/locations"), products: params("/api/v1/products") };
});

// 2) Aldi Süd product sitemap + one product page
let aldiUrls = [];
await step("aldi-sued-sitemap", async () => {
  const r = await get("https://www.aldi-sued.de/sitemap_products.xml");
  aldiUrls = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  return { status: r.status, bytes: r.text.length, count: aldiUrls.length, sample: aldiUrls.slice(0, 5), food: aldiUrls.filter(u => /quark|haferflocken|banane|milch|reis|nudel|spaghetti/i.test(u)).slice(0, 25) };
});
for (const kw of ["magerquark", "haferflocken", "spaghetti"]) {
  await step("aldi-sued-product-" + kw, async () => {
    const url = aldiUrls.find(u => u.toLowerCase().includes(kw));
    if (!url) return { note: "no url" };
    const r = await get(url);
    const ld = [...r.text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].slice(0, 1500));
    const priceSnips = [...r.text.matchAll(/.{0,120}(?:price|Preis)[^<]{0,120}/gi)].slice(0, 8).map(m => m[0].replace(/\s+/g, " "));
    return { url, status: r.status, bytes: r.text.length, hasNextData: r.text.includes("__NEXT_DATA__"), hasNuxt: r.text.includes("__NUXT"), ld, priceSnips, title: (r.text.match(/<title>([^<]*)/) || [])[1] };
  });
}

// 3) Aldi Nord sitemap
await step("aldi-nord-sitemap", async () => {
  const r = await get("https://www.aldi-nord.de/.aldi-nord-sitemap.xml");
  const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  return { status: r.status, count: locs.length, sample: locs.slice(0, 8), products: locs.filter(u => /produkt/i.test(u)).slice(0, 8) };
});

report.finishedAt = new Date().toISOString();
await mkdir("prices", { recursive: true });
await writeFile("prices/report.json", JSON.stringify(report, null, 2));
console.log(report.probes.map(p => `${p.name}: ${p.status ?? p.error ?? p.note}`).join("\n"));
