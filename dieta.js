// Sezione Dieta: piano della giornata con diario alimentare, schema della settimana e progressi (peso, check-in).
// Stesse chiavi di MindEasy (id dei pasti in day_checks e meal_logs, 'saltNo'), così l'iPhone vede gli stessi dati.
(function () {
  const S = window.LeiSections, DB = window.LeiDB, D = S.D;
  const C = window.LEI_CONFIG || {};
  const WEEKS = 8;
  const HISTORY_DAYS = 120;
  const SALT = "saltNo";
  const TARGET = (C.dieta && C.dieta.pesoObiettivo) || 75;
  const DAY_SHORT = { lun: "Lun", mar: "Mar", mer: "Mer", gio: "Gio", ven: "Ven", sab: "Sab", dom: "Dom" };

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const int = v => { const n = num(v); return n === null ? null : Math.round(n); };
  const kg = n => `${String(Math.round(n * 10) / 10).replace(".", ",")} kg`;
  const shortDate = iso => D.label(D.parse(iso), { day: "numeric", month: "short" });

  let root = null, ui = {}, data = null, tab = "oggi", selected = D.today();
  const timers = {};

  // ---------- Dati ----------
  async function loadAll(cacheOnly) {
    const get = path => (cacheOnly ? DB.peek(path) : DB.load(path));
    const since = D.iso(D.add(D.today(), -HISTORY_DAYS));
    const [days, blocks, variants, settings, checks, meals, notes, weights, checkins] = await Promise.all([
      get("plan_days?select=day,rest,rest_note"),
      get("plan_blocks?type=eq.meal&select=day,id,position,time,type,title,description&order=position"),
      get("meal_variants?select=day,meal_id,position,title,description,ingredients&order=position"),
      get("settings?key=eq.programStart&select=value"),
      get(`day_checks?date=gte.${since}&select=date,item_id,done`),
      get(`meal_logs?date=gte.${since}&select=date,meal_id,text`),
      get(`day_notes?date=gte.${since}&select=date,text`),
      get("weights?deleted_at=is.null&select=id,date,kg,note&order=date.desc,id.desc"),
      get("checkins?deleted_at=is.null&select=id,date,weight,bp_sys,bp_dia,adherence,energy&order=date.desc,id.desc")
    ]);
    const d = {
      days: Object.fromEntries(days.map(x => [x.day, x])),
      blocks: {}, pools: {},
      start: settings[0] ? settings[0].value : null,
      done: {}, meals: {}, notes: {},
      weights, checkins
    };
    blocks.forEach(b => (d.blocks[b.day] = d.blocks[b.day] || []).push(b));
    variants.forEach(v => (d.pools[v.day + "." + v.meal_id] = d.pools[v.day + "." + v.meal_id] || []).push(v));
    checks.forEach(c => { if (c.done) (d.done[c.date] = d.done[c.date] || new Set()).add(c.item_id); });
    meals.forEach(m => (d.meals[m.date + "|" + m.meal_id] = m.text));
    notes.forEach(n => (d.notes[n.date] = n.text));
    return d;
  }

  async function refresh() {
    try {
      const d = await loadAll();
      if (data) {   // conserva quello che si sta scrivendo in questo momento
        Object.keys(timers).forEach(k => {
          if (k.startsWith("meal|")) d.meals[k.slice(5)] = data.meals[k.slice(5)];
          if (k.startsWith("note|")) d.notes[k.slice(5)] = data.notes[k.slice(5)];
        });
      }
      data = d;
      render();
    } catch (e) {
      if (e.status === 401) return;
      ui.body.innerHTML = "";
      ui.body.appendChild(h("div", "sec-empty", "Non riesco a scaricare il piano. Controlla il Wi-Fi e riapri la sezione."));
    }
  }

  // ---------- Piano ----------
  // Ricetta della settimana scelta come in MindEasy (vedi weekVariant in sections.js)
  function resolve(date, b) {
    const v = b.type === "meal" ? S.weekVariant(data.pools[D.key(date) + "." + b.id], date, b.id) : null;
    return v ? Object.assign({}, b, { title: v.title, description: v.description, ingredients: v.ingredients }) : b;
  }
  const dayBlocks = date => (data.blocks[D.key(date)] || []).map(b => resolve(date, b));
  const isDone = (iso, id) => !!(data.done[iso] && data.done[iso].has(id));
  // Percentuale della dieta: pasti spuntati + "niente sale"
  function dayPct(date) {
    const iso = D.iso(date), ids = dayBlocks(date).filter(b => b.type === "meal").map(b => b.id).concat(SALT);
    const done = ids.filter(id => isDone(iso, id)).length;
    return { done, total: ids.length };
  }
  function weekPct(monday) {
    let done = 0, total = 0;
    for (let i = 0; i < 7; i++) { const p = dayPct(D.add(monday, i)); done += p.done; total += p.total; }
    return total ? Math.round(done / total * 100) : 0;
  }
  function weekOf(date) {
    if (!data.start) return null;
    return Math.min(WEEKS, Math.max(1, Math.floor(D.between(D.parse(data.start), date) / 7) + 1));
  }

  // ---------- Salvataggi ----------
  function setCheck(iso, id, done) {
    const set = data.done[iso] = data.done[iso] || new Set();
    done ? set.add(id) : set.delete(id);
    DB.save("day_checks", { date: iso, item_id: id, done }, "user_id,date,item_id");
    render();
  }
  function later(key, fn) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => { delete timers[key]; fn(); }, 700);
  }
  function setMeal(iso, mealId, text) {
    data.meals[iso + "|" + mealId] = text;
    later("meal|" + iso + "|" + mealId, () => DB.save("meal_logs", { date: iso, meal_id: mealId, text }, "user_id,date,meal_id"));
  }
  function setNote(iso, text) {
    data.notes[iso] = text;
    later("note|" + iso, () => DB.save("day_notes", { date: iso, text }, "user_id,date"));
  }
  // Nuove righe: compaiono subito, l'id arriva dall'archivio al prossimo aggiornamento
  function addRow(list, table, row) {
    data[list].unshift(Object.assign({ id: null }, row));
    data[list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    DB.insert(table, row).then(refresh);
    render();
  }
  function removeRow(list, table, row) {
    data[list] = data[list].filter(r => r !== row);
    DB.update(table, `id=eq.${row.id}`, { deleted_at: new Date().toISOString() });
    render();
  }

  // ---------- Interfaccia ----------
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-dieta");
    const head = S.header("Dieta");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    [["oggi", "Oggi"], ["settimana", "Settimana"], ["progressi", "Progressi"]].forEach(([id, label]) => {
      const b = h("button", "pill small", label);
      b.dataset.tab = id;
      b.classList.toggle("on", id === tab);
      b.addEventListener("click", () => { tab = id; render(); });
      ui.tabs.appendChild(b);
    });
    head.insertBefore(ui.tabs, ui.sync);
    ui.week = h("div", "wk-strip");
    ui.body = h("div", "dt-body");
    el.append(head, ui.week, ui.body);
  }

  function render() {
    if (!data || !root) return;
    if (document.activeElement && root.contains(document.activeElement) && document.activeElement.tagName !== "BUTTON") {
      // Non ridisegnare sotto le dita mentre si scrive: basta aggiornare lo stato
      S.syncLabel(ui.sync);
      return;
    }
    ui.tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    const w = weekOf(selected);
    ui.sub.textContent = (w ? `Settimana ${w} di ${WEEKS} · ` : "") + D.label(selected, { weekday: "long", day: "numeric", month: "long" });
    S.syncLabel(ui.sync);
    ui.week.hidden = tab !== "oggi";   // la settimana ha i giorni nelle righe: la fila in alto servirebbe due volte
    if (tab === "oggi") renderStrip();
    ui.body.innerHTML = "";
    ui.body.className = "dt-body dt-" + tab;
    if (tab === "oggi") renderDay();
    else if (tab === "settimana") renderWeek();
    else renderProgress();
  }

  function renderStrip() {
    ui.week.innerHTML = "";
    const mon = D.monday(selected), iso = D.iso(selected), today = D.iso(D.today());
    for (let i = 0; i < 7; i++) {
      const d = D.add(mon, i), di = D.iso(d), p = dayPct(d);
      const b = h("button", "wk-day");
      if (di === iso && tab === "oggi") b.classList.add("on");
      if (di === today) b.classList.add("today");
      if (p.total && p.done === p.total) b.classList.add("done");
      b.append(h("span", "wk-d", DAY_SHORT[D.key(d)]), h("span", "wk-n", d.getDate()),
        h("span", "wk-t", p.done ? `${p.done}/${p.total}` : " "));
      b.addEventListener("click", () => { selected = d; tab = "oggi"; render(); });
      ui.week.appendChild(b);
    }
    const nav = h("div", "wk-nav");
    const prev = h("button", "pill small", "‹ settimana"), next = h("button", "pill small", "settimana ›");
    prev.addEventListener("click", () => { selected = D.add(selected, -7); render(); });
    next.addEventListener("click", () => { selected = D.add(selected, 7); render(); });
    nav.append(prev, next);
    if (D.iso(D.monday(D.today())) !== D.iso(mon)) {
      const back = h("button", "pill small gold", "oggi");
      back.addEventListener("click", () => { selected = D.today(); render(); });
      nav.appendChild(back);
    }
    ui.week.appendChild(nav);
  }

  function input(cls, ph, value, onInput, multiline) {
    const i = h(multiline ? "textarea" : "input", "field " + (cls || ""));
    i.placeholder = ph;
    i.value = value || "";
    i.addEventListener("input", () => onInput(i.value));
    if (!multiline) i.addEventListener("keydown", e => { if (e.key === "Enter") i.blur(); });
    i.addEventListener("blur", () => setTimeout(render, 0));
    return i;
  }

  function renderDay() {
    const iso = D.iso(selected), blocks = dayBlocks(selected);
    const main = h("div", "card dt-main"), side = h("div", "wk-side");
    ui.body.append(main, side);

    blocks.forEach(b => {
      const done = isDone(iso, b.id);
      const row = h("div", "dt-item" + (done ? " done" : ""));
      const tick = h("button", "dt-tick", done ? "✓" : "");
      tick.setAttribute("aria-label", done ? "Fatto" : "Da fare");
      tick.addEventListener("click", () => {
        setCheck(iso, b.id, !done);
        // Pasto fatto: la Dispensa propone di scalare gli ingredienti (con conferma)
        if (!done && b.type === "meal" && window.LeiDispensa && window.LeiDispensa.consumeMeal)
          window.LeiDispensa.consumeMeal({ iso, id: b.id, title: b.title, description: b.description, ingredients: b.ingredients || [] });
      });
      const body = h("div", "dt-item-body");
      const top = h("div", "dt-item-top");
      top.append(h("span", "dt-time", b.time), h("span", "dt-title", b.title));
      body.append(top, h("div", "dt-desc", b.description));
      body.appendChild(input("dt-ate", "Cosa ho mangiato davvero…", data.meals[iso + "|" + b.id], v => setMeal(iso, b.id, v)));
      row.append(tick, body);
      main.appendChild(row);
    });

    const salt = isDone(iso, SALT);
    const saltBtn = h("button", "dt-salt" + (salt ? " on" : ""), (salt ? "✓ " : "") + "Niente sale aggiunto");
    saltBtn.addEventListener("click", () => setCheck(iso, SALT, !salt));
    main.append(saltBtn, h("h2", "zone-h dt-notes-h", "Note del giorno"),
      input("dt-notes", "Come è andata oggi…", data.notes[iso], v => setNote(iso, v), true));

    const p = dayPct(selected);
    const c1 = h("div", "card wk-stat");
    c1.append(h("h2", "zone-h", "Oggi"), h("div", "wk-big", `${p.done}/${p.total}`), h("div", "wk-hint", "pasti e abitudini rispettati"), bar(p.total ? p.done / p.total : 0));
    const wp = weekPct(D.monday(selected));
    const c2 = h("div", "card wk-stat");
    c2.append(h("h2", "zone-h", "Questa settimana"), h("div", "wk-big", `${wp}%`), bar(wp / 100));
    side.append(c1, c2);
  }

  function bar(frac) {
    const b = h("div", "wk-bar"), f = h("span");
    f.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    b.appendChild(f);
    return b;
  }

  // Schema della settimana: un giorno per riga, i pasti in colonna, descrizioni per intero
  function renderWeek() {
    const mon = D.monday(selected), today = D.iso(D.today());
    const card = h("div", "card dt-week");

    const nav = h("div", "dt-week-nav");
    const prev = h("button", "pill small", "‹"), next = h("button", "pill small", "›");
    prev.addEventListener("click", () => { selected = D.add(selected, -7); render(); });
    next.addEventListener("click", () => { selected = D.add(selected, 7); render(); });
    const range = h("span", "dt-week-range", `${D.label(mon, { day: "numeric", month: "long" })} – ${D.label(D.add(mon, 6), { day: "numeric", month: "long" })}`);
    nav.append(prev, range, next);
    if (D.iso(D.monday(D.today())) !== D.iso(mon)) {
      const back = h("button", "pill small gold", "questa settimana");
      back.addEventListener("click", () => { selected = D.today(); render(); });
      nav.appendChild(back);
    }
    card.appendChild(nav);

    // Colonne: i pasti della settimana in ordine di orario
    const cols = [];
    for (let i = 0; i < 7; i++) dayBlocks(D.add(mon, i)).forEach(b => {
      if (b.type === "meal" && !cols.some(c => c.id === b.id)) cols.push({ id: b.id, label: b.title.split("—")[0].trim(), time: b.time });
    });
    cols.sort((a, b) => (a.time < b.time ? -1 : 1));

    const grid = h("div", "dt-grid");
    grid.style.gridTemplateColumns = `72px repeat(${cols.length}, 1fr)`;
    grid.appendChild(h("div"));
    cols.forEach(c => grid.appendChild(h("div", "dt-gl", c.label)));
    for (let i = 0; i < 7; i++) {
      const d = D.add(mon, i), di = D.iso(d), p = dayPct(d), blocks = dayBlocks(d);
      const head = h("button", "dt-gh" + (di === today ? " today" : ""));
      head.append(h("span", "dt-gh-d", DAY_SHORT[D.key(d)]), h("span", "dt-gh-n", d.getDate()), h("span", "dt-gh-p", p.done ? `${p.done}/${p.total}` : ""));
      head.addEventListener("click", () => { selected = d; tab = "oggi"; render(); });
      grid.appendChild(head);
      cols.forEach(c => {
        const b = blocks.find(x => x.id === c.id);
        const cell = h("button", "dt-gc" + (b && isDone(di, b.id) ? " done" : "") + (di === today ? " today" : ""));
        if (b) {
          const t = b.title.includes("—") ? b.title.split("—")[1].trim() : b.title;
          if (t !== c.label) cell.appendChild(h("span", "dt-gc-t", t));
          cell.appendChild(h("span", "dt-gc-d", b.description));
          cell.addEventListener("click", () => { selected = d; tab = "oggi"; render(); });
        }
        grid.appendChild(cell);
      });
    }
    card.appendChild(grid);
    ui.body.appendChild(card);
  }

  // ---------- Progressi ----------
  function chart(points, target) {
    const W = 600, H = 180, P = 26;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "dt-chart");
    if (points.length < 2) return null;
    const xs = points.map(p => D.parse(p.date).getTime()), ys = points.map(p => p.kg).concat(target);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const X = t => P + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - 2 * P);
    const Y = v => H - P - (v - y0) / (y1 - y0) * (H - 2 * P);
    const el = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.appendChild(e); return e; };
    el("line", { x1: P, x2: W - P, y1: Y(target), y2: Y(target), class: "dt-target" });
    el("text", { x: W - P, y: Y(target) - 6, "text-anchor": "end", class: "dt-chart-l" }).textContent = `obiettivo ${kg(target)}`;
    el("polyline", { points: points.map((p, i) => `${X(xs[i])},${Y(p.kg)}`).join(" "), class: "dt-line" });
    points.forEach((p, i) => el("circle", { cx: X(xs[i]), cy: Y(p.kg), r: 4, class: "dt-dot" }));
    return svg;
  }

  // Elimina con due tocchi (la WebView non mostra finestre di conferma)
  function deleteButton(onConfirm) {
    const b = h("button", "dt-del", "✕");
    let armed = false;
    b.addEventListener("click", () => {
      if (armed) return onConfirm();
      armed = true; b.textContent = "Elimina?"; b.classList.add("armed");
      setTimeout(() => { armed = false; b.textContent = "✕"; b.classList.remove("armed"); }, 3000);
    });
    return b;
  }

  function renderProgress() {
    const col1 = h("div", "dt-col"), col2 = h("div", "dt-col");
    ui.body.append(col1, col2);

    // Peso
    const wc = h("div", "card dt-card");
    const latest = data.weights[0], oldest = data.weights[data.weights.length - 1];
    const head = h("div", "dt-card-head");
    head.appendChild(h("h2", "zone-h", "Peso"));
    if (latest) {
      const delta = latest.kg - oldest.kg;
      head.appendChild(h("span", "dt-kpi", `${kg(latest.kg)}${data.weights.length > 1 ? ` · ${delta > 0 ? "+" : ""}${String(Math.round(delta * 10) / 10).replace(".", ",")} dall'inizio` : ""}`));
    }
    wc.appendChild(head);
    const ch = chart(data.weights.slice().reverse(), TARGET);
    wc.appendChild(ch || h("div", "wk-hint", "Servono almeno due misure per il grafico."));
    const form = h("div", "dt-form");
    const fDate = h("input", "field"); fDate.type = "date"; fDate.value = D.iso(D.today());
    const fKg = h("input", "field n"); fKg.placeholder = "kg"; fKg.inputMode = "decimal";
    const fNote = h("input", "field"); fNote.placeholder = "nota";
    const ok = h("button", "pill primary", "Aggiungi");
    ok.addEventListener("click", () => {
      const v = num(fKg.value);
      if (!v || v <= 0) return window.LeiCore.toast("Scrivi il peso in kg, es. 72,5");
      addRow("weights", "weights", { date: fDate.value || D.iso(D.today()), kg: v, note: fNote.value.trim() });
    });
    form.append(fDate, fKg, fNote, ok);
    wc.appendChild(form);
    data.weights.slice(0, 8).forEach(w => {
      const r = h("div", "dt-row");
      r.append(h("span", "dt-row-d", shortDate(w.date)), h("span", null, kg(w.kg)), h("span", "dt-row-n", w.note || ""));
      r.appendChild(w.id ? deleteButton(() => removeRow("weights", "weights", w)) : h("span", "dt-row-n", "invio…"));
      wc.appendChild(r);
    });
    col1.appendChild(wc);

    // Aderenza settimana per settimana
    const ac = h("div", "card dt-card");
    ac.appendChild(h("h2", "zone-h", "Aderenza alla dieta"));
    const thisMon = D.monday(D.today());
    const firstMon = data.start ? D.monday(D.parse(data.start)) : D.add(thisMon, -7 * 3);
    const weeks = [];
    for (let m = firstMon, i = 0; m <= thisMon && i < 12; m = D.add(m, 7), i++) weeks.push(m);
    weeks.slice(-8).forEach((m, i) => {
      const pct = weekPct(m);
      const r = h("div", "dt-adh");
      r.append(h("span", "dt-row-d", data.start ? `Sett. ${weekOf(m)}` : shortDate(D.iso(m))), bar(pct / 100), h("span", "dt-adh-p", `${pct}%`));
      ac.appendChild(r);
    });
    let saltDays = 0;
    for (let i = 0; i < 30; i++) if (isDone(D.iso(D.add(D.today(), -i)), SALT)) saltDays++;
    ac.appendChild(h("div", "wk-hint dt-salt-n", `Giorni senza sale negli ultimi 30: ${saltDays}`));
    col1.appendChild(ac);

    // Check-in
    const cc = h("div", "card dt-card");
    cc.appendChild(h("h2", "zone-h", "Check-in"));
    const f = h("div", "dt-form dt-form-wrap");
    const cDate = h("input", "field"); cDate.type = "date"; cDate.value = D.iso(D.today());
    const cKg = h("input", "field n"); cKg.placeholder = "kg"; cKg.inputMode = "decimal";
    const cSys = h("input", "field n"); cSys.placeholder = "max"; cSys.inputMode = "numeric";
    const cDia = h("input", "field n"); cDia.placeholder = "min"; cDia.inputMode = "numeric";
    const cFree = h("input", "field n"); cFree.placeholder = "liberi"; cFree.inputMode = "numeric";
    let energy = null;
    const en = h("div", "dt-energy");
    en.appendChild(h("span", "wk-hint", "Energia"));
    [1, 2, 3, 4, 5].forEach(n => {
      const b = h("button", "dt-en", String(n));
      b.addEventListener("click", () => { energy = energy === n ? null : n; en.querySelectorAll(".dt-en").forEach((x, i) => x.classList.toggle("on", i + 1 === energy)); });
      en.appendChild(b);
    });
    const save = h("button", "pill primary", "Salva check-in");
    save.addEventListener("click", () => {
      const row = { date: cDate.value || D.iso(D.today()), weight: num(cKg.value), bp_sys: int(cSys.value), bp_dia: int(cDia.value), adherence: int(cFree.value), energy };
      if (row.weight === null && row.bp_sys === null && row.adherence === null && row.energy === null) return window.LeiCore.toast("Compila almeno un campo");
      addRow("checkins", "checkins", row);
    });
    const lbl = (t, el) => { const w = h("label", "dt-lbl"); w.append(h("span", null, t), el); return w; };
    f.append(lbl("Data", cDate), lbl("Peso", cKg), lbl("Pressione", cSys), lbl(" ", cDia), lbl("Pasti liberi del mese", cFree));
    cc.append(f, en, save);
    data.checkins.slice(0, 10).forEach(c => {
      const parts = [];
      if (c.weight !== null) parts.push(kg(c.weight));
      if (c.bp_sys !== null && c.bp_dia !== null) parts.push(`${c.bp_sys}/${c.bp_dia}`);
      if (c.adherence !== null) parts.push(`${c.adherence} pasti liberi`);
      if (c.energy !== null) parts.push(`energia ${c.energy}/5`);
      const r = h("div", "dt-row");
      r.append(h("span", "dt-row-d", shortDate(c.date)), h("span", "dt-row-wide", parts.join(" · ") || "—"));
      r.appendChild(c.id ? deleteButton(() => removeRow("checkins", "checkins", c)) : h("span", "dt-row-n", "invio…"));
      cc.appendChild(r);
    });
    col2.appendChild(cc);
  }

  S.register("dieta", {
    open(el) {
      root = el;
      selected = D.today();
      tab = "oggi";
      build(el);
      if (data) render();
      else {
        ui.body.appendChild(h("div", "sec-empty", "Carico il piano…"));
        // Prima la copia salvata sul tablet, poi i dati aggiornati dall'archivio
        loadAll(true).then(d => { if (!data) { data = d; render(); } }).catch(() => { });
      }
      refresh();
    },
    close() {
      root = null;
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      DB.flush();
    },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });
})();
