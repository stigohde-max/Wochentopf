// Fetches current supermarket prices and writes prices/prices.json for the app.
// Runs on GitHub Actions (internet access); see .github/workflows/prices.yml.
import { writeFile, mkdir } from "node:fs/promises";

const report = { startedAt: new Date().toISOString(), probes: [] };

async function probe(name, url, opts = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Wochentopf-Preisabruf/0.1 (+https://github.com/stigohde-max/Wochentopf)", ...(opts.headers || {}) } });
    const text = await res.text();
    const entry = { name, url, status: res.status, ms: Date.now() - t0, bytes: text.length, contentType: res.headers.get("content-type") };
    if (opts.json) { try { const j = JSON.parse(text); entry.keys = Object.keys(j); entry.total = j.total ?? j.count ?? null; entry.sample = JSON.stringify(j.items ? j.items.slice(0, 2) : j).slice(0, 4000); } catch { entry.head = text.slice(0, 600); } }
    else entry.head = text.slice(0, opts.head || 1500);
    report.probes.push(entry);
  } catch (e) {
    report.probes.push({ name, url, error: String(e), ms: Date.now() - t0 });
  }
}

const OP = "https://prices.openfoodfacts.org/api/v1/prices";
await probe("openprices-latest", `${OP}?size=3&order_by=-date`, { json: true });
await probe("openprices-de-a", `${OP}?size=3&order_by=-date&location_osm_address_country=Deutschland`, { json: true });
await probe("openprices-de-b", `${OP}?size=3&order_by=-date&location__osm_address_country=Deutschland`, { json: true });
await probe("openprices-locations-lidl", "https://prices.openfoodfacts.org/api/v1/locations?size=3&osm_brand=Lidl", { json: true });
for (const [n, u] of [["aldi-sued", "https://www.aldi-sued.de/robots.txt"], ["aldi-nord", "https://www.aldi-nord.de/robots.txt"], ["rewe-shop", "https://shop.rewe.de/robots.txt"], ["lidl", "https://www.lidl.de/robots.txt"], ["kaufland", "https://www.kaufland.de/robots.txt"], ["penny", "https://www.penny.de/robots.txt"]])
  await probe("robots-" + n, u, { head: 3000 });

report.finishedAt = new Date().toISOString();
await mkdir("prices", { recursive: true });
await writeFile("prices/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.probes.map(p => [p.name, p.status ?? p.error, p.total ?? ""]), null, 0));
