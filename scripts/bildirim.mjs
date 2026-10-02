// CENNET YOLU bildirim zamanlayıcısı.
// Kullanıcının gizli gist'indeki ayarlara ve günlük kayıtlara bakar, Diyanet vakitlerine göre telefonlara Web Push gönderir.
// Hata olsa bile 0 ile çıkar; hata gonderim.json'a yazılır ve uygulamada görünür (her çalışmada e-posta gitmesin diye).
import webpush from "web-push";

const TOKEN = process.env.GIST_TOKEN;
const LIFE = Number(process.env.LIFE_MIN || 28) * 60000;    // bir çalışmanın süresi; GitHub zamanlayıcısı gecikebildiği için çalışmalar üst üste biner (sırayla)
const LATE = 2 * 3600000;                                   // geciken çalışmada okuma bildirimleri bu kadar geç de gönderilir (vakitlerde daha kısa)
const DESC = "muhammed-maneviyat-takibi", FILE = "maneviyat.json", BFILE = "bildirim.json", GFILE = "gonderim.json";
const APP = "https://avluproje-muhammed.github.io/maneviyat-takibi/";
const UA = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36" };
const VK = [["sabah", "Sabah", "imsak", "gunes"], ["ogle", "Öğle", "ogle", "ikindi"], ["ikindi", "İkindi", "ikindi", "aksam"], ["aksam", "Akşam", "aksam", "yatsi"], ["yatsi", "Yatsı", "yatsi", "imsak+1"]];
const T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!TOKEN) { log("GIST_TOKEN gizli anahtarı yok; depo ayarlarından eklenince bildirimler başlar."); process.exit(0); }

async function gh(path, opts = {}) {
  const r = await fetch("https://api.github.com" + path, { ...opts, headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "maneviyat-bildirim" } });
  if (!r.ok) throw new Error("GitHub " + r.status + " " + path.split("?")[0]);
  return r.json();
}
async function fileJSON(g, name) {
  const f = g.files && g.files[name]; if (!f) return null;
  let t = f.content; if (f.truncated && f.raw_url) t = await (await fetch(f.raw_url, { headers: { Authorization: "Bearer " + TOKEN } })).text();
  try { return JSON.parse(t); } catch { return null; }
}
// aynı adda birden çok not oluşmuşsa uygulama ile aynı seçimi yap: en eski olan
async function findGist() {
  const all = [];
  for (let p = 1; p <= 5; p++) {
    const l = await gh("/gists?per_page=100&page=" + p);
    all.push(...l.filter(x => x.description === DESC && x.files && x.files[FILE]));
    if (l.length < 100) break;
  }
  all.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (all.length) log("not sayısı", all.length, "seçilen", all[0].id.slice(0, 6), all.map(g => Object.keys(g.files).join("+")).join(" | "));
  return all.length ? all[0].id : null;
}

/* ---- Diyanet vakitleri: önce ezanvakti (Diyanet verisi, 30 gün), olmazsa Diyanet'in kendi sitesi (haftalık tablo) ---- */
const AY = { Ocak: 1, Şubat: 2, Mart: 3, Nisan: 4, Mayıs: 5, Haziran: 6, Temmuz: 7, Ağustos: 8, Eylül: 9, Ekim: 10, Kasım: 11, Aralık: 12 };
async function fetchTimes(id) {
  const days = {};
  try {
    const r = await fetch("https://ezanvakti.emushaf.net/vakitler/" + id, { headers: UA });
    if (!r.ok) throw new Error("ezanvakti " + r.status);
    for (const v of await r.json()) {
      const [d, m, y] = v.MiladiTarihKisa.split(".");
      days[`${y}-${m}-${d}`] = { imsak: v.Imsak, gunes: v.Gunes, ogle: v.Ogle, ikindi: v.Ikindi, aksam: v.Aksam, yatsi: v.Yatsi, gmt: Number(v.GreenwichOrtalamaZamani) || 3 };
    }
  } catch (e) { log("ezanvakti olmadı:", e.message); }
  if (Object.keys(days).length) return { days, kaynak: "ezanvakti (Diyanet)" };
  const r = await fetch(`https://namazvakitleri.diyanet.gov.tr/tr-TR/${id}`, { headers: UA });
  const html = await r.text();
  const tb = html.slice(html.indexOf("vakit-table"));
  for (const tr of tb.split("<tr").slice(1)) {
    const td = [...tr.matchAll(/<td>([^<]*)<\/td>/g)].map(x => x[1].trim());
    if (td.length < 8) continue;
    const m = td[0].match(/(\d+) (\S+) (\d{4})/); if (!m || !AY[m[2]]) continue;
    days[`${m[3]}-${String(AY[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`] = { imsak: td[2], gunes: td[3], ogle: td[4], ikindi: td[5], aksam: td[6], yatsi: td[7], gmt: 3 };
  }
  if (!Object.keys(days).length) throw new Error("Diyanet vakitleri alınamadı");
  return { days, kaynak: "namazvakitleri.diyanet.gov.tr" };
}

