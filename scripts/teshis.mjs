// Tek seferlik teşhis: gist dosyalarının boyutları ve vakit bilgisi (gizli bilgi yazmaz)
const TOKEN = process.env.GIST_TOKEN;
const r0 = await fetch("https://api.github.com/rate_limit", { headers: { Authorization: "Bearer " + TOKEN, "User-Agent": "teshis" } });
console.log("rate", JSON.stringify((await r0.json()).resources?.core));
const gh = async p => { const r = await fetch("https://api.github.com" + p, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "User-Agent": "teshis" } }); const t = await r.text(); if (!r.ok) throw new Error(r.status + " " + t.slice(0, 300)); return JSON.parse(t); };
const l = (await gh("/gists?per_page=100")).filter(x => x.description === "muhammed-maneviyat-takibi");
const g = await gh("/gists/" + l[0].id);
for (const [n, f] of Object.entries(g.files)) console.log("dosya", n, "size", f.size, "truncated", f.truncated, "content", (f.content || "").length);
const full = async n => { const f = g.files[n]; return JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content); };
const gon = await full("gonderim.json"), st = await full("maneviyat.json");
console.log("gon vakit id", gon.vakit?.id, gon.vakit?.ad, "fetched", new Date(gon.vakit?.fetched || 0).toISOString(), "days", Object.keys(gon.vakit?.days || {}).join(","), "error", gon.error, "last", new Date(gon.last || 0).toISOString());
console.log("ayar ilce", JSON.stringify(st.settings?.notify?.ilce), "oto", st.settings?.notify?.oto, "takvim", st.settings?.notify?.takvim);
