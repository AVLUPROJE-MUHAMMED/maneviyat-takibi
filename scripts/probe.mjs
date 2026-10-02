// Diyanet il/ilçe listesini (Diyanet ilçe numaralarıyla) ilceler.json olarak çıkarır.
import fs from "node:fs";
const UA={"User-Agent":"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36"};
const B="https://ezanvakti.emushaf.net";
const j=async p=>{for(let i=0;i<4;i++){const r=await fetch(B+p,{headers:UA});if(r.ok)return r.json();await new Promise(s=>setTimeout(s,1500))}throw new Error(p)};
const sehirler=await j("/sehirler/2");
const out=[];
for(const s of sehirler){
  const ilceler=await j("/ilceler/"+s.SehirID);
  out.push([s.SehirAdi,ilceler.map(x=>[x.IlceAdi,Number(x.IlceID)])]);
}
console.log(out.length, JSON.stringify(out.find(x=>x[0]==="İSTANBUL")).slice(0,600));
fs.writeFileSync("ilceler.json",JSON.stringify(out));
