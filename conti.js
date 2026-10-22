// Sezione "Conti": il mese in corso (voci da pagare e già pagate), le previsioni dei due mesi successivi e
// "La situazione" (conti, debiti, arretrati, andamento, categorie, note). Si apre con un PIN a 6 cifre (quelli vecchi a 4 restano validi finché non si cambiano).
// I numeri stanno solo nell'archivio privato (fin_months, fin_items, settings 'finSituazione'): il codice è pubblico
// nella web app. Gli estratti conto si caricano da qui; li legge Claude quando Fabio chiede "aggiorna i conti"
// (docs/aggiorna-conti.md, funzione conti-import).
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  // Importi all'italiana con il punto delle migliaia anche sotto 10.000 (1.600,00 €), che toLocaleString a volte omette
  function money(v, dec) {
    const n = Number(v || 0), neg = n < 0;
    const [int, frac] = Math.abs(n).toFixed(dec).split(".");
    return `${neg ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${dec ? "," + frac : ""} €`;
  }
  const eur = v => money(v, 2);
  const eur0 = v => money(Math.round(Number(v || 0)), 0);
  const monthName = iso => D.label(D.parse(iso), { month: "long" }).replace(/^./, c => c.toUpperCase());
  const monthIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const GROUPS = [
    ["subito", "Da fare subito", ""],
    ["scadenze", "Scadenze del mese", ""],
    ["auto", "Si addebitano da soli", "Tieni coperto il conto fino all'addebito."],
    ["rinviati", "Rinviati per scelta", "Decisioni prese, non dimenticanze."],
    ["attesa", "In attesa o da decidere", "Spunta quando hai la risposta, non quando fai la domanda."]
  ];
  const inTotal = i => !i.excluded && i.grp !== "rinviati" && i.grp !== "attesa";

  // ---------- PIN (impronta in settings 'finPin', uguale su tablet e iPhone) ----------
  let unlockedUntil = 0;
  const UNLOCK_MS = 5 * 60 * 1000;   // dopo 5 minuti fuori dalla sezione si richiede
  async function pinHash(pin) {
    const text = `lei-conti|${DB.uid() || ""}|${pin}`;
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {   // senza crypto.subtle: impronta semplice (il PIN protegge la vista, i dati li protegge l'accesso)
      let x = 5381;
      for (const ch of text) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0;
      return "s" + x.toString(16);
    }
  }

  // ---------- Dati ----------
  const P_MONTHS = "fin_months?select=month,status,income,income_note,living,living_note,note&order=month";
  const P_ITEMS = "fin_items?select=id,month,item_key,grp,position,title,description,amount,account,due,sev,excluded,estimate,done&order=month,position";
  const P_SET = "settings?key=in.(finSituazione,finPin)&select=key,value";
  const P_UP = "fin_uploads?select=id,month,name,uploaded_at,processed_at,note&order=uploaded_at.desc";
  let root = null, ui = {}, data = null, tab = null;

  async function loadAll(cacheOnly) {
    const get = p => (cacheOnly ? DB.peek(p) : DB.load(p));
    const [months, items, settings, uploads] = await Promise.all([get(P_MONTHS), get(P_ITEMS), get(P_SET), get(P_UP).catch(() => [])]);
    const set = Object.fromEntries(settings.map(s => [s.key, s.value]));
    let sit = null;
    try { sit = set.finSituazione ? JSON.parse(set.finSituazione) : null; } catch (e) { }
    return { months, items, sit, pin: set.finPin || null, uploads };
  }
  // I tre mesi da mostrare: dal mese corrente in poi (se manca, l'ultimo disponibile prima)
  function visibleMonths() {
    const cur = monthIso(D.today());
    const ms = data.months.map(m => m.month).sort();
    const from = ms.filter(m => m >= cur);
    const list = from.length ? from : ms.slice(-1);
    return list.slice(0, 3);
  }

  // ---------- Salvataggi ----------
  function toggle(i) {
    i.done = !i.done;
    DB.update("fin_items", `id=eq.${i.id}`, { done: i.done, done_at: i.done ? new Date().toISOString() : null });
    render();
  }

  // ---------- Interfaccia ----------
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-conti");
    const head = S.header("Conti");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    head.insertBefore(ui.tabs, ui.sync);
    ui.banner = h("div", "fn-banner");
    ui.banner.hidden = true;
    ui.body = h("div", "fn-body");
    ui.sheet = h("div", "sheet fn-sheet");
    ui.sheet.hidden = true;
    ui.sheet.addEventListener("click", e => { if (e.target === ui.sheet && data && data.pin) closeSheet(); });
    el.append(head, ui.banner, ui.body, ui.sheet);
  }

  function render() {
    if (!data || !root) return;
    if (Date.now() > unlockedUntil) return showPin();
    const months = visibleMonths();
    if (!tab || (tab !== "situazione" && !months.includes(tab))) tab = months[0] || "situazione";
    ui.tabs.innerHTML = "";
    months.concat(["situazione"]).forEach(id => {
      const b = h("button", "pill small" + (id === tab ? " on" : ""), id === "situazione" ? "La situazione" : monthName(id));
      b.addEventListener("click", () => { tab = id; render(); });
      ui.tabs.appendChild(b);
    });
    ui.sub.textContent = data.sit && data.sit.updatedAt ? `Aggiornato al ${D.label(D.parse(data.sit.updatedAt), { day: "numeric", month: "long" })}` : "";
    S.syncLabel(ui.sync);
    renderBanner();
    ui.body.innerHTML = "";
    ui.body.scrollTop = 0;
    if (tab === "situazione") renderSituation();
    else renderMonth(tab);
  }

  // Promemoria del 1° del mese: caricare gli estratti del mese appena finito
  function renderBanner() {
    const today = D.today(), prev = monthIso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const has = data.uploads.some(u => u.month === prev);
    ui.banner.hidden = !(today.getDate() <= 7 && !has);
    if (ui.banner.hidden) return;
    ui.banner.innerHTML = "";
    ui.banner.append(h("span", null, `È iniziato un nuovo mese: carica gli estratti conto di ${monthName(prev).toLowerCase()}.`));
    const b = h("button", "pill small", "Carica estratti");
    b.addEventListener("click", () => openUpload(prev));
    ui.banner.appendChild(b);
  }

  function kpi(label, value, cls, note) {
    const k = h("div", "card fn-kpi" + (cls ? " " + cls : ""));
    k.append(h("div", "fn-kpi-l", label), h("div", "fn-kpi-v", value));
    if (note) k.appendChild(h("div", "fn-kpi-n", note));
    return k;
  }

  function renderMonth(iso) {
    const m = data.months.find(x => x.month === iso) || { income: 0, living: 0, status: "previsione" };
    const items = data.items.filter(i => i.month === iso).sort((a, b) => a.position - b.position);
    const counted = items.filter(inTotal);
    const tot = counted.reduce((a, i) => a + Number(i.amount), 0);
    const paid = counted.filter(i => i.done).reduce((a, i) => a + Number(i.amount), 0);
    const forecast = m.status === "previsione";
    const free = Number(m.income) - tot - Number(m.living);

    const kp = h("div", "fn-kpis");
    kp.append(kpi("Entrate" + (forecast ? " previste" : ""), eur(m.income), "", m.income_note),
      kpi("Impegnato", eur(tot), ""),
      kpi("Già pagato", eur(paid), "good"),
      kpi("Da pagare", eur(tot - paid), tot - paid > 0 ? "warn" : ""));
    kp.appendChild(forecast
      ? kpi("Saldo previsto", eur(free), free < 0 ? "bad" : "good", m.living ? `dopo ${eur0(m.living)} per vivere` : "")
      : kpi("Per vivere", eur(m.living), "", m.living_note));
    ui.body.appendChild(kp);
    const bar = h("div", "wk-bar fn-bar"), fill = h("span");
    fill.style.width = tot ? `${Math.round(paid / tot * 100)}%` : "0";
    bar.appendChild(fill);
    ui.body.appendChild(bar);
    if (forecast) ui.body.appendChild(h("div", "fn-forecast", "Previsione: importi e date possono cambiare. Gli importi con ~ sono stimati."));

    GROUPS.forEach(([g, label, sub]) => {
      const its = items.filter(i => i.grp === g);
      if (!its.length) return;
      const sec = h("section", "fn-group");
      sec.appendChild(h("h2", "fn-gh", label));
      if (sub) sec.appendChild(h("div", "fn-gsub", sub));
      its.forEach(i => sec.appendChild(row(i)));
      const net = its.filter(i => !i.excluded), gt = net.reduce((a, i) => a + Number(i.amount), 0), gp = net.filter(i => i.done).reduce((a, i) => a + Number(i.amount), 0);
      if (gt > 0) {
        const t = h("div", "fn-gtot");
        t.append(h("span", null, gp ? `già pagati ${eur(gp)}` : ""), h("b", null, eur(gt)));
        sec.appendChild(t);
      }
      ui.body.appendChild(sec);
    });
    if (!items.length) ui.body.appendChild(h("div", "sec-empty", "Nessuna voce per questo mese."));
    if (m.note) ui.body.appendChild(h("div", "fn-note", m.note));
    if (!forecast && m.living_note) ui.body.appendChild(h("div", "fn-note", m.living_note));
  }

  function row(i) {
    const r = h("button", "fn-row" + (i.done ? " on" : ""));
    const box = h("span", "fn-box", i.done ? "✓" : "");
    const mid = h("span", "fn-mid");
    mid.appendChild(h("span", "fn-t", i.title));
    if (i.description) mid.appendChild(h("span", "fn-d", i.description));
    const meta = h("span", "fn-meta");
    if (i.account) meta.appendChild(h("span", "fn-chip", i.account));
    if (i.due) meta.appendChild(h("span", "fn-chip" + (i.sev ? " " + i.sev : ""), i.due));
    if (i.excluded) meta.appendChild(h("span", "fn-chip", "già compreso"));
    if (meta.childNodes.length) mid.appendChild(meta);
    const amt = h("span", "fn-amt" + (Number(i.amount) ? "" : " none"), Number(i.amount) ? (i.estimate ? "~" : "") + eur(i.amount) : "—");
    r.append(box, mid, amt);
    r.addEventListener("click", () => toggle(i));
    return r;
  }

  // ---------- La situazione ----------
  function renderSituation() {
    const s = data.sit;
    if (!s) { ui.body.appendChild(h("div", "sec-empty", "La situazione non è ancora nell'archivio (13_conti_dati.sql).")); return; }
    if (s.headline) ui.body.appendChild(h("div", "fn-headline", s.headline));
    const debtTot = (s.debts || []).reduce((a, d) => a + Number(d.residual || 0), 0);
    const rateTot = (s.debts || []).reduce((a, d) => a + Number(d.rate || 0), 0);
    const arrTot = (s.arrears || []).reduce((a, x) => a + Number(x.amount || 0), 0);
    const kp = h("div", "fn-kpis");
    kp.append(kpi("Debito residuo", eur0(debtTot), "", "mutui e prestiti"), kpi("Rate al mese", eur(rateTot), ""), kpi("Arretrati noti", eur(arrTot), arrTot ? "warn" : "good", "fuori dal circuito bancario"));
    ui.body.appendChild(kp);

    const grid = h("div", "fn-sgrid");
    ui.body.appendChild(grid);

    const acc = h("div", "card fn-card");
    acc.appendChild(h("h2", "zone-h", "I conti"));
    (s.accounts || []).forEach(a => {
      const r = h("div", "fn-acc");
      const t = h("div");
      t.append(h("div", "fn-acc-n", a.name), h("div", "fn-acc-r", a.role || ""));
      r.append(t, h("div", "fn-acc-b", a.balance === null || a.balance === undefined ? "" : eur(a.balance)));
      acc.appendChild(r);
    });
    grid.appendChild(acc);

    const deb = h("div", "card fn-card");
    deb.appendChild(h("h2", "zone-h", "Debiti"));
    const tb = h("div", "fn-table");
    [["", "Residuo", "Rata", "TAN", "Fine"]].concat((s.debts || []).map(d => [d.name, (d.approx ? "~" : "") + eur0(d.residual), eur(d.rate), d.tan || "", d.end || ""]))
      .forEach((cells, n) => { const r = h("div", "fn-tr" + (n ? "" : " th")); cells.forEach(c => r.appendChild(h("span", null, c))); tb.appendChild(r); });
    deb.appendChild(tb);
    grid.appendChild(deb);

    if ((s.arrears || []).length) {
      const ar = h("div", "card fn-card");
      ar.appendChild(h("h2", "zone-h", "Arretrati"));
      s.arrears.forEach(x => {
        const r = h("div", "fn-acc");
        const t = h("div");
        t.append(h("div", "fn-acc-n", x.name), h("div", "fn-acc-r", x.note || ""));
        r.append(t, h("div", "fn-acc-b", x.amount === null || x.amount === undefined ? "da definire" : eur(x.amount)));
        ar.appendChild(r);
      });
      grid.appendChild(ar);
    }

    if ((s.history || []).length) {
      const c = h("div", "card fn-card fn-wide");
      c.appendChild(h("h2", "zone-h", "Entrate e uscite, mese per mese"));
      c.appendChild(historyChart(s.history));
      if (s.historyNote) c.appendChild(h("div", "fn-small", s.historyNote));
      grid.appendChild(c);
    }

    if ((s.categories || []).length) {
      const c = h("div", "card fn-card fn-wide");
      c.appendChild(h("h2", "zone-h", "Dove vanno i soldi" + (s.categoriesNote ? " · " + s.categoriesNote : "")));
      const max = Math.max(...s.categories.map(x => x.amount));
      s.categories.forEach(x => {
        const r = h("div", "fn-cat");
        const bar = h("div", "fn-cat-bar"), f = h("span", "k-" + (x.kind || ""));
        f.style.width = `${Math.round(x.amount / max * 100)}%`;
        bar.appendChild(f);
        r.append(h("span", "fn-cat-n", x.name), bar, h("span", "fn-cat-v", eur0(x.amount)));
        c.appendChild(r);
      });
      const leg = h("div", "fn-small fn-legend");
      [["fisso", "fisso"], ["essenziale", "essenziale"], ["discrezionale", "discrezionale"]].forEach(([k, l]) => { const s2 = h("span"); s2.append(h("i", "k-" + k), document.createTextNode(l)); leg.appendChild(s2); });
      c.appendChild(leg);
      grid.appendChild(c);
    }

    (s.notes || []).forEach(n => {
      const c = h("div", "card fn-card fn-ncard " + (n.sev || ""));
      c.append(h("div", "fn-acc-n", n.title), h("div", "fn-acc-r", n.text));
      grid.appendChild(c);
    });

    const up = h("div", "card fn-card fn-wide");
    up.appendChild(h("h2", "zone-h", "Estratti conto"));
    up.appendChild(h("div", "fn-small", "Il 1° del mese carica qui i PDF o CSV dei quattro conti; poi chiedi a Claude dal computer «aggiorna i conti»: chiude il mese, aggiorna questa pagina e le previsioni."));
    const btns = h("div", "fn-row-btns");
    const b1 = h("button", "pill small gold", "Carica estratti conto");
    b1.addEventListener("click", () => openUpload());
    const b2 = h("button", "pill small", "Cambia PIN");
    b2.addEventListener("click", () => showPin(true));
    btns.append(b1, b2);
    up.appendChild(btns);
    data.uploads.slice(0, 8).forEach(u => {
      const r = h("div", "fn-up");
      r.append(h("span", null, u.name), h("span", "fn-small", `${monthName(u.month)} · ${u.processed_at ? "letto da Claude" : "da leggere"}`));
      up.appendChild(r);
    });
    grid.appendChild(up);
    if (s.disclaimer) ui.body.appendChild(h("div", "fn-small fn-disc", s.disclaimer));
  }

  function historyChart(hist) {
    const W = 720, H = 220, mL = 44, mB = 26, mT = 18, iw = W - mL - 8, ih = H - mT - mB;
    const max = Math.max(...hist.map(x => Math.max(x.in, x.out))) * 1.05;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "fn-chart");
    const el = (t, a, txt) => { const e = document.createElementNS(NS, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt) e.textContent = txt; svg.appendChild(e); return e; };
    const y = v => mT + ih - v / max * ih, bw = iw / hist.length, bar = Math.min(18, bw * 0.3);
    [0, 0.5, 1].forEach(f => { el("line", { x1: mL, x2: W - 8, y1: y(max * f), y2: y(max * f), class: "fn-gl" }); el("text", { x: mL - 6, y: y(max * f) + 4, "text-anchor": "end", class: "fn-ax" }, `${Math.round(max * f / 1000)}k`); });
    hist.forEach((x, n) => {
      const cx = mL + bw * n + bw / 2;
      el("rect", { x: cx - bar - 1, y: y(x.in), width: bar, height: Math.max(1, mT + ih - y(x.in)), rx: 3, class: "fn-in" });
      el("rect", { x: cx + 1, y: y(x.out), width: bar, height: Math.max(1, mT + ih - y(x.out)), rx: 3, class: "fn-out" });
      const net = x.in - x.out;
      el("text", { x: cx, y: Math.min(y(x.in), y(x.out)) - 5, "text-anchor": "middle", class: net >= 0 ? "fn-pos" : "fn-neg" }, `${net >= 0 ? "+" : "−"}${Math.round(Math.abs(net))}`);
      el("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "fn-ax" }, D.label(D.parse(x.month + "-01"), { month: "short" }));
    });
    return svg;
  }

  // ---------- Pannelli ----------
  function closeSheet() { ui.sheet.hidden = true; ui.sheet.innerHTML = ""; }

  // PIN: creazione (prima volta), sblocco, cambio
  function showPin(change) {
    // Già sul tastierino: non ricominciare (i dati aggiornati arrivano mentre si scrive)
    if (!change && !ui.sheet.hidden && ui.sheet.querySelector(".fn-pin")) return;
    ui.body.innerHTML = "";
    ui.tabs.innerHTML = "";
    ui.banner.hidden = true;
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box fn-pin");
    let mode = !data.pin ? "new" : change ? "change" : "unlock", first = "", entered = "";
    const title = h("h3"), msg = h("p"), dots = h("div", "fn-dots");
    // Il PIN salvato è "6:<impronta>"; senza prefisso è un vecchio PIN a 4 cifre
    const saved = () => String(data.pin || "").replace(/^6:/, "");
    const len = () => (mode === "unlock" && !String(data.pin).startsWith("6:") ? 4 : 6);
    const setMode = () => {
      title.textContent = mode === "unlock" ? "Conti" : mode === "confirm" ? "Ripeti il PIN" : "Scegli un PIN";
      msg.textContent = mode === "unlock" ? `Inserisci il PIN a ${len()} cifre.` : mode === "confirm" ? "Scrivilo di nuovo per conferma." : "6 cifre: serve ad aprire i Conti, su tablet e iPhone.";
    };
    const paint = () => { dots.innerHTML = ""; for (let n = 0; n < len(); n++) dots.appendChild(h("i", n < entered.length ? "on" : "")); };
    const done = async () => {
      if (mode === "unlock") {
        if (await pinHash(entered) === saved()) { unlockedUntil = Date.now() + UNLOCK_MS; closeSheet(); render(); }
        else { msg.textContent = "PIN sbagliato, riprova."; K.L.vibrate && K.L.vibrate(80); }
      } else if (mode === "new" || mode === "change") { first = entered; mode = "confirm"; setMode(); }
      else if (mode === "confirm") {
        if (entered === first) {
          data.pin = "6:" + await pinHash(entered);
          DB.save("settings", { key: "finPin", value: data.pin }, "user_id,key");
          unlockedUntil = Date.now() + UNLOCK_MS;
          K.toast("PIN salvato");
          closeSheet(); render();
          return;
        }
        msg.textContent = "I due PIN non coincidono: ricomincia."; mode = change ? "change" : "new";
      }
      entered = ""; paint();
    };
    const pad = h("div", "fn-pad");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach(k => {
      const b = h("button", "fn-key" + (k ? "" : " empty"), k);
      if (!k) b.disabled = true;
      b.addEventListener("click", () => {
        if (k === "⌫") entered = entered.slice(0, -1);
        else if (entered.length < len()) entered += k;
        paint();
        if (entered.length === len()) setTimeout(done, 120);
      });
      pad.appendChild(b);
    });
    const foot = h("div", "row");
    const cancel = h("button", null, "Chiudi");
    cancel.addEventListener("click", () => (change ? (closeSheet(), render()) : S.close()));
    foot.appendChild(cancel);
    box.append(title, msg, dots, pad, foot);
    if (mode === "unlock") box.appendChild(h("p", "fn-small", "PIN dimenticato? Chiedi a Claude dal computer di azzerarlo."));
    setMode(); paint();
    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
  }

  function openUpload(month) {
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box fn-upbox");
    box.appendChild(h("h3", null, "Carica estratti conto"));
    box.appendChild(h("p", null, "PDF o CSV di Crédit Agricole, Revolut, Satispay e Intesa. Restano nella tua cartella privata dell'archivio."));
    const today = D.today();
    const opts = [-1, 0].map(d => monthIso(new Date(today.getFullYear(), today.getMonth() + d, 1)));
    const sel = h("select", "field");
    opts.forEach(o => sel.appendChild(Object.assign(h("option", null, `Estratti di ${monthName(o).toLowerCase()}`), { value: o })));
    sel.value = month || (today.getDate() <= 15 ? opts[0] : opts[1]);
    const file = h("input");
    file.type = "file";
    file.multiple = true;
    file.accept = ".pdf,.csv,.xlsx,.xls,application/pdf,text/csv";
    file.className = "field";
    const status = h("p", "fn-small");
    const row = h("div", "row");
    const cancel = h("button", null, "Annulla");
    cancel.addEventListener("click", closeSheet);
    const go = h("button", "primary", "Carica");
    go.addEventListener("click", async () => {
      const files = [...(file.files || [])];
      if (!files.length) return K.toast("Scegli prima i file");
      go.disabled = true;
      let ok = 0;
      for (const f of files) {
        status.textContent = `Carico ${f.name}…`;
        try {
          const safe = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
          const path = await DB.uploadPhoto(`estratti/${sel.value.slice(0, 7)}/${Date.now()}-${safe}`, f);
          DB.insert("fin_uploads", { month: sel.value, path, name: f.name });
          data.uploads.unshift({ month: sel.value, name: f.name, uploaded_at: new Date().toISOString(), processed_at: null });
          ok++;
        } catch (e) {
          status.textContent = `Non riesco a caricare ${f.name}: controlla il Wi-Fi.`;
        }
      }
      go.disabled = false;
      if (ok) {
        K.toast(`${ok} ${ok === 1 ? "file caricato" : "file caricati"}: ora chiedi a Claude «aggiorna i conti»`);
        closeSheet(); render();
      }
    });
    row.append(cancel, go);
    box.append(sel, file, status, row);
    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
  }

  // ---------- Pulsante nella Home del tablet (a sinistra di COLLECTION) ----------
  (function setupLaunch() {
    const btn = document.getElementById("contiBtn");
    if (!btn) return;
    const ICON = {
      coins: '<ellipse cx="9" cy="7" rx="5" ry="2"/><path d="M4 7v4c0 1.1 2.2 2 5 2s5-.9 5-2V7"/><path d="M4 11v4c0 1.1 2.2 2 5 2 1 0 1.9-.1 2.7-.3"/><circle cx="16.5" cy="15.5" r="4"/>',
      chart: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>'
    };
    btn.querySelector(".cl-icons").innerHTML = ["coins", "chart"]
      .map(n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`).join("");
    btn.addEventListener("click", () => S.open("conti"));
  })();

  S.register("conti", {
    open(el, opts) {
      root = el;
      tab = opts && opts.tab ? opts.tab : null;
      build(el);
      const start = () => (Date.now() > unlockedUntil ? showPin() : render());
      if (data) start();
      else {
        ui.body.appendChild(h("div", "sec-empty", "Carico i conti…"));
        loadAll(true).then(d => { if (!data) { data = d; start(); } }).catch(() => { });
      }
      loadAll(false).then(d => {
        const first = !data;
        data = d;
        if (first || Date.now() <= unlockedUntil) start();
      }).catch(e => { if (e.status !== 401 && !data) { ui.body.innerHTML = ""; ui.body.appendChild(h("div", "sec-empty", e.status === 404 ? "Le tabelle dei Conti non sono ancora nell'archivio (12_conti.sql)." : "Non riesco a scaricare i conti.")); } });
    },
    close() {
      root = null;
      closeSheet();
      if (Date.now() <= unlockedUntil) unlockedUntil = Date.now() + UNLOCK_MS;   // 5 minuti di tolleranza da ora
      DB.flush();
    },
    back() { if (ui.sheet && !ui.sheet.hidden && data && data.pin && Date.now() <= unlockedUntil) { closeSheet(); return true; } return false; },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });
})();
