/* OneTapDay AI Engine (local heuristic) v17
   Deterministic assistant that answers from your data (no hallucinations).
   Later you can swap it for a server model without changing the UI.
*/
(function(){
  'use strict';

  const T = ()=> (window.OTD_AITOOLS || null);

  function safeProfile(p){
    p = p && typeof p==='object' ? p : {};
    return {
      type: p.type || 'solo',
      niche: p.niche || '',
      goal: p.goal || 'grow',
      incomeTarget: Number(p.incomeTarget||0) || 0
    };
  }

  function greeting(profile){
    const p = safeProfile(profile);
    const niche = p.niche ? ` (${p.niche})` : '';
    const goal = p.goal ? `, цель: ${p.goal}` : '';
    return `Привет! Я AI‑бухгалтер OneTapDay${niche}${goal}.\n` +
           `Я работаю по твоим данным и могу:\n` +
           `• закрыть «контроль дня» (что важно сегодня)\n` +
           `• найти «Без категории» (и + и −)\n` +
           `• показать утечки / подписки / аномалии\n` +
           `• прикинуть runway и безопасный буфер`;
  }

  function pickDays(q, fallback){
    const s = String(q||'').toLowerCase();
    if(s.includes('сегодня') || s.includes('today')) return 1;
    const m = s.match(/(\d{1,3})\s*(дн|day)/);
    if(m){
      const d = Number(m[1]);
      if(d>=1 && d<=365) return d;
    }
    if(s.includes('недел') || s.includes('week')) return 7;
    if(s.includes('месяц') || s.includes('month')) return 30;
    if(s.includes('квартал') || s.includes('quarter')) return 90;
    return Number(fallback||30);
  }

  function findCategoryInQuery(q, categories){
    const s = String(q||'').toLowerCase();
    // explicit: "категория: X"
    const m = s.match(/категор(?:ия|ии)\s*[:\-]\s*([^\n\r]+)/i);
    if(m) return String(m[1]).trim();

    // fuzzy: if query contains category name
    const cats = (categories||[]).map(c=>String(c||'')).filter(Boolean);
    let best = '';
    let bestLen = 0;
    for(const c of cats){
      const low = c.toLowerCase();
      if(low.length<3) continue;
      if(s.includes(low) && low.length>bestLen){
        best = c;
        bestLen = low.length;
      }
    }
    return best;
  }

  function detectIntent(q){
    const s = String(q||'').toLowerCase();

    // High-priority
    if(s.includes('bez kategor') || s.includes('без катег') || s.includes('без категор')) return 'uncat';
    if(s.includes('подписк') || s.includes('subscription') || s.includes('abonament') || s.includes('netflix') || s.includes('spotify')) return 'subs';
    if(s.includes('аномал') || s.includes('подозр') || s.includes('странн') || s.includes('fraud') || s.includes('ошиб')) return 'anomaly';
    if(s.includes('контроль') || s.includes('закры') || s.includes('one tap') || s.includes('день') && (s.includes('закры')||s.includes('итог')||s.includes('сводк'))) return 'checkin';

    // Classic
    if(s.includes('трачу') || s.includes('расход') || s.includes('утеч') || s.includes('spend') || s.includes('wydatk')) return 'spend';
    if(s.includes('доход') || s.includes('зарплат') || s.includes('przych') || s.includes('income')) return 'income';
    if(s.includes('хватит') || s.includes('конца месяц') || s.includes('runway') || s.includes('до конца')) return 'runway';
    if(s.includes('вывести') || s.includes('withdraw') || s.includes('безопас') || s.includes('bezpiecz')) return 'withdraw';

    // Budget/goal/planning
    if(s.includes('лимит') || s.includes('бюджет') || s.includes('limit')) return 'budget';
    if(s.includes('цель') || s.includes('goal') || s.includes('план') || s.includes('15к') || s.includes('20к')) return 'plan';
    if(s.includes('квартира') || s.includes('аренд') || s.includes('rent')) return 'cashshock';

    // Category drill-down if category mentioned
    if(s.includes('категор')) return 'category';

    return 'general';
  }

  function fmtList(items){
    return (items||[]).filter(Boolean).map(x=>'• '+x).join('\n');
  }

  function answerUncat(entries){
    const tools = T();
    const uncat = tools.uncategorized(entries);
    if(uncat.length===0){
      return '✅ У тебя нет операций без категории. Редкий вид человека.';
    }
    const show = uncat.slice(0, 12).map(e=>tools.shortRow(e)).map(x=>'• '+x).join('\n');
    const tail = uncat.length>12 ? `\n…и ещё ${uncat.length-12} шт.` : '';
    const topMerch = tools.topMerchants(uncat, 'all').slice(0,5).map(m=>`${m.merchant} (${m.count})`);
    const sugg = topMerch.length ? `\n\nЧаще всего без категории:\n${fmtList(topMerch)}` : '';
    return `У тебя ${uncat.length} операций без категории (и доходы, и расходы).\n${show}${tail}${sugg}\n\nДействие: открой «Без категории» и разнеси пачкой, иначе отчёты будут врать.`;
  }

  function answerSpending(entries, days){
    const tools = T();
    const last = tools.filterByDays(entries, days);
    const top = tools.topCats(last, 'spend').slice(0, 6);
    const spend = last.filter(e=>e.amount<0);
    const total = Math.abs(tools.sum(spend));

    const uncatCount = tools.uncategorized(last).filter(e=>e.amount<0).length;

    if(top.length===0){
      return `За последние ${days} дней я не вижу нормальных категорий расходов.\n` +
             (uncatCount?`Зато вижу «Без категории» по расходам: ${uncatCount} шт. Разнеси их и станет ясно, куда утекают деньги.`:'');
    }

    const lines = top.map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    const merch = tools.topMerchants(spend, 'spend').slice(0,5).map(m=>`${m.merchant}: ${tools.fmtMoney(m.sum)}`);
    return `Расходы за ${days} дней: ${tools.fmtMoney(-total)}.\n` +
           `Топ категорий:\n${fmtList(lines)}\n` +
           (uncatCount?`\n⚠️ Без категории (расходы): ${uncatCount} шт.`:'') +
           (merch.length?`\n\nТоп мест/мерчантов:\n${fmtList(merch)}`:'') +
           `\n\nДействия: разнести «Без категории» → проверить 1–2 самых крупных траты → при желании добавить правило категории.`;
  }

  function answerIncome(entries, days, profile){
    const tools = T();
    const last = tools.filterByDays(entries, days);
    const top = tools.topCats(last, 'income').slice(0, 6);
    const inc = last.filter(e=>e.amount>0);
    const total = tools.sum(inc);

    const p = safeProfile(profile);
    const target = p.incomeTarget ? p.incomeTarget : 0;
    const gap = target ? (target - total) : 0;

    if(top.length===0){
      return `За последние ${days} дней я не вижу доходов по категориям.\n` +
             `Сделай минимум: заведи категории дохода («зарплата», «клиенты», «возвраты») и помечай + операции.`;
    }

    const lines = top.map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    let tail = '';
    if(target){
      tail = gap>0
        ? `\nЦель: ${target} PLN/мес. Сейчас по данным: ${tools.fmtMoney(total)} (не хватает ${tools.fmtMoney(gap)}).`
        : `\nЦель: ${target} PLN/мес. Сейчас по данным: ${tools.fmtMoney(total)} (цель уже перекрыта).`;
    }
    return `Доходы за ${days} дней: ${tools.fmtMoney(total)}.${tail}\nТоп категорий:\n${fmtList(lines)}\n\nДействия: пометить + операции по источникам → убрать «Без категории» по доходам → сравнить с целью.`;
  }

  function answerRunway(entries, daysForAvg){
    const tools = T();
    const pos = tools.computeCashPosition(entries, daysForAvg||14);
    const cash = pos.kasaBal;
    const avg = pos.avgDaily || 0;
    if(avg<=0){
      return `Сейчас я не могу честно посчитать runway: мало истории расходов за последние ${daysForAvg||14} дней.\n` +
             `Импортируй выписку и веди кассу хотя бы неделю.`;
    }
    const days = Math.floor(cash / avg);
    return `Runway (MVP):\n` +
           `• Касса: ${tools.fmtMoney(cash)}\n` +
           `• Средний расход/день (${daysForAvg||14}д): ${tools.fmtMoney(-avg)}\n` +
           `• Прогноз: ~${days} дней\n\n` +
           `Действия: разнести «Без категории» → убрать лишнее из топ‑категорий → держать буфер 14 дней.`;
  }

  function answerWithdraw(entries){
    const tools = T();
    const pos = tools.computeCashPosition(entries, 14);
    const cash = pos.kasaBal;
    const avg = pos.avgDaily || 0;
    if(avg<=0){
      return `Чтобы оценить «сколько можно безопасно вывести», нужен средний дневной расход.\n` +
             `Сейчас он не считается (мало данных).`;
    }
    const buffer = avg * 14; // 14-day buffer
    const safe = Math.max(0, cash - buffer);
    return `Безопасный вывод (грубо, MVP):\n` +
           `• Касса: ${tools.fmtMoney(cash)}\n` +
           `• Буфер 14 дней: ${tools.fmtMoney(-buffer)}\n` +
           `• Можно вывести: ${tools.fmtMoney(safe)}\n\n` +
           `Это математика по данным, не налоговый совет.`;
  }

  function answerSubscriptions(entries){
    const tools = T();
    const rec = tools.detectRecurring(entries, 180).slice(0, 8);
    if(rec.length===0){
      return `Я не нашёл явных подписок/регулярных платежей.\n` +
             `Если они есть, обычно проблема в описании (мерчант пустой) или всё сидит в «Без категории».`;
    }
    const lines = rec.map(r=>{
      const cadence = r.cadenceDays>=20 ? 'примерно ежемесячно' : 'примерно еженедельно';
      return `${r.merchant}: ${tools.fmtMoney(r.avgAmount)} · ${cadence} · ${r.count} раз`;
    });
    return `Похоже на регулярные платежи (подписки/повторы):\n${fmtList(lines)}\n\nДействия: вынести их в отдельную категорию «Подписки» → проверить, что можно отключить.`;
  }

  function answerAnomaly(entries, days){
    const tools = T();
    const last = tools.filterByDays(entries, days);
    if(last.length<5) return `Слишком мало данных за ${days} дней, чтобы искать аномалии.`;
    const abs = last.map(e=>Math.abs(Number(e.amount)||0));
    const med = tools.median(abs) || 0;
    const big = last
      .slice()
      .sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))
      .filter(e=> med===0 ? true : (Math.abs(e.amount) >= med*2))
      .slice(0, 8);

    if(big.length===0) return `За ${days} дней нет явных аномалий относительно твоих типичных сумм.`;

    const lines = big.map(e=>tools.shortRow(e));
    return `Подозрительные/крупные операции за ${days} дней (выше ~2× медианы):\n${fmtList(lines)}\n\nДействия: проверь 1–2 самых крупных → уточни категорию → если это подписка, вынеси в «Подписки».`;
  }

  function answerCategory(entries, q, days){
    const tools = T();
    const cats = tools.listCategories(entries);
    const cat = findCategoryInQuery(q, cats);
    if(!cat){
      return `Я не понял, какую категорию разбирать.\n` +
             `Напиши например: "категория: топливо" или просто название категории из списка.`;
    }
    const last = tools.filterByDays(entries, days);
    const inCat = last.filter(e=> String(e.category||'').toLowerCase()===String(cat).toLowerCase());
    if(inCat.length===0){
      return `По категории «${cat}» за ${days} дней данных нет.\n` +
             `Если ты только что назначил категорию, проверь что операции реально сохранены.`;
    }
    const total = tools.sum(inCat);
    const inc = tools.sum(inCat.filter(e=>e.amount>0));
    const out = Math.abs(tools.sum(inCat.filter(e=>e.amount<0)));
    const topM = tools.topMerchants(inCat, 'all').slice(0,5).map(m=>`${m.merchant}: ${tools.fmtMoney(m.sum)} (${m.count})`);
    const lastRows = inCat.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10).map(e=>tools.shortRow(e));
    return `Категория «${cat}» за ${days} дней:\n` +
           `• Итог: ${tools.fmtMoney(total)} (доход ${tools.fmtMoney(inc)}, расход ${tools.fmtMoney(-out)})\n` +
           (topM.length?`\nТоп мерчантов:\n${fmtList(topM)}`:'') +
           `\n\nПоследние операции:\n${fmtList(lastRows)}\n\nДействия: если тут много «Без категории» рядом, создай правило; если знак суммы неверный, поправь тип операции.`;
  }

  function answerBudget(entries, q){
    const tools = T();
    const days = pickDays(q, 30);
    const cats = tools.listCategories(entries);
    const cat = findCategoryInQuery(q, cats);
    const last = tools.filterByDays(entries, days);
    const spend = last.filter(e=>e.amount<0);

    if(!cat){
      const top = tools.topCats(last, 'spend').slice(0,6).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
      return `Бюджет лучше ставить на конкретную категорию.\n` +
             `Вот твой топ расходов за ${days} дней:\n${fmtList(top)}\n\nНапиши: "лимит категория: продукты 1200" (позже добавим автосохранение лимита).`;
    }
    const inCat = last.filter(e=> String(e.category||'').toLowerCase()===String(cat).toLowerCase() && e.amount<0);
    const cur = Math.abs(tools.sum(inCat));
    const proposed = Math.round(cur*0.9); // 10% cut baseline
    return `Категория «${cat}» за ${days} дней: ${tools.fmtMoney(-cur)}.\n` +
           `Если хочешь почувствовать эффект без боли: лимит на следующий период ~${proposed} PLN (−10%).\n\n` +
           `Действия: убрать 1–2 крупных траты в этой категории → вынести подписки отдельно → держать «Другое» под контролем.`;
  }

  function answerPlan(entries, profile){
    const tools = T();
    const p = safeProfile(profile);
    const days = 30;
    const last = tools.filterByDays(entries, days);
    const inc = tools.sum(last.filter(e=>e.amount>0));
    const out = Math.abs(tools.sum(last.filter(e=>e.amount<0)));
    const net = inc - out;
    const target = p.incomeTarget || 0;

    let goalLine = '';
    if(target){
      const gap = target - inc;
      goalLine = gap>0
        ? `Цель дохода: ${target} PLN/мес. Сейчас по данным: ${tools.fmtMoney(inc)} (нужно +${gap.toFixed(0)} PLN).`
        : `Цель дохода: ${target} PLN/мес. Сейчас по данным: ${tools.fmtMoney(inc)} (перекрыто).`;
    }

    const topSpend = tools.topCats(last, 'spend').slice(0,4).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    const topInc = tools.topCats(last, 'income').slice(0,4).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    return `План по цифрам (последние ${days} дней):\n` +
           `• Доход: ${tools.fmtMoney(inc)}\n` +
           `• Расход: ${tools.fmtMoney(-out)}\n` +
           `• Чистыми: ${tools.fmtMoney(net)}\n` +
           (goalLine?`\n${goalLine}\n`:'\n') +
           (topInc.length?`Топ доходов:\n${fmtList(topInc)}\n\n`:'') +
           (topSpend.length?`Топ расходов:\n${fmtList(topSpend)}\n\n`:'') +
           `Действия на MVP‑уровне:\n` +
           `1) Убрать «Без категории» (иначе план фейковый)\n` +
           `2) Отдельно пометить «зарплата/клиенты/возвраты»\n` +
           `3) Резать одну топ‑категорию на 10–15% или добирать доход в одном источнике`;
  }

  function answerCashshock(entries){
    const tools = T();
    const days = 30;
    const last = tools.filterByDays(entries, days);
    const inc = tools.sum(last.filter(e=>e.amount>0));
    const out = Math.abs(tools.sum(last.filter(e=>e.amount<0)));
    const net = inc - out;
    const topSpend = tools.topCats(last, 'spend').slice(0,6).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    return `Если «не хватает на квартиру», почти всегда причина в одном из трёх:\n` +
           `• доход ниже ожиданий\n• «Другое/Без категории» съело бюджет\n• подписки/мелкие траты накопились\n\n` +
           `По твоим данным за ${days} дней:\n` +
           `• доход: ${tools.fmtMoney(inc)}\n` +
           `• расход: ${tools.fmtMoney(-out)}\n` +
           `• чистыми: ${tools.fmtMoney(net)}\n\n` +
           `Топ утечек:\n${fmtList(topSpend)}\n\n` +
           `Действия: вынести аренду в отдельную категорию → убрать «Без категории» → проверить подписки.`;
  }

  function answerCheckin(entries){
    const tools = T();
    const last1 = tools.filterByDays(entries, 1);
    const last7 = tools.filterByDays(entries, 7);

    const inc1 = tools.sum(last1.filter(e=>e.amount>0));
    const out1 = Math.abs(tools.sum(last1.filter(e=>e.amount<0)));
    const uncat1 = tools.uncategorized(last1).length;

    const inc7 = tools.sum(last7.filter(e=>e.amount>0));
    const out7 = Math.abs(tools.sum(last7.filter(e=>e.amount<0)));
    const uncat7 = tools.uncategorized(last7).length;

    const top7 = tools.topCats(last7, 'spend').slice(0,4).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    return `Контроль дня:\n` +
           `• Сегодня: +${inc1.toFixed(2)} / −${out1.toFixed(2)} PLN` + (uncat1?` (без категории: ${uncat1})`:'') + `\n` +
           `• 7 дней: +${inc7.toFixed(2)} / −${out7.toFixed(2)} PLN` + (uncat7?` (без категории: ${uncat7})`:'') + `\n\n` +
           (top7.length?`Топ расходов 7 дней:\n${fmtList(top7)}\n\n`:'') +
           `Сделать сейчас (2–3 тапа):\n` +
           `1) Разнести «Без категории»\n` +
           `2) Открыть топ‑категорию и проверить крупные операции\n` +
           `3) Если есть подписки: вынести их отдельно`;
  }

  function answerGeneral(entries, profile){
    const tools = T();
    const last7 = tools.filterByDays(entries, 7);
    const inc = tools.sum(last7.filter(e=>e.amount>0));
    const out = Math.abs(tools.sum(last7.filter(e=>e.amount<0)));
    const uncat = tools.uncategorized(last7).length;
    const p = safeProfile(profile);
    const niche = p.niche ? `Ниша: ${p.niche}. ` : '';
    const target = p.incomeTarget ? `Цель дохода: ${p.incomeTarget} PLN/мес. ` : '';
    const topSpend = tools.topCats(last7, 'spend').slice(0,3).map(t=>`${t.category}: ${tools.fmtMoney(t.amount)}`);
    return `${niche}${target}\nЗа 7 дней: доход ${tools.fmtMoney(inc)}, расход ${tools.fmtMoney(-out)}.\n` +
           (uncat?`⚠️ «Без категории» (7д): ${uncat} шт.`:'') +
           (topSpend.length?`\nТоп расходов:\n${fmtList(topSpend)}`:'') +
           `\n\nСпроси, например:\n• Контроль дня\n• Подписки\n• Аномалии\n• Категория: <название>\n• Бюджет/лимит\n• Хватит ли денег до конца месяца?`;
  }

  async function answer(q, ctx){
    const tools = T();
    if(!tools) return 'AI-tools не загрузились. Проверь /js/ai/ai-tools.js.';
    const entries = tools.getAllEntries();
    const profile = safeProfile(ctx && ctx.profile);

    const intent = detectIntent(q);
    const days = pickDays(q, 30);

    switch(intent){
      case 'uncat': return answerUncat(entries);
      case 'subs': return answerSubscriptions(entries);
      case 'anomaly': return answerAnomaly(entries, days);
      case 'checkin': return answerCheckin(entries);
      case 'spend': return answerSpending(entries, days);
      case 'income': return answerIncome(entries, days, profile);
      case 'runway': return answerRunway(entries, 14);
      case 'withdraw': return answerWithdraw(entries);
      case 'budget': return answerBudget(entries, q);
      case 'plan': return answerPlan(entries, profile);
      case 'cashshock': return answerCashshock(entries);
      case 'category': return answerCategory(entries, q, days);
      default:
        // If query includes a known category, treat as drill-down
        {
          const cat = findCategoryInQuery(q, tools.listCategories(entries));
          if(cat) return answerCategory(entries, q, days);
        }
        return answerGeneral(entries, profile);
    }
  }

  window.OTD_AI_ENGINE = { greeting, answer };
})();
