// Extracted from public/js/app/app.js (lines 4397-4416)
/* ==== CASH QUICK EXAMPLES ==== */
const cashQuickExamples={pl:["Przyjąć 250 na produkty","Wypłacić 50 na dostawę","Przyjąć 1000 depozyt","Przyjąć 50 na napoje"],
ru:["Принять 250 на продукты","Выдать 50 на доставку","Принять 1000 депозит","Принять 50 на напитки"],
en:["Accept 250 for groceries","Pay out 50 for delivery","Accept 1000 deposit","Accept 50 for drinks"],
uk:["Прийняти 250 на продукти","Видати 50 на доставку","Прийняти 1000 депозит","Прийняти 50 на напої"]};
function renderCashExamples(lang){
  const holder=$id('kasaQuickHolder'); if(!holder) return; holder.innerHTML='';
  const arr=cashQuickExamples[lang]||cashQuickExamples.pl;
  arr.forEach(txt=>{
    const btn=document.createElement('button'); btn.type='button'; btn.textContent=txt;
    btn.addEventListener('click',()=>{
      const numMatch=txt.match(/(-?\d+[.,]?\d*)/); const num=numMatch?asNum(numMatch[1]):0;
      const outRe=/(wyda|wypłac|pay out|видат|выда)/i; const isOut=outRe.test(txt);
      const note=txt.replace(/(-?\d+[.,]?\d*\s*(zł|pln|PLN|USD|EUR)?)/i,"").trim();
      addKasa(isOut?'wydanie':'przyjęcie', num, note||txt, 'quick');
    });
    holder.appendChild(btn);
  });
}

