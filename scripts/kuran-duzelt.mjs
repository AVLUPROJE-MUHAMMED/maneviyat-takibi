// Tek seferlik: gist'teki Kur'an/meal başlangıcını 3 Ekim 2026'da 498 yapar (karşılıklı sayfalar). YAP=1 değilse yalnız gösterir.
const TOKEN = process.env.GIST_TOKEN, YAP = process.env.YAP === "1";
const gh = async (p, o = {}) => { const r = await fetch("https://api.github.com" + p, { ...o, headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "maneviyat-duzelt" } }); if (!r.ok) throw new Error("GitHub " + r.status); return r.json(); };
const list = (await gh("/gists?per_page=100")).filter(x => x.description === "muhammed-maneviyat-takibi" && x.files["maneviyat.json"]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
const g = await gh("/gists/" + list[0].id), f = g.files["maneviyat.json"];
const st = JSON.parse(f.truncated ? await (await fetch(f.raw_url, { headers: { Authorization: "Bearer " + TOKEN } })).text() : f.content);
const gun = k => { const d = st.days?.[k]; return d ? { qa: d.qa, qm: d.qm } : null; };
console.log("gist", g.id.slice(0,6), "updated", g.updated_at, "3 Ekim", JSON.stringify(st.days?.["2026-10-03"]), "gün sayısı", Object.keys(st.days||{}).length);
console.log("önce quran", JSON.stringify(st.settings?.quran), "su", st.settings?.su, "2-4 Ekim", JSON.stringify([gun("2026-10-02"), gun("2026-10-03"), gun("2026-10-04")]));
if (YAP) {
  st.settings.quran = { ...st.settings.quran, arStart: 498, mealStart: 498, anchorDate: "2026-10-03", perDay: 2, cift2: 1 };
  st.settings.su = Date.now();
  await gh("/gists/" + g.id, { method: "PATCH", body: JSON.stringify({ files: { "maneviyat.json": { content: JSON.stringify(st) } } }) });
  console.log("sonra quran", JSON.stringify(st.settings.quran), "su", st.settings.su);
}
