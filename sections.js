// Sezioni a tutto schermo (Allenamento, poi Dieta e Dispensa): si aprono dai pulsanti sotto l'onda,
// si chiudono con ✕ o con Back. Qui c'è anche la schermata di accesso all'archivio online.
(function () {
  const K = window.LeiCore;
  const DB = window.LeiDB;
  const $ = s => document.querySelector(s);
  const registry = {};
  let openId = null;

  // ---------- Date (ora locale, formato 'YYYY-MM-DD' come nell'archivio) ----------
  const pad = n => String(n).padStart(2, "0");
  const DAY_KEYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  const D = {
    iso: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    parse: s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); },
    today: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
    add: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    monday: d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; },
    key: d => DAY_KEYS[(d.getDay() + 6) % 7],
    between: (a, b) => Math.round((D.parse(D.iso(b)) - D.parse(D.iso(a))) / 86400000),
    label: (d, opts) => d.toLocaleDateString("it-IT", opts),
    DAY_KEYS
  };

  // Ricetta della settimana: stesso calcolo di MindEasy (lunedì della settimana + giorno + pasto)
  function hashSeed(text) {
    let x = 0;
    for (let i = 0; i < text.length; i++) x = (x * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(x);
  }
  function weekVariant(pool, date, mealId) {
    if (!pool || !pool.length) return null;
    return pool[hashSeed(`${D.iso(D.monday(date))}|${D.key(date)}|${mealId}`) % pool.length];
  }

  // ---------- Contenitore delle sezioni ----------
  function host(id) {
    let el = document.getElementById("sec-" + id);
    if (!el) {
      el = document.createElement("section");
      el.className = "section";
      el.id = "sec-" + id;
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }

  function register(id, def) { registry[id] = def; }

  let pendingOpts = null;   // opzioni da usare dopo l'accesso (es. { tab: "spesa" })
  function open(id, opts) {
    const def = registry[id];
    if (!def) return false;
    if (!DB.configured) { K.toast("Archivio online non configurato"); return true; }
    K.closeOverlays();
    openId = id;
    window.leiWave && window.leiWave.pause();
    if (!DB.signedIn) { pendingOpts = opts || null; showLogin(); return true; }
    const el = host(id);
    el.hidden = false;
    def.open(el, opts || pendingOpts || {});
    pendingOpts = null;
    return true;
  }

  function close() {
    if (openId) {
      const def = registry[openId];
      def && def.close && def.close();
      host(openId).hidden = true;
    }
    openId = null;
    $("#loginSheet").hidden = true;
    if (document.body.dataset.page === "home") window.leiWave && window.leiWave.resume();
  }

  // ---------- Accesso ----------
  function buildLogin() {
    const s = document.createElement("div");
    s.id = "loginSheet";
    s.className = "sheet";
    s.hidden = true;
    s.innerHTML = `
      <form class="sheet-box" autocomplete="off">
        <h3>Accedi all'archivio</h3>
        <p>Una volta sola: Lei resterà collegata ai dati di Dispensa e MindEasy.</p>
        <input class="field" name="email" type="email" placeholder="Email" required>
        <input class="field" name="password" type="password" placeholder="Password" required>
        <div class="login-error" hidden></div>
        <div class="row">
          <button type="button" data-act="cancel">Annulla</button>
          <button type="submit" class="primary">Accedi</button>
        </div>
      </form>`;
    document.body.appendChild(s);
    const form = s.querySelector("form"), err = s.querySelector(".login-error");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      err.hidden = true;
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Accesso…";
      try {
        await DB.signIn(form.email.value, form.password.value);
        form.password.value = "";
        s.hidden = true;
        const id = openId; openId = null;
        if (id) open(id);
      } catch (ex) {
        err.textContent = ex.status === 400 ? "Email o password non corrette" : "Non riesco a collegarmi: controlla il Wi-Fi";
        err.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = "Accedi";
      }
    });
    s.querySelector("[data-act=cancel]").addEventListener("click", close);
  }
  function showLogin() {
    const s = $("#loginSheet");
    s.hidden = false;
    s.querySelector(".login-error").hidden = true;
  }

  // Se l'accesso scade mentre una sezione è aperta, chiede di nuovo le credenziali
  DB.onChange(() => {
    if (openId && !DB.signedIn) { host(openId).hidden = true; showLogin(); }
    if (openId && registry[openId].sync) registry[openId].sync();
  });

  // Intestazione comune: titolo, sottotitolo, stato di sincronizzazione e ✕
  function header(title) {
    const h = document.createElement("header");
    h.className = "sec-head";
    h.innerHTML = `<div class="sec-titles"><h1></h1><div class="sec-sub"></div></div><div class="sec-sync"></div><button class="sec-close" aria-label="Chiudi">✕</button>`;
    h.querySelector("h1").textContent = title;
    h.querySelector(".sec-close").addEventListener("click", close);
    return h;
  }
  function syncLabel(el) {
    el.textContent = DB.pending ? `${DB.pending} modifiche da inviare` : DB.online ? "" : "senza rete · dati salvati";
  }

  buildLogin();
  window.LeiSections = {
    register, open, close, header, syncLabel, D, weekVariant,
    // Back: se la sezione aperta ha un pannello interno lo chiude e restituisce true
    back: () => !!(openId && registry[openId] && registry[openId].back && registry[openId].back()),
    get openId() { return openId; },
    isOpen: () => !!openId
  };
})();
