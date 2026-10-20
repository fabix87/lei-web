// Sezione Allenamento: scheda del giorno dal piano (archivio online) + diario esercizio per esercizio.
// Le spunte usano la stessa chiave di MindEasy ('training' in day_checks), così l'iPhone vede le stesse.
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;
  const WEEKS = 8;
  const HISTORY_DAYS = 120;
  const DAY_SHORT = { lun: "Lun", mar: "Mar", mer: "Mer", gio: "Gio", ven: "Ven", sab: "Sab", dom: "Dom" };

  // Crea un elemento con classe e testo (sempre testo semplice: niente HTML dai dati)
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  let root = null, ui = {};
  let data = null;                 // piano + diario
  let selected = D.today();
  let saveTimers = {};

  // ---------- Dati ----------
  async function loadAll(cacheOnly) {
    const get = path => (cacheOnly ? DB.peek(path) : DB.load(path));
    const since = D.iso(D.add(D.today(), -HISTORY_DAYS));
    const [days, blocks, sheets, exercises, settings, checks, logs] = await Promise.all([
      get("plan_days?select=day,rest,rest_note"),
      get("plan_blocks?type=eq.training&select=day,id,position,time,time_range,title,description,sheet_id&order=position"),
      get("workout_sheets?select=id,title,warmup,circuit,core,cardio"),
      get("workout_exercises?select=sheet_id,position,name,reps,note&order=position"),
      get("settings?key=eq.programStart&select=value"),
      get(`day_checks?item_id=eq.training&date=gte.${since}&select=date,done`),
      get(`workout_logs?date=gte.${since}&select=date,exercise,sets,reps,load_kg,minutes,note&order=date.desc`)
    ]);
    const d = {
      days: Object.fromEntries(days.map(x => [x.day, x])),
      blocks: {},
      sheets: Object.fromEntries(sheets.map(s => [s.id, Object.assign({ exercises: [] }, s)])),
      start: settings[0] ? settings[0].value : null,
      done: new Set(checks.filter(c => c.done).map(c => c.date)),
      logs: {}
    };
    blocks.forEach(b => (d.blocks[b.day] = d.blocks[b.day] || []).push(b));
    exercises.forEach(e => d.sheets[e.sheet_id] && d.sheets[e.sheet_id].exercises.push(e));
    logs.forEach(l => (d.logs[l.date + "|" + l.exercise] = l));
    // Le modifiche non ancora inviate hanno la precedenza sulla copia scaricata
    return d;
  }

  async function refresh() {
    try {
      const d = await loadAll();
      // Conserva quello che si sta scrivendo in questo momento
      if (data) Object.keys(saveTimers).forEach(k => { if (data.logs[k]) d.logs[k] = data.logs[k]; });
      data = d;
      render();
    } catch (e) {
      if (e.status === 401) return;
      ui.body.innerHTML = "";
      ui.body.appendChild(h("div", "sec-empty", "Non riesco a scaricare il piano. Controlla il Wi-Fi e riapri la sezione."));
    }
  }

  // ---------- Calcoli ----------
  const trainingOf = date => (data.blocks[D.key(date)] || []);
  function weekOf(date) {
    if (!data.start) return null;
    const w = Math.floor(D.between(D.parse(data.start), date) / 7) + 1;
    return Math.min(WEEKS, Math.max(1, w));
  }
  function shortName(b) {
    if (b.sheet_id) return "Scheda " + b.sheet_id;
    return b.title.split("·")[0].trim();
  }
  // Ultima volta che hai registrato questo esercizio prima della data indicata
  function lastLog(exercise, beforeIso) {
    let best = null;
    Object.values(data.logs).forEach(l => {
      if (l.exercise === exercise && l.date < beforeIso && (l.sets || l.reps || l.load_kg || l.minutes) && (!best || l.date > best.date)) best = l;
    });
    return best;
  }
  function describe(l) {
    if (!l) return "";
    const parts = [];
    if (l.sets || l.reps) parts.push(`${l.sets || "?"}×${l.reps || "?"}`);
    if (l.load_kg) parts.push(`${String(l.load_kg).replace(".", ",")} kg`);
    if (l.minutes) parts.push(`${l.minutes} min`);
    return parts.join(" · ");
  }

  // ---------- Salvataggi ----------
  function setDone(iso, done) {
    done ? data.done.add(iso) : data.done.delete(iso);
    DB.save("day_checks", { date: iso, item_id: "training", done }, "user_id,date,item_id");
    render();
  }
  function setStart(iso) {
    data.start = iso;
    DB.save("settings", { key: "programStart", value: iso }, "user_id,key");
    render();
  }
  function updateLog(iso, exercise, field, value) {
    const k = iso + "|" + exercise;
    const l = data.logs[k] = data.logs[k] || { date: iso, exercise, sets: null, reps: "", load_kg: null, minutes: null, note: "" };
    l[field] = value;
    clearTimeout(saveTimers[k]);
    saveTimers[k] = setTimeout(() => {
      delete saveTimers[k];
      DB.save("workout_logs", { date: l.date, exercise: l.exercise, sets: l.sets, reps: l.reps || "", load_kg: l.load_kg, minutes: l.minutes, note: l.note || "" }, "user_id,date,exercise");
    }, 700);
  }
  const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

  // ---------- Interfaccia ----------
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-allenamento");
    const head = S.header("Allenamento");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.week = h("div", "wk-strip");
    ui.body = h("div", "wk-body");
    el.append(head, ui.week, ui.body);
  }

  function render() {
    if (!data || !root) return;
    const today = D.today(), iso = D.iso(selected);
    const w = weekOf(selected);
    ui.sub.textContent = (w ? `Settimana ${w} di ${WEEKS} · ` : "") + D.label(selected, { weekday: "long", day: "numeric", month: "long" });
    S.syncLabel(ui.sync);

    // Settimana Lun…Dom
    ui.week.innerHTML = "";
    const mon = D.monday(selected);
    for (let i = 0; i < 7; i++) {
      const d = D.add(mon, i), di = D.iso(d), tr = trainingOf(d);
      const b = h("button", "wk-day");
      if (di === iso) b.classList.add("on");
      if (di === D.iso(today)) b.classList.add("today");
      if (data.done.has(di)) b.classList.add("done");
      if (!tr.length) b.classList.add("rest");
      b.append(h("span", "wk-d", DAY_SHORT[D.key(d)]), h("span", "wk-n", d.getDate()),
        h("span", "wk-t", tr.length ? shortName(tr[0]) : "riposo"));
      b.addEventListener("click", () => { selected = d; render(); });
      ui.week.appendChild(b);
    }
    const nav = h("div", "wk-nav");
    const prev = h("button", "pill small", "‹ settimana"), next = h("button", "pill small", "settimana ›");
    prev.addEventListener("click", () => { selected = D.add(selected, -7); render(); });
    next.addEventListener("click", () => { selected = D.add(selected, 7); render(); });
    nav.append(prev, next);
    if (D.iso(D.monday(today)) !== D.iso(mon)) {
      const back = h("button", "pill small gold", "oggi");
      back.addEventListener("click", () => { selected = D.today(); render(); });
      nav.appendChild(back);
    }
    ui.week.appendChild(nav);

    // Corpo: sessione del giorno + colonna laterale
    ui.body.innerHTML = "";
    const main = h("div", "card wk-main"), side = h("div", "wk-side");
    ui.body.append(main, side);

    if (!data.start) main.appendChild(startPrompt());
    const tr = trainingOf(selected);
    if (!tr.length) {
      const day = data.days[D.key(selected)] || {};
      main.append(h("h2", "wk-title", "Riposo"), h("p", "wk-desc", day.rest_note || "Giorno di recupero."));
      const nx = nextTraining(selected);
      if (nx) main.appendChild(h("p", "wk-hint", `Prossimo allenamento: ${D.label(nx.date, { weekday: "long" })} · ${nx.block.title}`));
    } else {
      tr.forEach(b => main.appendChild(session(b, iso)));
    }
    side.append(weekCard(mon), historyCard());
  }

  function startPrompt() {
    const box = h("div", "wk-start");
    box.appendChild(h("p", null, "Da quando sono partite le 8 settimane? Serve per sapere a che settimana sei."));
    const input = h("input", "field");
    input.type = "date";
    input.value = D.iso(D.monday(D.today()));
    const ok = h("button", "pill primary", "Salva");
    ok.addEventListener("click", () => input.value && setStart(input.value));
    const row = h("div", "wk-row");
    row.append(input, ok);
    box.appendChild(row);
    return box;
  }

  function session(b, iso) {
    const wrap = h("div", "wk-session");
    const top = h("div", "wk-top");
    const titles = h("div");
    titles.append(h("h2", "wk-title", b.title), h("div", "wk-time", b.time_range || b.time));
    const done = data.done.has(iso);
    const btn = h("button", "wk-done" + (done ? " on" : ""), done ? "✓ Fatto" : "Segna come fatto");
    btn.addEventListener("click", () => setDone(iso, !done));
    top.append(titles, btn);
    wrap.append(top, h("p", "wk-desc", b.description));

    const sheet = b.sheet_id && data.sheets[b.sheet_id];
    if (sheet) {
      if (sheet.warmup) wrap.appendChild(textRow("Riscaldamento", sheet.warmup));
      if (sheet.circuit) wrap.appendChild(textRow("Circuito", sheet.circuit));
      const list = h("div", "wk-ex-list");
      sheet.exercises.forEach(e => list.appendChild(exerciseRow(iso, e.name, e.reps, e.note, false)));
      wrap.appendChild(list);
      if (sheet.core) wrap.appendChild(textRow("Core e braccia", sheet.core));
      if (sheet.cardio) {
        wrap.appendChild(textRow("Cardio", sheet.cardio));
        wrap.appendChild(exerciseRow(iso, "Cardio", "", "", true));
      }
    } else {
      // Camminata, piscina…: si registrano i minuti
      wrap.appendChild(exerciseRow(iso, shortName(b), "", "", true));
    }
    return wrap;
  }

  function textRow(label, text) {
    const r = h("div", "wk-text");
    r.append(h("span", "wk-label", label), h("span", null, text));
    return r;
  }

  function field(ph, value, onInput, mode, cls) {
    const i = h("input", "field " + (cls || ""));
    i.placeholder = ph;
    i.inputMode = mode || "text";
    i.value = value === null || value === undefined ? "" : String(value).replace(".", ",");
    i.addEventListener("input", () => onInput(i.value));
    i.addEventListener("keydown", e => { if (e.key === "Enter") i.blur(); });
    return i;
  }

  function exerciseRow(iso, name, target, note, timed) {
    const k = iso + "|" + name, l = data.logs[k] || {};
    const row = h("div", "wk-ex" + (timed ? " timed" : ""));
    const info = h("div", "wk-ex-info");
    const nm = h("div", "wk-ex-name", name);
    if (target) nm.appendChild(h("span", "wk-ex-target", target));
    info.appendChild(nm);
    if (note) info.appendChild(h("div", "wk-ex-note", note));
    const prev = describe(lastLog(name, iso));
    if (prev) info.appendChild(h("div", "wk-ex-last", "ultima volta: " + prev));
    const inputs = h("div", "wk-ex-inputs");
    if (timed) {
      inputs.append(field("min", l.minutes, v => updateLog(iso, name, "minutes", num(v) === null ? null : Math.round(num(v))), "numeric", "n"),
        field("note", l.note, v => updateLog(iso, name, "note", v), "text", "note"));
    } else {
      inputs.append(field("serie", l.sets, v => updateLog(iso, name, "sets", num(v) === null ? null : Math.round(num(v))), "numeric", "n"),
        field("rip", l.reps, v => updateLog(iso, name, "reps", v.trim()), "text", "n"),
        field("kg", l.load_kg, v => updateLog(iso, name, "load_kg", num(v)), "decimal", "n"));
    }
    row.append(info, inputs);
    return row;
  }

  function nextTraining(from) {
    for (let i = 1; i <= 7; i++) {
      const d = D.add(from, i), tr = trainingOf(d);
      if (tr.length) return { date: d, block: tr[0] };
    }
    return null;
  }

  function weekCard(mon) {
    let planned = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const d = D.add(mon, i);
      if (trainingOf(d).length) { planned++; if (data.done.has(D.iso(d))) done++; }
    }
    const c = h("div", "card wk-stat");
    c.append(h("h2", "zone-h", "Questa settimana"), h("div", "wk-big", `${done}/${planned}`), h("div", "wk-hint", "allenamenti fatti"));
    const bar = h("div", "wk-bar"), fill = h("span");
    fill.style.width = planned ? `${Math.round(done / planned * 100)}%` : "0";
    bar.appendChild(fill);
    c.appendChild(bar);
    return c;
  }

  function historyCard() {
    const c = h("div", "card wk-hist");
    c.appendChild(h("h2", "zone-h", "Storico"));
    const dates = new Set([...data.done]);
    Object.values(data.logs).forEach(l => { if (l.sets || l.reps || l.load_kg || l.minutes) dates.add(l.date); });
    const list = [...dates].sort().reverse().slice(0, 12);
    if (!list.length) c.appendChild(h("div", "wk-hint", "Ancora nessun allenamento registrato."));
    list.forEach(di => {
      const d = D.parse(di), tr = trainingOf(d);
      const n = Object.values(data.logs).filter(l => l.date === di && (l.sets || l.reps || l.load_kg || l.minutes)).length;
      const r = h("button", "wk-hist-row");
      r.append(h("span", "wk-hist-d", D.label(d, { weekday: "short", day: "numeric", month: "short" })),
        h("span", null, tr.length ? shortName(tr[0]) : "extra"),
        h("span", "wk-hist-n", (data.done.has(di) ? "✓ " : "") + (n ? `${n} voci` : "")));
      r.addEventListener("click", () => { selected = d; render(); });
      c.appendChild(r);
    });
    return c;
  }

  S.register("allenamento", {
    open(el) {
      root = el;
      selected = D.today();
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