const isoTR = ms => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (iso, hm, gmt = 3) => { const [y, mo, d] = iso.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, mo - 1, d, h, mi) - gmt * 3600000; };
const hhmm = ms => new Date(ms + 3 * 3600000).toISOString().slice(11, 16);

function defaultsNotify(n = {}) {
  const all = { sabah: 1, ogle: 1, ikindi: 1, aksam: 1, yatsi: 1 };
  return {
    ilce: { il: "İSTANBUL", ad: "İSTANBUL", id: 9541, ...(n.ilce || {}) }, giris: { ...all, ...(n.giris || {}) }, once: { ...all, ...(n.once || {}) },
    dk: Math.max(1, Math.min(180, Number(n.dk) || 30)), atla: n.atla == null ? 1 : n.atla,
    program: { on: 1, saat: "07:30", ...(n.program || {}) }, okuma: { on: 1, saat: "21:00", ...(n.okuma || {}) },
    takvim: n.takvim ? 1 : 0
  };
}
const START = "2026-10-03";

/* o andaki duruma göre gönderilecek bildirimler */
function events(state, bil, vakit, now) {
  const N = defaultsNotify(state?.settings?.notify);
  const days = state?.days || {}, plan = bil?.plan || {};
  const out = [];
  const today = isoTR(now);
  for (const D of [addDays(today, -1), today]) {
    const T = vakit[D], T1 = vakit[addDays(D, 1)]; if (!T) continue;
    const day = days[D] || {}, n = day.n || {};
    for (const [k, name, sf, ef] of VK) {
      const start = at(D, T[sf], T.gmt);
      const end = ef === "imsak+1" ? (T1 ? at(addDays(D, 1), T1.imsak, T1.gmt) : null) : at(D, T[ef], T.gmt);
      const marked = n[k] === "k" || n[k] === "x";
      if (N.takvim) continue;
      if (N.giris[k] && !marked) out.push({ key: `${D}:${k}:giris`, at: start, late: 20 * 60000, ttl: 1800, title: `${name} vakti girdi`, body: `${name} vakti ${T[sf]}${end ? ", çıkış " + hhmm(end) : ""}.`, tag: "vakit-" + k });
      if (end && N.once[k] && !(N.atla && n[k] === "k")) {
        out.push({ key: `${D}:${k}:once`, at: end - N.dk * 60000, late: N.dk * 60000, ttl: N.dk * 60, title: `${name} vakti çıkıyor`, body: `${name} vaktinin çıkmasına ${Math.max(1, Math.round((end - Math.max(now, end - N.dk * 60000)) / 60000))} dakika kaldı (${hhmm(end)}). Kıldıysanız uygulamada işaretleyin.`, tag: "vakit-" + k });
      }
    }
    const P = plan[D];
    if (N.program.on && P && D >= START && !N.takvim) {
      out.push({ key: `${D}:program`, at: at(D, N.program.saat), ttl: 6 * 3600, title: "Bugünkü okumalarım", body: [P.r && "Risale: " + P.r, P.qa && "Kur'an: " + P.qa, P.qm && "Meal: " + P.qm, "Sekine", P.c && "Cevşen: " + P.c].filter(Boolean).join(" · "), tag: "program" });
    }
    if (N.okuma.on && D >= START) {
      const P2 = P || {};
      const left = [!(day.r > 0) && "Risale" + (P2.r ? " (" + P2.r + ")" : ""), !(day.qa > 0) && "Kur'an" + (P2.qa ? " (" + P2.qa + ")" : ""), !(day.qm > 0) && "Meal" + (P2.qm ? " (" + P2.qm + ")" : ""), !(day.sk > 0) && "Sekine", !(day.c > 0) && "Cevşen" + (P2.c ? " (" + P2.c + ")" : "")].filter(Boolean);
      if (left.length) out.push({ key: `${D}:okuma`, at: at(D, N.okuma.saat), ttl: 3 * 3600, title: "Okumalarım bitmedi", body: "Kalan: " + left.join(" · "), tag: "okuma" });
    }
  }
  if (bil?.test) out.push({ key: "test:" + bil.test, at: bil.test, ttl: 3600, title: "CENNET YOLU", body: "Deneme: zamanlayıcıdan gelen bildirim çalışıyor.", tag: "deneme", always: true });
  return out;
}

