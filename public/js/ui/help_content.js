// Extracted from public/js/app/app.js (lines 97-257)
/* ==== INLINE HELP CONTENT ==== */
const HELP_ANSWERS = {
  ritual:{
    pl:{
      q:"Jak używać OneTapDay na co dzień?",
      a:"Każdego dnia robisz 3 rzeczy: 1) Klikasz 'Dodaj dzisiejsze ruchy' i dodajesz wyciąg bankowy, ruchy kasy lub faktury. 2) Klikasz 'Znajdź i potwierdź płatności' – system dopasuje przelewy do faktur i zaktualizuje statusy. 3) Klikasz 'Zamknij dzień' – widzisz wynik dnia, ryzyko, dni bezpieczeństwa i cel na jutro."
    },
    en:{
      q:"How to use OneTapDay every day?",
      a:"Every day you do 3 steps: 1) Click 'Add today movements' and add bank statement, cash movements or invoices. 2) Click 'Find & confirm payments' – the app matches transfers to invoices and updates statuses. 3) Click 'Close day' – you see daily result, risk, safety days and target for tomorrow."
    },
    ru:{
      q:"Как пользоваться OneTapDay каждый день?",
      a:"Каждый день у тебя 3 шага: 1) Нажимаешь 'Добавить движения за сегодня' и добавляешь выписку банка, движения кассы или счета. 2) Нажимаешь 'Найти и подтвердить платежи' – система сама сопоставит платежи со счетами и обновит статусы. 3) Нажимаешь 'Закрыть день' – видишь итог дня, риск, дни безопасности и цель на завтра."
    },
    uk:{
      q:"Як користуватися OneTapDay щодня?",
      a:"Щодня ти робиш 3 кроки: 1) Натискаєш 'Додати рухи за сьогодні' і додаєш виписку банку, касу або рахунки. 2) Натискаєш 'Знайти та підтвердити платежі' – система зіставляє платежі з рахунками. 3) Натискаєш 'Закрити день' – бачиш результат дня, ризик, дні безпеки та ціль на завтра."
    }
  },
  sync:{
    pl:{
      q:"Co to jest „Synchronizacja”?",
      a:"Synchronizacja odświeża dane z chmury: wyciągi, faktury, ustawienia. Używasz jej gdy pracujesz na kilku urządzeniach lub po imporcie danych z innego miejsca. Jeśli pracujesz tylko na jednym telefonie, zwykle wystarczy kliknąć raz na dzień."
    },
    en:{
      q:"What is 'Synchronisation'?",
      a:"Synchronisation refreshes data from the cloud: statements, invoices, settings. Use it when you work on multiple devices or after importing data elsewhere. If you use only one device, pressing it once per day is usually enough."
    },
    ru:{
      q:"Что такое «Синхронизация»?",
      a:"Синхронизация обновляет данные из облака: выписки, счета, настройки. Нажимай, если работаешь с нескольких устройств или только что что-то импортировал. Если ты работаешь с одного телефона, обычно достаточно раз в день."
    },
    uk:{
      q:"Що таке «Синхронізація»?",
      a:"Синхронізація оновлює дані з хмари: виписки, рахунки, налаштування. Натискай, якщо працюєш з кількох пристроїв або щось імпортував. Якщо один телефон – достатньо раз на день."
    }
  },
  match:{
    pl:{
      q:"Co to są „dopasowania płatności”?",
      a:"To połączenia między operacjami z wyciągu a fakturami. OneTapDay szuka przelewów, które pasują do kwoty i kontrahenta faktury, i oznacza faktury jako opłacone. Dzięki temu nie musisz ręcznie śledzić, co już zapłaciłeś."
    },
    en:{
      q:"What are 'payment matches'?",
      a:"These are links between statement operations and invoices. OneTapDay searches for transfers that match invoice amount and counterparty and marks invoices as paid, so you do not track it manually."
    },
    ru:{
      q:"Что такое «допасывания платежей»?",
      a:"Это связи между операциями по выписке и счетами. OneTapDay ищет платежи, которые совпадают по сумме и контрагенту, и помечает счета как оплаченные. Тебе не нужно вручную отслеживать, что уже оплачено."
    },
    uk:{
      q:"Що таке «співставлення платежів»?",
      a:"Це звʼязки між операціями з виписки та рахунками. OneTapDay шукає платежі, які збігаються за сумою та контрагентом, і позначає рахунки як оплачені."
    }
  },
  close_day:{
    pl:{
      q:"Po co przycisk „Zamknij dzień”?",
      a:"Zamknięcie dnia robi podsumowanie: wynik dnia (ile weszło, ile wyszło), 7 i 30 dni płatności do przodu, poziom ryzyka oraz cel na jutro. Jeśli codziennie zamykasz dzień – zawsze wiesz, czy biznes żyje, czy wchodzisz w minus."
    },
    en:{
      q:"Why do I need 'Close day'?",
      a:"Closing the day shows a summary: daily result, payments for the next 7 and 30 days, risk level and target for tomorrow. If you close every day, you always know if the business is alive or going into red."
    },
    ru:{
      q:"Зачем нужна кнопка «Закрыть день»?",
      a:"Закрытие дня делает срез: итог дня (сколько пришло, сколько ушло), платежи на 7 и 30 дней вперёд, уровень риска и цель на завтра. Если закрывать каждый день – ты всегда видишь, жив бизнес или летит в минус."
    },
    uk:{
      q:"Навіщо кнопка «Закрити день»?",
      a:"Закриття дня дає зріз: результат дня, платежі на 7 і 30 днів вперед, рівень ризику і ціль на завтра."
    }
  },
  risk:{
    pl:{
      q:"Co oznacza kolor ryzyka i dni bezpieczeństwa?",
      a:"Zielony – masz pieniądze na wszystkie płatności w 30 dni. Żółty – starczy na 7 dni, ale nie na cały miesiąc. Czerwony – nie ma pieniędzy na najbliższe 7 dni. Liczba dni bezpieczeństwa pokazuje, ile dni biznes przeżyje przy obecnym tempie, zanim zabraknie na zobowiązania."
    },
    en:{
      q:"What do risk colour and safety days mean?",
      a:"Green – you can cover all payments in the next 30 days. Yellow – you cover only about 7 days. Red – you do not have money for the next 7 days. Safety days tell you how many days your business survives with current cash versus upcoming payments."
    },
    ru:{
      q:"Что значит цвет риска и «дни безопасности»?",
      a:"Зелёный – денег хватает на все платежи в ближайшие 30 дней. Жёлтый – хватает примерно на 7 дней, но не на месяц. Красный – не хватает даже на ближайшую неделю. Дни безопасности показывают, сколько дней бизнес проживёт при текущем запасе денег."
    },
    uk:{
      q:"Що означає колір ризику та «дні безпеки»?",
      a:"Зелений – грошей вистачає на всі платежі у 30 днів. Жовтий – вистачає приблизно на тиждень. Червоний – не вистачає навіть на найближчі 7 днів. Дні безпеки показують, скільки днів бізнес проживе з поточним запасом грошей."
    }
  },
  export:{
    pl:{
      q:"Po co eksport CSV / księgi?",
      a:"Eksport księgi robi plik CSV z wszystkimi ruchami: bank, kasa, faktury. Ten plik możesz wysłać księgowej, wczytać do innego systemu lub trzymać jako backup. To twój dziennik finansowy w jednym pliku."
    },
    en:{
      q:"Why export CSV / ledger?",
      a:"Ledger export creates a CSV file with all movements: bank, cash, invoices. You can send it to your accountant, import into other software or keep as a backup."
    },
    ru:{
      q:"Зачем экспорт CSV / книги?",
      a:"Экспорт книги делает CSV-файл со всеми движениями: банк, касса, счета. Его можно отправить бухгалтеру, загрузить в другую систему или хранить как резервную копию."
    },
    uk:{
      q:"Навіщо експорт CSV / книги?",
      a:"Експорт книги створює CSV з усіма рухами: банк, каса, рахунки. Можна передати бухгалтеру або імпортувати в інші системи."
    }
  },
  cash:{
    pl:{
      q:"Jak pracować z kasą (gotówką)?",
      a:"W zakładce Kasa zapisujesz każdy ruch gotówki: przyjęcie (sprzedaż, wpłata do kasy) i wydanie (zakup, wypłata z kasy). Te ruchy liczą się do dostępnych pieniędzy i podsumowań dnia. Jeśli nie zapisujesz kasy – widzisz tylko część obrazu."
    },
    en:{
      q:"How to work with cash?",
      a:"In the Cash tab you record every cash movement: in (sales, deposit) and out (purchases, withdrawals). Cash is added to available money and daily summaries. If you do not record cash, you only see part of the picture."
    },
    ru:{
      q:"Как работать с кассой (наличкой)?",
      a:"Во вкладке Касса ты записываешь каждое движение налички: приход (продажа, внесение) и расход (покупка, выдача). Эти движения входят в доступные деньги и итоги дня. Если не вести кассу – ты видишь только часть картины."
    },
    uk:{
      q:"Як працювати з касою (готівкою)?",
      a:"У вкладці Каса ти фіксуєш кожен рух готівки: прихід і витрату. Ці рухи входять у доступні гроші та підсумки дня."
    }
  }
};

function getCurrentLang(){
  return localStorage.getItem('otd_lang') || 'pl';
}

function getHelpText(topicKey){
  const lang = getCurrentLang();
  const t = (HELP_ANSWERS[topicKey] && (HELP_ANSWERS[topicKey][lang] || HELP_ANSWERS[topicKey].pl)) || null;
  return t;
}

function showHelpTopic(topicKey){
  const box = $id('helperAnswer');
  if(!box){ return; }
  const t = getHelpText(topicKey);
  if(!t){
    box.innerHTML = '<div>Brak odpowiedzi na to pytanie. Jeśli chcesz, napisz do nas: support@onetapday.com.</div>';
    return;
  }
  box.innerHTML = '<div><strong>'+t.q+'</strong></div><div style="margin-top:4px">'+t.a+'</div>';
}

function toggleHelper(open){
  const panel = $id('helperPanel');
  if(!panel) return;
  if(typeof open==='boolean'){
    panel.classList.toggle('show', open);
  }else{
    panel.classList.toggle('show');
  }
}

