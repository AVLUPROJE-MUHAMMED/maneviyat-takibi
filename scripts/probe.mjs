// Diyanet vakit verisinin geldiği kaynağı dener ve il/ilçe listesini çıkarır.
import fs from "node:fs";
const B="https://ezanvakti.emushaf.net";
const j=async p=>{const r=await fetch(B+p);if(!r.ok)throw new Error(p+" "+r.status);return r.json()};
const ulkeler=await j("/ulkeler");
console.log("ulke sample",JSON.stringify(ulkeler.slice(0,3)));
const tr=ulkeler.find(u=>/T[UÜ]RK[IİY]/i.test(u.UlkeAdi||u.UlkeAdiEn||""));
console.log("tr",JSON.stringify(tr));
const sehirler=await j("/sehirler/"+(tr.UlkeID));
console.log("sehir sample",JSON.stringify(sehirler.slice(0,3)), sehirler.length);
const out=[];
for(const s of sehirler){
  const ilceler=await j("/ilceler/"+s.SehirID);
  out.push({il:s.SehirAdi,id:s.SehirID,ilceler:ilceler.map(x=>[x.IlceAdi,x.IlceID])});
}
console.log("ilce sample",JSON.stringify(out[0]).slice(0,400));
fs.writeFileSync("ilceler.json",JSON.stringify(out));
const v=await j("/vakitler/9541");
console.log("vakit count",v.length, JSON.stringify(v.slice(0,2)));