/* uçak modunda da çalışsın diye: iPhone takvimine abone olunan takvim (uyarılar telefonda kurulu kalır) */
const icsText = t => String(t).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
const icsTime = ms => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const fold = l => { const out = []; let cur = ""; for (const ch of l) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = " "; } cur += ch; } out.push(cur); return out.join("\r\n"); };
function buildIcs(N, vakit, plan, now) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cennet Yolu//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Cennet Yolu", "X-WR-TIMEZONE:Europe/Istanbul", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  const stamp = icsTime(Date.UTC(2026, 9, 1));
  const alarm = (trig, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(text), trig, "END:VALARM"];
  const ev = (uid, s, e, sum, desc, alarms) => L.push("BEGIN:VEVENT", "UID:" + uid + "@cennetyolu", "DTSTAMP:" + stamp, "DTSTART:" + icsTime(s), "DTEND:" + icsTime(e), "SUMMARY:" + icsText(sum), "DESCRIPTION:" + icsText(desc), "TRANSP:TRANSPARENT", ...alarms.flat(), "END:VEVENT");
  for (const D of Object.keys(vakit).sort()) {
    if (D < addDays(isoTR(now), -1)) continue;
    const T = vakit[D], T1 = vakit[addDays(D, 1)];
    for (const [k, name, sf, ef] of VK) {
      if (!N.giris[k] && !N.once[k]) continue;
      const start = at(D, T[sf], T.gmt);
      const end = ef === "imsak+1" ? (T1 ? at(addDays(D, 1), T1.imsak, T1.gmt) : start + 6 * 3600000) : at(D, T[ef], T.gmt);
      const al = [];
      if (N.giris[k]) al.push(alarm("TRIGGER;RELATED=START:PT0M", `${name} vakti girdi (${T[sf]})`));
      if (N.once[k]) al.push(alarm(`TRIGGER;RELATED=END:-PT${N.dk}M`, `${name} vaktinin çıkmasına ${N.dk} dakika kaldı (${hhmm(end)})`));
      ev(`${D}-${k}`, start, end, `${name} vakti`, `${name} ${T[sf]} – ${hhmm(end)} · ${N.ilce.ad}`, al);
    }
    if (D < START) continue;
    const P = plan[D];
    if (N.program.on) {
      const s = at(D, N.program.saat);
      const txt = P ? [P.r && "Risale: " + P.r, P.qa && "Kur'an: " + P.qa, P.qm && "Meal: " + P.qm, "Sekine", P.c && "Cevşen: " + P.c].filter(Boolean).join(" · ") : "Risale, Kur'an, meal, Sekine ve Cevşen";
      ev(`${D}-program`, s, s + 15 * 60000, "Bugünkü okumalarım", txt, [alarm("TRIGGER;RELATED=START:PT0M", txt)]);
    }
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

async function main() {
  const gid = await findGist();
  if (!gid) { log("Gist bulunamadı; uygulamada eşitleme açılınca oluşur."); return; }
  { const g = await gh("/gists/" + gid); const b = await fileJSON(g, BFILE); const st = await fileJSON(g, FILE);
    log("dosyalar", Object.keys(g.files).join(","), "cihaz", Object.values(b?.subs || {}).map(x => x.ad + ":" + String(x.endpoint).slice(8, 30)).join(" "), "vapid", !!b?.vapid, "ilçe", st?.settings?.notify?.ilce?.ad, "test", b?.test); }
  let gon = null, gonTxt = "", vapidSet = "";
  while (Date.now() - T0 < LIFE) {
    const g = await gh("/gists/" + gid);
    const [state, bil] = [await fileJSON(g, FILE), await fileJSON(g, BFILE)];
    if (!gon) { gon = (await fileJSON(g, GFILE)) || {}; gon.sent = gon.sent || {}; gon.gone = gon.gone || []; gonTxt = JSON.stringify(gon); }
    const N = defaultsNotify(state?.settings?.notify);
    const now = Date.now();
    // vakitleri günde bir (ya da ilçe değişince, ya da yarının vakti yoksa) yenile
    const v = gon.vakit;
    if (!v || v.id !== N.ilce.id || now - (v.fetched || 0) > 12 * 3600000 || !v.days[addDays(isoTR(now), 1)]) {
      try { const r = await fetchTimes(N.ilce.id); gon.vakit = { id: N.ilce.id, ad: N.ilce.ad, kaynak: r.kaynak, fetched: now, days: r.days }; delete gon.error; log("vakitler alındı", N.ilce.ad, r.kaynak, JSON.stringify(r.days[isoTR(now)])); }
      catch (e) { gon.error = e.message; if (!v) throw e; }
    }
    const subs = Object.values(bil?.subs || {}).filter(s => s.endpoint && !gon.gone.includes(s.endpoint));
    if (bil?.vapid?.pub && bil.vapid.pub + bil.vapid.priv !== vapidSet) { webpush.setVapidDetails(APP, bil.vapid.pub, bil.vapid.priv); vapidSet = bil.vapid.pub + bil.vapid.priv; }
    const due = events(state, bil, gon.vakit.days, now).filter(e => !gon.sent[e.key] && e.at <= now && e.at > now - (e.late || LATE));
    for (const e of due) {
      if (!subs.length || !vapidSet) continue; // henüz kayıtlı cihaz yok; süresi içinde kayıt olursa yine gönderilir
      let ok = 0;
      for (const s of subs) {
        try { await webpush.sendNotification(s, JSON.stringify({ title: e.title, body: e.body, tag: e.tag, url: APP }), { TTL: e.ttl, urgency: "high" }); ok++; }
        catch (err) { log("gönderilemedi", s.ad, err.statusCode, err.body); if (err.statusCode === 404 || err.statusCode === 410) gon.gone.push(s.endpoint); }
      }
      gon.sent[e.key] = now; log("gönderildi", e.key, ok + "/" + subs.length, e.title, "-", e.body);
    }
    // takvim dosyası (yalnız değiştiyse yazılır)
    if (N.takvim && gon.vakit?.days) {
      const t = buildIcs(N, gon.vakit.days, bil?.plan || {}, now);
      if (t !== (g.files["takvim.ics"]?.content || "")) { await gh("/gists/" + gid, { method: "PATCH", body: JSON.stringify({ files: { "takvim.ics": { content: t } } }) }); log("takvim güncellendi", (t.match(/BEGIN:VEVENT/g) || []).length, "olay"); }
    }
    // eski kayıtları temizle
    const cut = now - 3 * 86400000;
    for (const [k, t] of Object.entries(gon.sent)) if (t < cut) delete gon.sent[k];
    for (const d of Object.keys(gon.vakit.days)) if (d < addDays(isoTR(now), -2)) delete gon.vakit.days[d];
    gon.last = now;
    // son çalışma bilgisini en çok 5 dakikada bir yaz; gönderim olduysa hemen
    const txt = JSON.stringify({ ...gon, last: 0 });
    if (txt !== gonTxt || now - (gon.wrote || 0) > 5 * 60000) {
      gon.wrote = now; await gh("/gists/" + gid, { method: "PATCH", body: JSON.stringify({ files: { [GFILE]: { content: JSON.stringify(gon) } } }) });
      gonTxt = JSON.stringify({ ...gon, last: 0 });
    }
    // bir sonraki bildirime kadar (en çok 30 sn) bekle
    const next = events(state, bil, gon.vakit.days, now).filter(e => !gon.sent[e.key] && e.at > now).map(e => e.at).sort((a, b) => a - b)[0];
    const wait = Math.max(2000, Math.min(30000, next ? next - Date.now() : 30000));
    if (Date.now() - T0 + wait >= LIFE) break;
    await sleep(wait);
  }
}

try { await main(); }
catch (e) {
  log("HATA", e.message);
  try { const gid = await findGist(); if (gid) { const g = await gh("/gists/" + gid); const gon = (await fileJSON(g, GFILE)) || {}; gon.error = e.message + " (" + new Date().toISOString().slice(0, 16) + ")"; gon.last = Date.now(); await gh("/gists/" + gid, { method: "PATCH", body: JSON.stringify({ files: { [GFILE]: { content: JSON.stringify(gon) } } }) }); } } catch { }
}
