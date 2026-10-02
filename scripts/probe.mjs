// Diyanet vakitleri için olası kaynakları dener.
const UA={"User-Agent":"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36","Accept":"*/*"};
const tries=[
  "https://ezanvakti.emushaf.net/vakitler/9541",
  "https://ezanvakti.emushaf.net/sehirler/2",
  "https://namazvakitleri.diyanet.gov.tr/tr-TR/9541/istanbul-icin-namaz-vakti",
  "https://api.aladhan.com/v1/timingsByCity?city=Istanbul&country=Turkey&method=13",
  "https://vakit.vercel.app/api/timesForPlace?country=Turkey&region=%C4%B0stanbul&city=%C4%B0stanbul&date=2026-10-02&days=2&timezoneOffset=180",
  "https://vakit.vercel.app/api/regions?country=Turkey",
];
for(const u of tries){
  try{const r=await fetch(u,{headers:UA});const t=await r.text();console.log("==",r.status,u,"\n",t.slice(0,1500).replace(/\s+/g," "));
    if(u.includes("diyanet")){const i=t.indexOf("vakit-table");console.log("TABLE",t.slice(i,i+3000).replace(/\s+/g," "));}
  }catch(e){console.log("ERR",u,e.message)}
}
