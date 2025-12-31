// Extracted from public/js/app/app.js (lines 258-289)
/* ==== INLINE HELP INIT ==== */
function initHelper(){
  const fab = $id('helperFab');
  const close = $id('helperClose');
  const topics = document.querySelectorAll('#helperTopics .helper-chip');
  const search = $id('helperSearch');
  fab && fab.addEventListener('click', ()=>toggleHelper());
  close && close.addEventListener('click', ()=>toggleHelper(false));
  topics.forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const key = chip.getAttribute('data-topic');
      if(key) showHelpTopic(key);
    });
  });
  if(search){
    search.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        const q = (search.value||'').toLowerCase();
        if(!q) return;
        // bardzo proste mapowanie słów kluczowych
        if(q.includes('sync')||q.includes('synchron')||q.includes('синх')) showHelpTopic('sync');
        else if(q.includes('dopas')||q.includes('match')||q.includes('сопост')||q.includes('співстав')) showHelpTopic('match');
        else if(q.includes('zamkn')||q.includes('close')||q.includes('закрыть')||q.includes('закрити')) showHelpTopic('close_day');
        else if(q.includes('ryzyk')||q.includes('risk')||q.includes('безоп')||q.includes('ризик')) showHelpTopic('risk');
        else if(q.includes('csv')||q.includes('eksport')||q.includes('export')||q.includes('книга')) showHelpTopic('export');
        else if(q.includes('kasa')||q.includes('cash')||q.includes('налич')) showHelpTopic('cash');
        else if(q.includes('jak')||q.includes('how')||q.includes('как')||q.includes('як')) showHelpTopic('ritual');
        else showHelpTopic('ritual');
      }
    });
  }
}
