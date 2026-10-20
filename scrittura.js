// Sezione Scrittura: il romanzo (materiali in scrittura-dati.js) con i capitoli da scrivere, la scheda del mondo,
// le note veloci e i punti ancora aperti. I testi vanno nell'archivio online (writing_chapters, writing_notes)
// e restano anche in una copia sul tablet, così non si perde nulla se manca la rete.
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;
  // Sul tablet i materiali sono in scrittura-dati.js; la web app dell'iPhone li legge dall'archivio privato
  let R = window.LEI_ROMANZO || null;
  const C = window.LEI_CONFIG || {};
  const PFX = "lei.scrittura.";
  const ROMANZO_FILE = "romanzo/romanzo.json";   // nella cartella privata dell'utente (bucket product-photos)

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(PFX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { } }
  };
  const countWords = t => (t.trim().match(/\S+/g) || []).length;
  const fmt = n => n.toLocaleString("it-IT");

  let root = null, ui = {};
  let tab = "scrivi", chapter = ls.get("chapter", 1), topic = "premessa", showNotes = ls.get("showNotes", true);
  let chapters = {};        // n → { body, words, updated_at }
  let notes = [];           // { id, chapter, body, created_at }
  let missing = false;      // tabelle non ancora create nell'archivio (05_scrittura.sql)
  let timer = null, timerChapter = null;
  let noteDraft = "", noteChapter = "";

  // ---------- Copia sul tablet ----------
  // Ogni capitolo ha una bozza locale { body, at, synced }: se l'archivio non l'ha ancora, viene rinviata.
  const drafts = ls.get("drafts", {});
  function keepDraft(n, body, synced) {
    drafts[n] = { body, at: new Date().toISOString(), synced };
    ls.set("drafts", drafts);
  }

  // ---------- Dati ----------
  const pathCh = () => `writing_chapters?project=eq.${R.id}&select=chapter,body,words,updated_at`;
  const pathNotes = () => `writing_notes?project=eq.${R.id}&deleted_at=is.null&select=id,chapter,body,created_at&order=created_at.desc`;

  // ---------- Materiali del romanzo nell'archivio privato ----------
  // Il tablet li carica quando cambiano (dopo una ricompilazione); l'iPhone li scarica e ne tiene una copia.
  function hashText(t) { let x = 0; for (let i = 0; i < t.length; i++) x = (x * 31 + t.charCodeAt(i)) | 0; return String(x); }
  async function uploadRomanzo() {
    if (!window.LEI_ROMANZO || !DB.signedIn) return;
    const json = JSON.stringify(window.LEI_ROMANZO), hash = hashText(json);
    if (ls.get("romanzoUp", "") === hash) return;
    try {
      await DB.uploadPhoto(ROMANZO_FILE, new Blob([json], { type: "application/json" }));
      ls.set("romanzoUp", hash);
    } catch (e) { }
  }
  async function downloadRomanzo() {
    if (R) return R;
    try {
      const path = `${DB.uid()}/${ROMANZO_FILE}`;
      const url = (await DB.signPhotos([path]))[path];
      if (url) {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) { R = await r.json(); ls.set("romanzo", R); return R; }
      }
    } catch (e) { }
    R = ls.get("romanzo", null);   // senza rete: l'ultima copia scaricata
    return R;
  }
  uploadRomanzo();
  DB.onChange(uploadRomanzo);

  function apply(rows, noteRows, resend) {
    const byN = {};
    rows.forEach(r => (byN[r.chapter] = r));
    // Le bozze locali non ancora arrivate all'archivio hanno la precedenza (e vengono rinviate)
    Object.keys(drafts).forEach(n => {
      const d = drafts[n], srv = byN[n];
      if (srv && srv.body === d.body) { d.synced = true; return; }
      if (!d.synced && (!srv || d.at > srv.updated_at)) {
        byN[n] = { chapter: +n, body: d.body, words: countWords(d.body), updated_at: d.at };
        if (resend && !missing) push(+n, d.body);
      }
    });
    ls.set("drafts", drafts);
    // Il capitolo che si sta scrivendo non va toccato
    if (timer && chapters[timerChapter]) byN[timerChapter] = chapters[timerChapter];
    chapters = byN;
    notes = noteRows;
  }

  async function refresh(cacheOnly) {
    const get = p => (cacheOnly ? DB.peek(p) : DB.load(p));
    try {
      const [rows, noteRows] = await Promise.all([get(pathCh()), get(pathNotes())]);
      missing = false;
      apply(rows, noteRows, !cacheOnly);
    } catch (e) {
      if (e.status === 401) return;
      if (e.status === 404) missing = true;   // tabelle da creare: si scrive solo sul tablet
      if (!cacheOnly || !Object.keys(chapters).length) apply([], notes, false);
    }
    render();
  }

  // ---------- Salvataggi ----------
  function push(n, body) {
    DB.save("writing_chapters", { project: R.id, chapter: n, body, words: countWords(body) }, "user_id,project,chapter");
  }
  function typed(n, body) {
    chapters[n] = { chapter: n, body, words: countWords(body), updated_at: new Date().toISOString() };
    keepDraft(n, body, false);
    if (timer && timerChapter !== n) saveNow();
    clearTimeout(timer);
    timerChapter = n;
    setState("…");
    timer = setTimeout(saveNow, 1500);
    updateCounts();
  }
  function saveNow() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    const n = timerChapter, c = chapters[n];
    if (c && !missing) push(n, c.body);
    setState();
  }

  function addNote(body, ch) {
    body = body.trim();
    if (!body) return;
    const row = { project: R.id, chapter: ch ? +ch : null, body };
    notes.unshift(Object.assign({ id: null, created_at: new Date().toISOString() }, row));
    if (missing) { K.toast("Prima va preparato l'archivio (05_scrittura.sql)"); notes.shift(); return; }
    DB.insert("writing_notes", row).then(() => refresh());
    render();
  }
  function removeNote(note) {
    notes = notes.filter(x => x !== note);
    if (note.id) DB.update("writing_notes", `id=eq.${note.id}`, { deleted_at: new Date().toISOString() });
    render();
  }

  // ---------- Copia negli appunti e Claude ----------
  function copy(text) {
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;left:0;top:0;opacity:0;";
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { }
    t.remove();
    return ok;
  }
  function askClaude() {
    const cap = R.capitoli.find(c => c.n === chapter), body = (chapters[chapter] || {}).body || "";
    if (!body.trim()) { K.toast("Il capitolo è ancora vuoto"); return; }
    const text = `Sono Fabio. Questo è il capitolo ${cap.n}, «${cap.titolo}», del mio romanzo ${R.titolo} (${R.titoloAlt}). ` +
      `La prosa la scrivo io: non riscriverla e non continuarla. Dammi una critica onesta e diretta: voce, ritmo, ` +
      `coerenza con il mondo e con la bibbia, cosa funziona e cosa no.\n\n---\n\n${body}`;
    if (!copy(text)) { K.toast("Non riesco a copiare il testo"); return; }
    K.toast("Capitolo copiato: incollalo nella chat di Claude");
    const p = ((C.claude || {}).projects || []).find(x => x.section === "scrittura") || {};
    const pkg = (C.claude || {}).pkg || "com.anthropic.claude";
    setTimeout(() => {
      if (p.url) K.L.openUrl(p.url, pkg);
      else if (!(K.L.assistIn && K.L.assistIn(pkg)) && !K.L.launch(pkg)) K.L.openUrl((C.claude || {}).web || "https://claude.ai/new", "com.android.chrome");
    }, 700);
  }

  // ---------- Interfaccia ----------
  const TABS = [["scrivi", "Scrivi"], ["mondo", "Il mondo"], ["note", "Note"], ["aperti", "Da decidere"]];

  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-scrittura");
    const head = S.header(R.titoloAlt);
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    TABS.forEach(([id, label]) => {
      const b = h("button", "pill small", label);
      b.dataset.tab = id;
      b.addEventListener("click", () => { saveNow(); tab = id; render(); });
      ui.tabs.appendChild(b);
    });
    head.insertBefore(ui.tabs, ui.sync);
    ui.body = h("div", "sc-body");
    el.append(head, ui.body);
  }

  function totalWords() { return Object.values(chapters).reduce((s, c) => s + (c.words || 0), 0); }
  function updateCounts() {
    const started = Object.values(chapters).filter(c => c.words > 0).length;
    ui.sub.textContent = `${R.titolo} · ${fmt(totalWords())} parole · ${started} di ${R.capitoli.length} capitoli iniziati`;
    if (ui.words) ui.words.textContent = `${fmt((chapters[chapter] || {}).words || 0)} parole`;
    if (ui.list) ui.list.querySelectorAll(".sc-ch").forEach(b => {
      const c = chapters[b.dataset.n];
      b.querySelector(".sc-ch-w").textContent = c && c.words ? fmt(c.words) : "";
    });
  }
  function setState(s) {
    if (!ui.state) return;
    ui.state.textContent = s || (missing ? "salvato sul tablet" : DB.pending ? "da inviare" : "salvato");
  }
  function syncLabel() {
    if (missing) ui.sync.textContent = "archivio da preparare · testi solo sul tablet";
    else S.syncLabel(ui.sync);
  }

  function render() {
    if (!root) return;
    ui.tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    syncLabel();
    ui.body.innerHTML = "";
    ui.body.className = "sc-body sc-" + tab;
    ui.words = ui.state = ui.list = null;
    if (tab === "scrivi") renderWrite();
    else if (tab === "mondo") renderWorld();
    else if (tab === "note") renderNotes();
    else renderOpen();
    updateCounts();
    // La voce scelta resta visibile nelle file che scorrono (capitoli e argomenti, in verticale)
    ui.body.querySelectorAll(".sc-ch.on, .sc-topic.on").forEach(b => b.scrollIntoView({ block: "nearest", inline: "center" }));
  }

  // Scrivi: elenco dei capitoli · foglio · appunti del capitolo
  function renderWrite() {
    ui.body.classList.toggle("no-notes", !showNotes);
    const list = ui.list = h("div", "card sc-list");
    let act = null;
    R.capitoli.forEach(c => {
      if (c.atto !== act) { act = c.atto; list.appendChild(h("div", "sc-act", "Atto " + act)); }
      const b = h("button", "sc-ch" + (c.n === chapter ? " on" : ""));
      b.dataset.n = c.n;
      b.append(h("span", "sc-ch-n", String(c.n).padStart(2, "0")), h("span", "sc-ch-t", c.titolo), h("span", "sc-ch-w"));
      b.addEventListener("click", () => { saveNow(); chapter = c.n; ls.set("chapter", chapter); render(); });
      list.appendChild(b);
    });

    const cap = R.capitoli.find(c => c.n === chapter);
    const ed = h("div", "card sc-editor");
    const top = h("div", "sc-ed-top");
    const tt = h("div");
    tt.append(h("div", "sc-ed-n", `Capitolo ${cap.n} · ${cap.luogo}`), h("h2", "sc-ed-title", cap.titolo));
    const tog = h("button", "pill small" + (showNotes ? " on" : ""), "Appunti");
    tog.addEventListener("click", () => { showNotes = !showNotes; ls.set("showNotes", showNotes); render(); });
    top.append(tt, tog);
    const ta = h("textarea", "sc-text");
    ta.value = (chapters[chapter] || {}).body || "";
    ta.placeholder = "Comincia a scrivere…";
    ta.spellcheck = true;
    ta.addEventListener("input", () => typed(chapter, ta.value));
    const foot = h("div", "sc-ed-foot");
    ui.words = h("span", "sc-words");
    ui.state = h("span", "sc-state");
    const ask = h("button", "pill small gold", "Chiedi un parere a Claude");
    ask.addEventListener("click", () => { saveNow(); askClaude(); });
    foot.append(ui.words, ui.state, h("span", "sc-gap"), ask);
    ed.append(top, ta, foot);
    setState(timer ? "…" : "");

    ui.body.append(list, ed);
    if (showNotes) ui.body.appendChild(chapterNotes(cap));
  }

  function chapterNotes(cap) {
    const side = h("div", "card sc-side");
    side.appendChild(h("h3", "zone-h", "Scaletta proposta · da smontare"));
    const ul = h("ul", "sc-bul");
    cap.proposta.forEach(t => ul.appendChild(h("li", null, t)));
    side.appendChild(ul);
    [["Elio", cap.elio], ["Thomas", cap.thomas]].forEach(([who, t]) => {
      const p = h("p", "sc-arc");
      p.append(h("b", null, who + " "), document.createTextNode(t));
      side.appendChild(p);
    });
    side.appendChild(h("h3", "zone-h", "Da decidere"));
    side.appendChild(h("p", "sc-open", cap.decidere));
    side.appendChild(h("h3", "zone-h", "Le tue note"));
    notes.filter(n => n.chapter === cap.n).forEach(n => side.appendChild(h("p", "sc-mynote", n.body)));
    const row = h("div", "sc-quick");
    const inp = h("input", "field");
    inp.placeholder = "Nota veloce per questo capitolo";
    const add = h("button", "pill small", "+");
    const go = () => { addNote(inp.value, cap.n); inp.value = ""; };
    add.addEventListener("click", go);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    row.append(inp, add);
    side.appendChild(row);
    side.appendChild(h("p", "sc-rule", R.regola));
    return side;
  }

  // Il mondo: argomenti a sinistra, scheda a destra
  function renderWorld() {
    const list = h("div", "card sc-topics");
    R.mondo.forEach(m => {
      const b = h("button", "sc-topic" + (m.id === topic ? " on" : ""), m.titolo);
      b.addEventListener("click", () => { topic = m.id; render(); });
      list.appendChild(b);
    });
    const m = R.mondo.find(x => x.id === topic) || R.mondo[0];
    const page = h("div", "card sc-page");
    page.appendChild(h("h2", "sc-page-title", m.titolo));
    if (m.id === "premessa") {
      page.appendChild(h("p", "sc-thesis", R.tesi));
      page.appendChild(h("p", "sc-motto", "«" + R.motto + "»"));
    }
    m.blocchi.forEach(b => {
      if (b.titolo) page.appendChild(h("h3", "zone-h", b.titolo));
      const ul = h("ul", "sc-bul");
      b.voci.forEach(t => ul.appendChild(h("li", null, t)));
      page.appendChild(ul);
    });
    if (m.elenco) {
      const grid = h("div", "sc-factions");
      m.elenco.forEach(f => {
        const card = h("div", "sc-faction");
        const em = h("div", "sc-emblem");
        em.innerHTML = (R.emblemi || {})[f.id] || "";   // SVG dai materiali del romanzo (file locale)
        card.append(em, h("div", "sc-f-name", f.nome), h("div", "sc-f-em", f.emblema), h("div", "sc-f-txt", f.testo));
        grid.appendChild(card);
      });
      page.appendChild(grid);
    }
    if (m.cenere) {
      [["La cenere · energia ceduta", m.cenere], ["I legami · proposta, non decisa", m.legami]].forEach(([title, list]) => {
        page.appendChild(h("h3", "zone-h", title));
        const row = h("div", "sc-swatches");
        list.forEach(([name, hex]) => {
          const s = h("div", "sc-swatch");
          const chip = h("span", "sc-chip");
          chip.style.background = hex;
          s.append(chip, h("span", null, name), h("span", "sc-hex", hex));
          row.appendChild(s);
        });
        page.appendChild(row);
      });
    }
    ui.body.append(list, page);
  }

  // Note veloci
  function renderNotes() {
    const form = h("div", "card sc-note-form");
    form.appendChild(h("h3", "zone-h", "Nuova nota"));
    const ta = h("textarea", "field sc-note-text");
    ta.placeholder = "Un'idea, una frase, un dubbio…";
    ta.value = noteDraft;
    ta.addEventListener("input", () => (noteDraft = ta.value));
    const sel = h("select", "field");
    sel.appendChild(new Option("Generale", ""));
    R.capitoli.forEach(c => sel.appendChild(new Option(`Cap. ${c.n} · ${c.titolo}`, String(c.n))));
    sel.value = noteChapter;
    sel.addEventListener("change", () => (noteChapter = sel.value));
    const add = h("button", "pill primary", "Aggiungi");
    add.addEventListener("click", () => { addNote(ta.value, sel.value); noteDraft = ""; render(); });
    form.append(ta, sel, add);

    const list = h("div", "card sc-note-list");
    list.appendChild(h("h3", "zone-h", `Note · ${notes.length}`));
    if (!notes.length) list.appendChild(h("div", "wk-hint", missing ? "Le note arriveranno quando l'archivio sarà pronto." : "Ancora nessuna nota."));
    notes.forEach(n => {
      const row = h("div", "sc-note");
      const meta = h("div", "sc-note-meta");
      const cap = n.chapter && R.capitoli.find(c => c.n === n.chapter);
      meta.textContent = D.label(new Date(n.created_at), { day: "numeric", month: "short" }) + (cap ? ` · Cap. ${cap.n} ${cap.titolo}` : "");
      const del = h("button", "sc-del", "✕");
      del.addEventListener("click", () => {
        if (del.classList.contains("ask")) removeNote(n);
        else { del.classList.add("ask"); del.textContent = "Elimina?"; setTimeout(() => { del.classList.remove("ask"); del.textContent = "✕"; }, 3000); }
      });
      const txt = h("div", "sc-note-body", n.body);
      row.append(txt, meta, del);
      list.appendChild(row);
    });
    ui.body.append(form, list);
  }

  // Da decidere: i punti aperti della bibbia e quelli di ogni capitolo
  function renderOpen() {
    const main = h("div", "card sc-page");
    main.appendChild(h("h2", "sc-page-title", "Ancora da decidere"));
    R.aperti.forEach(a => main.appendChild(openItem(a.titolo, a.nota, "")));
    main.appendChild(h("h3", "zone-h", "Capitolo per capitolo"));
    R.capitoli.forEach(c => main.appendChild(openItem(`${c.n} · ${c.titolo}`, c.decidere, String(c.n))));
    const side = h("div", "card sc-side");
    side.appendChild(h("h3", "zone-h", "Prossimi passi"));
    const ol = h("ol", "sc-bul");
    R.prossimi.forEach(t => ol.appendChild(h("li", null, t)));
    side.appendChild(ol);
    side.appendChild(h("p", "sc-rule", R.regola));
    ui.body.append(main, side);
  }
  function openItem(title, note, ch) {
    const row = h("div", "sc-open-item");
    const txt = h("div");
    txt.appendChild(h("div", "sc-open-t", title));
    if (note) txt.appendChild(h("div", "sc-open-n", note));
    const b = h("button", "pill small", "Annota");
    b.addEventListener("click", () => {
      tab = "note";
      noteDraft = (ch ? "" : title + ": ") + noteDraft;
      noteChapter = ch;
      render();
    });
    row.append(txt, b);
    return row;
  }

  S.register("scrittura", {
    async open(el) {
      root = el;
      tab = "scrivi";
      if (!R) {
        el.innerHTML = "";
        el.appendChild(S.header("Scrittura"));
        const wait = el.appendChild(h("div", "sec-empty", "Carico i materiali del romanzo…"));
        await downloadRomanzo();
        if (root !== el) return;   // sezione chiusa nel frattempo
        if (!R) { wait.textContent = "Materiali del romanzo non trovati: apri una volta la Scrittura sul tablet, poi riprova"; return; }
      }
      build(el);
      render();
      // Prima la copia salvata sul tablet, poi i dati aggiornati dall'archivio
      refresh(true).then(() => refresh());
    },
    close() {
      saveNow();
      root = null;
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      DB.flush();
    },
    sync() { if (root && ui.sync) { syncLabel(); setState(timer ? "…" : ""); } }
  });

  // Se Lei va in pausa mentre si scrive, salva subito
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
})();
