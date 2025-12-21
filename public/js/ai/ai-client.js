/* OneTapDay AI Client v16
   Public API used by app-main.js: window.OTD_AI.answer() + window.OTD_AI.greeting()
*/
(function(){
  'use strict';

  function greeting(profile){
    if(window.OTD_AI_ENGINE && typeof window.OTD_AI_ENGINE.greeting==='function'){
      return window.OTD_AI_ENGINE.greeting(profile);
    }
    return 'Привет! Я AI‑бухгалтер OneTapDay.';
  }

  async function answer(text, ctx){
    if(window.OTD_AI_ENGINE && typeof window.OTD_AI_ENGINE.answer==='function'){
      return window.OTD_AI_ENGINE.answer(text, ctx);
    }
    return 'AI engine не подключён.';
  }

  // Keep the surface minimal so swapping to server later is painless.
  window.OTD_AI = { greeting, answer };
})();
