// /sync-cloud.js
// Синхронизация всего стейта (kasa + wyciąg + faktury + accMeta + настройки) через Firebase

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyClatmXXE1ZG-MjKcHrquz2HSOZ4SswVVs",
  authDomain: "onetapday-d45a6.firebaseapp.com",
  databaseURL: "https://onetapday-d45a6-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "onetapday-d45a6",
  storageBucket: "onetapday-d45a6.firebasestorage.app",
  messagingSenderId: "402338811274",
  appId: "1:402338811274:web:ad8ce7c6d47bb51b22cc73",
  measurementId: "G-DEDSHTT30C"
};




const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const isLocalEnv =
  ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname) ||
  window.location.protocol === 'file:';


// тот же формат ключа, который ты уже видишь в базе: 1tapday@gmail,com
function keyFromEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, ",")
    .replace(/[^a-z0-9,@_-]/g, "");
}

// какие ключи настроек таскаем как строки
const SETTINGS_KEYS = [
  "txUrl",
  "billUrl",
  "cashPLN",
  "penaltyPct",
  "intervalMin",
  "rateEUR",
  "rateUSD",
  "blacklist",
  "autoCash",
  "otd_sub_active",
  "otd_sub_from",
  "otd_sub_to",
  "otd_demo_started_at",
  "otd_demo_used",
  "otd_lang",
  "speechLang"
];


// читаем локальный стейт из localStorage
function readLocalState() {
  const st = {
    kasa: [],
    tx: [],
    bills: [],
    accMeta: {},
    settings: {}
  };

  try {
    st.kasa = JSON.parse(localStorage.getItem("kasa") || "[]");
  } catch (e) {
    st.kasa = [];
  }

  try {
    st.tx = JSON.parse(localStorage.getItem("tx_manual_import") || "[]");
  } catch (e) {
    st.tx = [];
  }

  try {
    st.bills = JSON.parse(localStorage.getItem("bills_manual_import") || "[]");
  } catch (e) {
    st.bills = [];
  }

  try {
    st.accMeta = JSON.parse(localStorage.getItem("accMeta") || "{}");
  } catch (e) {
    st.accMeta = {};
  }

  SETTINGS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null && v !== undefined) {
      st.settings[k] = v;
    }
  });

  return st;
}

// читаем новый формат: всё лежит в blob как одна JSON-строка
function fromBlob(remote) {
  if (remote && typeof remote.blob === "string") {
    try {
      const parsed = JSON.parse(remote.blob);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (e) {
      console.warn("[cloud-sync] failed to parse blob", e);
    }
  }
  return null;
}

// приводим удалённый стейт в нормальный вид + читаем старую структуру (где всё было в settings строками)
function normalizeRemote(remote) {
  // Новый формат через blob
  const blobState = fromBlob(remote);
  if (blobState) {
    return blobState;
  }

  // Старый формат — оставляем для совместимости
  const out = {
    kasa: [],
    tx: [],
    bills: [],
    accMeta: {},
    settings: {}
  };

  if (remote && Array.isArray(remote.kasa)) out.kasa = remote.kasa;
  if (remote && Array.isArray(remote.tx)) out.tx = remote.tx;
  if (remote && Array.isArray(remote.bills)) out.bills = remote.bills;
  if (remote && remote.accMeta && typeof remote.accMeta === "object") {
    out.accMeta = remote.accMeta;
  }

  // старая схема: всё лежит в state.settings.{kasa, tx_manual_import, bills_manual_import, accMeta} как строки
  if (remote && remote.settings && typeof remote.settings === "object") {
    const s = remote.settings;

    if (!out.kasa.length && typeof s.kasa === "string") {
      try {
        out.kasa = JSON.parse(s.kasa);
      } catch {}
    }
    if (!out.tx.length && typeof s.tx_manual_import === "string") {
      try {
        out.tx = JSON.parse(s.tx_manual_import);
      } catch {}
    }
    if (!out.bills.length && typeof s.bills_manual_import === "string") {
      try {
        out.bills = JSON.parse(s.bills_manual_import);
      } catch {}
    }
    if (!Object.keys(out.accMeta).length && typeof s.accMeta === "string") {
      try {
        out.accMeta = JSON.parse(s.accMeta);
      } catch {}
    }

    Object.entries(s).forEach(([k, v]) => {
      if (["kasa", "tx", "bills", "accMeta"].includes(k)) return;
      out.settings[k] = String(v);
    });
  }

  return out;
}

// пишем стейт в localStorage
function writeLocalState(st) {
  if (!st || typeof st !== "object") return;

  if (Array.isArray(st.kasa)) {
    localStorage.setItem("kasa", JSON.stringify(st.kasa));
  }
  // не даём пустому массиву затирать локальную выписку
  if (Array.isArray(st.tx) && st.tx.length > 0) {
    localStorage.setItem("tx_manual_import", JSON.stringify(st.tx));
  }
  if (Array.isArray(st.bills)) {
    localStorage.setItem("bills_manual_import", JSON.stringify(st.bills));
  }
  if (st.accMeta && typeof st.accMeta === "object") {
    localStorage.setItem("accMeta", JSON.stringify(st.accMeta));
  }

  if (st.settings && typeof st.settings === "object") {
    Object.entries(st.settings).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      localStorage.setItem(k, String(v));
    });
  }
}

// === Адаптер для app.html: window.FirebaseSync ===
// app.html вызывает:
//   FirebaseSync.saveUserState(email, state)
//   FirebaseSync.subscribeUserState(email, callback)

if (!window.FirebaseSync) {
  window.FirebaseSync = {
    async saveUserState(email, fullState) {
      if (isLocalEnv) {
        console.log("[FirebaseSync] local env, skip cloud save for", email);
        return;
      }

      const key = keyFromEmail(email);
      if (!key) {
        console.warn("[FirebaseSync] empty email, skip save");
        return;
      }

      const local = readLocalState();
      const state = {
        kasa: Array.isArray(fullState && fullState.kasa) ? fullState.kasa : local.kasa,
        tx: Array.isArray(fullState && fullState.tx) ? fullState.tx : local.tx,
        bills: Array.isArray(fullState && fullState.bills) ? fullState.bills : local.bills,
        accMeta:
          fullState && fullState.accMeta && typeof fullState.accMeta === "object"
            ? fullState.accMeta
            : local.accMeta,
        settings:
          fullState && fullState.settings && typeof fullState.settings === "object"
            ? fullState.settings
            : local.settings
      };

      const userRef = ref(db, "users/" + key + "/state");
      try {
        await set(userRef, { blob: JSON.stringify(state) });
        console.log("[FirebaseSync] saved state for", email);
      } catch (e) {
        console.warn("[FirebaseSync] save error", e);
      }
    },

    subscribeUserState(email, callback) {
      if (isLocalEnv) {
        console.log("[FirebaseSync] local env, skip cloud subscribe for", email);
        if (typeof callback === "function") {
          callback({ kasa: [], tx: [], bills: [], accMeta: {}, settings: {} });
        }
        return;
      }

      const key = keyFromEmail(email);
      if (!key) {
        console.warn("[FirebaseSync] empty email, skip subscribe");
        return;
      }

      const userRef = ref(db, "users/" + key + "/state");

      onValue(userRef, snap => {
        const val = snap.val();
        const remoteNorm = normalizeRemote(val || {});
        try {
          callback(remoteNorm);
        } catch (e) {
          console.warn("[FirebaseSync] callback error", e);
        }
      });
    }
  };
}


