// Holt aktuelle Preise von den Produktseiten bei Aldi Süd und schreibt prices/prices.json für die App.
// Läuft jeden Montag auf GitHub Actions (.github/workflows/prices.yml). robots.txt von aldi-sued.de erlaubt das Abrufen der Produktseiten.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; Wochentopf-Preisabruf/1.0; +https://github.com/stigohde-max/Wochentopf)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sources = JSON.parse(await readFile("prices/sources.json", "utf8"));
const catalog = JSON.parse(await readFile("prices/catalog.json", "utf8"));
let previous = {};
try { previous = JSON.parse(await readFile("prices/prices.json", "utf8")).items || {}; } catch {}

// all product URLs from the sitemap
const sm = await (await fetch("https://www.aldi-sued.de/sitemap_products.xml", { headers: UA })).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const slugOf = u => u.replace(/^https:\/\/www\.aldi-sued\.de\/produkt\//, "");

// grams (or ml) in a product name like "Speisequark Magerstufe 500 g" or "Riegel 3 x 45 g"
function gramsOf(text) {
  const t = text.replace(/,/g, ".");
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  const unit = (v, u) => ({ kg: 1000, g: 1, l: 1000, ml: 1 })[u.toLowerCase()] * v;
  if (multi) return +multi[1] * unit(+multi[2], multi[3]);
  const all = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/gi)];
  if (!all.length) return null;
  const last = all.at(-1);
  return unit(+last[1], last[2]);
}

async function product(url) {
  const html = await (await fetch(url, { headers: UA })).text();
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      if (j["@type"] === "Product" && j.offers?.price) return { name: j.name, price: +j.offers.price, available: !/OutOfStock/.test(j.offers.availability || "") };
    } catch {}
  }
  return null;
}

const items = {}, log = [];
for (const [pid, rule] of Object.entries(sources)) {
  if (pid.startsWith("_") || !catalog[pid]) continue;
  const cands = urls.filter(u => rule.slugs.some(s => slugOf(u).startsWith(s)));
  let best = null;
  for (const url of cands.slice(0, 4)) {
    await sleep(400);
    let p = null;
    try { p = await product(url); } catch (e) { log.push(`${pid}: Fehler bei ${url}: ${e}`); }
    if (!p) { log.push(`${pid}: kein Preis auf ${url}`); continue; }
    let ours;
    if (rule.pack) ours = p.price;
    else if (rule.pieces) ours = p.price / (rule.pieces * rule.pieceG) * catalog[pid].size;
    else {
      const g = gramsOf(p.name) || gramsOf(slugOf(url).replace(/-/g, " "));
      if (!g) { log.push(`${pid}: keine Menge in "${p.name}"`); continue; }
      ours = p.price / g * catalog[pid].size;
    }
    ours = Math.round(ours * 100) / 100;
    if (!best || ours < best.price) best = { price: ours, aldi: { name: p.name, price: p.price, url } };
  }
  if (!best) { log.push(`${pid}: nicht gefunden (${cands.length} Kandidaten)`); continue; }
  // plausibility: more than 2.5x off the app's estimate usually means a wrong match
  const ratio = best.price / catalog[pid].base;
  if (ratio > 2.5 || ratio < 0.3) { log.push(`${pid}: verworfen, ${best.price} € statt etwa ${catalog[pid].base} € (${best.aldi.name})`); continue; }
  const old = previous[pid]?.price;
  items[pid] = { ...best, changed: old && old !== best.price ? old : undefined };
}

const out = { updated: new Date().toISOString(), source: "Aldi Süd, Produktseiten auf aldi-sued.de", count: Object.keys(items).length, items };
await writeFile("prices/prices.json", JSON.stringify(out, null, 1));
await writeFile("prices/report.json", JSON.stringify({ at: out.updated, found: out.count, of: Object.keys(sources).length - 1, log }, null, 2));
console.log(`${out.count} Preise aktualisiert`);
log.forEach(l => console.log(l));
