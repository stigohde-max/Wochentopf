// Fetches current supermarket prices and writes prices/prices.json for the app.
// Runs on GitHub Actions (internet access); see .github/workflows/prices.yml.
import { writeFile, mkdir } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; Wochentopf-Preisabruf/0.3; +https://github.com/stigohde-max/Wochentopf)" };
const get = async (url) => { const r = await fetch(url, { headers: UA }); return { status: r.status, text: await r.text() }; };
const locs = t => [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
await mkdir("prices", { recursive: true });

const sued = locs((await get("https://www.aldi-sued.de/sitemap_products.xml")).text);
await writeFile("prices/aldi-sued-urls.txt", sued.join("\n"));
const nordRes = await get("https://www.aldi-nord.de/sitemaps/.aldi-nord-sitemap-products.xml");
const nord = locs(nordRes.text);
await writeFile("prices/aldi-nord-urls.txt", nord.join("\n"));

// one Aldi Nord product page: where is the price?
let nordProbe = {};
const nUrl = nord.find(u => /spaghetti|quark|haferflocken/i.test(u)) || nord[0];
if (nUrl) {
  const r = await get(nUrl);
  nordProbe = { url: nUrl, status: r.status, bytes: r.text.length,
    ld: [...r.text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].slice(0, 1200)),
    priceSnips: [...r.text.matchAll(/.{0,100}(?:"price"|price__|€)[^<]{0,100}/gi)].slice(0, 6).map(m => m[0].replace(/\s+/g, " ")) };
}
await writeFile("prices/report.json", JSON.stringify({ at: new Date().toISOString(), sued: sued.length, nord: nord.length, nordStatus: nordRes.status, nordProbe }, null, 2));
console.log("sued", sued.length, "nord", nord.length);
