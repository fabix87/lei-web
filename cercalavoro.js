// Sezione "Cerca Lavoro": annunci coerenti con il profilo professionale (artifact "Annunci ottobre 2026", app Incastro).
// Punteggio sul profilo (come Incastro: src/scoring), stati nuovo → salvato → candidato o scartato, "Incolla annuncio".
// Gli annunci nuovi arrivano quando Fabio chiede a Claude, dal computer, di aggiornare la ricerca (docs/aggiorna-lavoro.md,
// funzione `lavoro-import`); in più "Ricerca automatica" con Jooble tramite la funzione `job-search`, se c'è la chiave.
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ---------- Motore (come src/scoring/engine.ts di Incastro) ----------
  const BASE_SCORE = 40, SOFTWARE_BONUS = 4, GAP_MALUS = 4;
  const normalize = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  const patterns = new Map();
  function termPattern(term) {
    if (patterns.has(term)) return patterns.get(term);
    const clean = normalize(term), prefix = clean.endsWith("*");
    const core = (prefix ? clean.slice(0, -1) : clean).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s\\-]+");
    const re = new RegExp(`(^|[^a-z0-9])${core}${prefix ? "" : "(?![a-z0-9])"}`);
    patterns.set(term, re);
    return re;
  }
  function findTerm(text, terms) {
    for (const t of terms) if (t && t.trim() && termPattern(t).test(text)) return t;
    return null;
  }
  function evaluate(input, criteria) {
    const texts = { title: normalize(input.title), body: normalize(input.body), location: normalize(input.location) };
    const bonuses = [], maluses = [];
    let excluded = null, score = BASE_SCORE;
    for (const c of criteria) {
      const hay = (c.fields || ["title", "body"]).map(f => texts[f]).join(" \n ");
      const term = findTerm(hay, c.terms);
      if (!term) continue;
      if (c.kind === "bonus") { bonuses.push(c); score += c.weight || 0; }
      else if (c.kind === "malus") { maluses.push(c); score -= c.weight || 0; }
      else if (!excluded) excluded = c.reason || c.label;
    }
    return { score: Math.max(0, Math.min(100, Math.round(score))), bonuses, maluses, excluded };
  }

  // ---------- Profilo e punteggio (come src/scoring/profile.ts e jobScoring.ts) ----------
  // Il profilo vero sta nell'archivio (settings 'jobProfile'): qui solo la struttura minima di riserva.
  const FALLBACK_PROFILE = { name: "", fields: [], mySoftware: [], gapSoftware: [], weakSignals: [], areas: ["Torino"], remoteTerms: ["remoto", "remote", "smart working"],
    exclusions: [], rules: [], maxAgeDays: 30, searchQueries: [], searchCity: "Torino", searchRadiusKm: 40 };
  const FIT_LABEL = { alta: "Compatibilità alta", media: "Compatibilità media", mediabassa: "Compatibilità media-bassa", bassa: "Compatibilità bassa" };
  const CONTRACT_LABEL = { dipendente: "Dipendente", freelance: "Freelance / a progetto", nd: "Da verificare" };
  const GROUP_LABEL = { contratto: "3D, display e spazi", freelance: "3D e packaging · freelance", editoria: "Editoria e grafica" };
  const fitOf = s => s >= 75 ? "alta" : s >= 55 ? "media" : s >= 40 ? "mediabassa" : "bassa";
  const FREELANCE = ["freelance", "partita iva", "p.iva", "p. iva", "piva", "a progetto", "collaborazione", "collaboratore", "contract", "contractor"];
  const EMPLOYEE = ["indeterminato", "determinato", "ccnl", "assunzione", "dipendente", "somministrazione", "tempo pieno", "full time", "full-time", "permanent", "ral"];
  const detectContract = t => findTerm(normalize(t), FREELANCE) ? "freelance" : findTerm(normalize(t), EMPLOYEE) ? "dipendente" : "nd";
  const ruleTerms = rules => rules.map(r => r.trim().replace(/^(niente|no|non voglio|evita(re)?)\s+/i, "").replace(/[.;]+$/, "")).filter(Boolean);
  const list = l => l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;

  let criteriaCache = null;
  function buildCriteria(p) {
    if (criteriaCache && criteriaCache.p === p) return criteriaCache.c;
    const c = [];
    p.exclusions.forEach((g, i) => c.push({ id: `excl-${i}`, label: g.reason, kind: "exclude", terms: g.terms, reason: g.reason }));
    ruleTerms(p.rules).forEach((t, i) => c.push({ id: `rule-${i}`, label: t, kind: "exclude", terms: [t], reason: `Una tua regola: "${t}"` }));
    p.fields.forEach((g, i) => c.push({ id: `field-${i}`, label: g.label, kind: "bonus", terms: g.terms, weight: g.weight }));
    p.mySoftware.forEach((s, i) => c.push({ id: `sw-${i}`, label: s, kind: "bonus", terms: [s, s.replace(/-/g, "")], weight: SOFTWARE_BONUS }));
    p.gapSoftware.forEach((s, i) => c.push({ id: `gap-${i}`, label: s, kind: "malus", terms: [s, s.replace(/ /g, "")], weight: GAP_MALUS }));
    p.weakSignals.forEach((g, i) => c.push({ id: `weak-${i}`, label: g.label, kind: "malus", terms: g.terms, weight: g.weight }));
    criteriaCache = { p, c };
    return c;
  }

  function scoreJob(j, p) {
    const body = [j.company, j.description, j.contract_hint || ""].join("\n");
    const r = evaluate({ title: j.title, body, location: j.location }, buildCriteria(p));
    const by = pre => r.bonuses.filter(m => m.id.startsWith(pre)).map(m => m.label);
    const fields = by("field-"), software = by("sw-");
    const weak = r.maluses.filter(m => m.id.startsWith("weak-")).map(m => m.label);
    const gaps = r.maluses.filter(m => m.id.startsWith("gap-")).map(m => m.label);
    const reasons = [fields.length ? `In linea con te: ${list(fields)}.` : "Nessun ambito del tuo profilo nel testo."];
    if (software.length) reasons.push(`Software che usi: ${list(software)}.`);
    if (weak.length) reasons.push(`Si allontana da te: ${list(weak).toLowerCase()}.`);
    let excluded = r.excluded;
    const full = normalize(`${j.title}\n${j.location}\n${body}`);
    if (findTerm(normalize(j.location), p.areas)) reasons.push("Sede nella tua zona.");
    else if (findTerm(full, p.remoteTerms)) reasons.push("Lavoro da remoto.");
    else if (j.location.trim()) excluded = excluded || `Fuori area (${j.location.trim()}).`;
    else reasons.push("Sede da verificare.");
    if (j.published_at && p.maxAgeDays > 0 && D.between(D.parse(j.published_at), D.today()) > p.maxAgeDays) excluded = excluded || `Pubblicato da oltre ${p.maxAgeDays} giorni.`;
    const contract = detectContract(`${j.contract_hint || ""}\n${j.title}\n${j.description}`);
    const isEd = l => /grafic|editori/.test(normalize(l));
    const group = fields.some(isEd) && !fields.some(l => !isEd(l)) ? "editoria" : contract === "freelance" ? "freelance" : "contratto";
    return { score: r.score, fit: fitOf(r.score), reasons, gaps, contract, group, excluded };
  }

  // ---------- Dati ----------
  const PATH = "jobs?select=id,source_key,source,url,title,company,location,description,salary,contract_hint,published_at,published_label,note,status,status_note,added_at&order=added_at.desc,id.desc";
  const PATH_SET = "settings?key=in.(jobProfile,jobLastSearch)&select=key,value";
  let root = null, ui = {}, data = null, tab = "nuovi", contractFilter = "", searching = false;

  async function loadAll(cacheOnly) {
    const get = p => (cacheOnly ? DB.peek(p) : DB.load(p));
    const [jobs, settings] = await Promise.all([get(PATH), get(PATH_SET)]);
    const set = Object.fromEntries(settings.map(s => [s.key, s.value]));
    let profile = FALLBACK_PROFILE, last = null;
    try { if (set.jobProfile) profile = Object.assign({}, FALLBACK_PROFILE, JSON.parse(set.jobProfile)); } catch (e) { }
    try { if (set.jobLastSearch) last = JSON.parse(set.jobLastSearch); } catch (e) { }
    return { jobs, profile, last };
  }
  async function refresh() {
    try { data = await loadAll(false); render(); }
    catch (e) {
      if (e.status === 401) return;
      if (!data) { ui.body.innerHTML = ""; ui.body.appendChild(h("div", "sec-empty", e.status === 404 ? "Le tabelle di Cerca Lavoro non sono ancora nell'archivio (10_cerca_casa_lavoro.sql)." : "Non riesco a scaricare gli annunci. Controlla il Wi-Fi e riapri la sezione.")); }
    }
  }

  // ---------- Salvataggi ----------
  function setStatus(j, status, note) {
    j.status = status;
    if (note !== undefined) j.status_note = note;
    const values = { status, status_at: new Date().toISOString() };
    if (note !== undefined) values.status_note = note;
    if (j.id !== null) DB.update("jobs", `id=eq.${j.id}`, values);
    render();
  }
  let noteTimer = null;
  function setNote(j, text) {
    j.status_note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => j.id !== null && DB.update("jobs", `id=eq.${j.id}`, { status_note: text }), 700);
  }
  function saveProfile(p) {
    data.profile = p;
    criteriaCache = null;
    DB.save("settings", { key: "jobProfile", value: JSON.stringify(p) }, "user_id,key");
    render();
  }
  const titleKey = (t, c) => `${normalize(t)}|${normalize(c)}`;
  // Aggiunge gli annunci nuovi: salta quelli già visti, anche se scartati (non vengono riproposti)
  function addJobs(inputs) {
    const ids = new Set(data.jobs.map(j => j.source_key)), titles = new Set(data.jobs.map(j => titleKey(j.title, j.company)));
    const today = D.iso(D.today()), rows = [];
    let added = 0, excluded = 0, duplicates = 0;
    inputs.forEach(x => {
      const tk = titleKey(x.title, x.company);
      if (!x.title || ids.has(x.id) || titles.has(tk)) { duplicates++; return; }
      ids.add(x.id); titles.add(tk);
      const row = { source_key: x.id, source: x.source || "", url: x.url || "", title: x.title, company: x.company || "", location: x.location || "",
        description: x.description || "", salary: x.salary || "", contract_hint: x.contractHint || "", published_at: x.publishedAt || null,
        published_label: x.publishedLabel || null, note: "", added_at: today };
      rows.push(row);
      data.jobs.unshift(Object.assign({ id: null, status: "nuovo", status_note: "" }, row));
      scoreJob(row, data.profile).excluded ? excluded++ : added++;
    });
    DB.insertMany("jobs", rows, "user_id,source_key").then(refresh);
    return { added, excluded, duplicates };
  }

  async function runSearch() {
    if (searching) return;
    const p = data.profile;
    if (!p.searchQueries.length) return K.toast("Aggiungi le ricerche nel Profilo");
    searching = true;
    render();
    const qs = p.searchQueries.map(q => "q=" + encodeURIComponent(q)).join("&") + `&city=${encodeURIComponent(p.searchCity)}&radius=${p.searchRadiusKm}&days=${p.maxAgeDays}`;
    const res = await DB.fn("job-search", qs);
    searching = false;
    if (!res) { render(); return K.toast("Ricerca non riuscita: controlla la rete (o la funzione job-search)"); }
    if (res.noKeys) { render(); return openKeysInfo(); }
    const r = addJobs(res.jobs || []);
    const last = { date: D.iso(D.today()), sources: (res.sources || []).join(", "), added: r.added, excluded: r.excluded, duplicates: r.duplicates, errors: res.errors || [] };
    data.last = last;
    DB.save("settings", { key: "jobLastSearch", value: JSON.stringify(last) }, "user_id,key");
    tab = "nuovi";
    render();
    K.toast(r.added ? `${r.added} annunci nuovi` + (r.excluded ? `, ${r.excluded} esclusi dal profilo` : "") : "Nessun annuncio nuovo" + (last.errors.length ? ` · ${last.errors[0]}` : ""));
  }

  // ---------- Interfaccia ----------
  const TABS = [["nuovi", "Nuovi"], ["salvati", "Salvati"], ["candidato", "Candidato"], ["scartati", "Scartati"], ["esclusi", "Esclusi dal profilo"]];
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-lavoro", "sec-cerca");
    const head = S.header("Cerca Lavoro");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    TABS.forEach(([id]) => {
      const b = h("button", "pill small");
      b.dataset.tab = id;
      b.addEventListener("click", () => { tab = id; render(); });
      ui.tabs.appendChild(b);
    });
    head.insertBefore(ui.tabs, ui.sync);
    ui.bar = h("div", "cc-bar");
    ui.body = h("div", "cc-list");
    ui.sheet = h("div", "sheet cc-sheet");
    ui.sheet.hidden = true;
    ui.sheet.addEventListener("click", e => { if (e.target === ui.sheet) closeSheet(); });
    el.append(head, ui.bar, ui.body, ui.sheet);
  }

  function buildBar() {
    ui.bar.innerHTML = "";
    [["", "Tutti"], ["dipendente", "Dipendente"], ["freelance", "Freelance"], ["nd", "Da verificare"]].forEach(([v, label]) => {
      const b = h("button", "pill small" + (contractFilter === v ? " on" : ""), label);
      b.addEventListener("click", () => { contractFilter = v; render(); });
      ui.bar.appendChild(b);
    });
    const upd = h("button", "pill small gold cc-upd", searching ? "Cerco…" : "Aggiorna ricerca");
    upd.disabled = searching;
    upd.addEventListener("click", openUpdateInfo);
    const paste = h("button", "pill small", "+ Incolla");
    paste.addEventListener("click", openPaste);
    const prof = h("button", "pill small", "Profilo");
    prof.addEventListener("click", openProfile);
    ui.bar.append(upd, paste, prof);
  }

  function render() {
    if (!data || !root) return;
    const scored = data.jobs.map(j => ({ j, s: scoreJob(j, data.profile) }));
    const inTab = {
      nuovi: x => x.j.status === "nuovo" && !x.s.excluded,
      salvati: x => x.j.status === "salvato",
      candidato: x => x.j.status === "candidato",
      scartati: x => x.j.status === "scartato",
      esclusi: x => x.j.status === "nuovo" && x.s.excluded
    };
    ui.tabs.querySelectorAll("button").forEach(b => {
      b.classList.toggle("on", b.dataset.tab === tab);
      b.textContent = `${TABS.find(t => t[0] === b.dataset.tab)[1]} ${scored.filter(inTab[b.dataset.tab]).length}`;
    });
    const l = data.last;
    ui.sub.textContent = l ? `Ultima ricerca: ${D.label(D.parse(l.date), { day: "numeric", month: "long" })}${l.sources ? " · " + l.sources : ""}` : "Ricerca di partenza: ottobre 2026";
    S.syncLabel(ui.sync);
    buildBar();

    const shown = scored.filter(inTab[tab]).filter(x => !contractFilter || x.s.contract === contractFilter)
      .sort((a, b) => b.s.score - a.s.score || String(b.j.added_at).localeCompare(String(a.j.added_at)));
    ui.body.innerHTML = "";
    if (!shown.length) {
      ui.body.appendChild(h("div", "sec-empty", tab === "nuovi" ? "Nessun annuncio nuovo: prova «Aggiorna ricerca» o incollane uno." : "Nessun annuncio qui."));
      return;
    }
    if (tab === "nuovi") {
      Object.keys(GROUP_LABEL).forEach(g => {
        const items = shown.filter(x => x.s.group === g);
        if (!items.length) return;
        ui.body.appendChild(h("h2", "zone-h cl-group", `${GROUP_LABEL[g]} · ${items.length}`));
        items.forEach(x => ui.body.appendChild(card(x.j, x.s)));
      });
    } else shown.forEach(x => ui.body.appendChild(card(x.j, x.s)));
  }

  const isNew = j => D.between(D.parse(j.added_at), D.today()) <= 3 && !String(j.source_key).startsWith("artifact:");

  function card(j, s) {
    const c = h("div", "card cc-card cl-card");
    const top = h("div", "cc-top");
    const t = h("div", "cc-titles");
    t.append(h("div", "cc-zone", (j.source || "") + (isNew(j) ? " · nuovo" : "")), h("div", "cc-addr", j.title), h("div", "cl-org", j.company));
    const fit = h("span", `cl-fit ${s.fit}`, `${FIT_LABEL[s.fit].replace("Compatibilità ", "")} · ${s.score}`);
    top.append(t, fit);
    const facts = h("div", "cc-facts");
    [j.location || "Sede N/D", j.published_label || (j.published_at ? D.label(D.parse(j.published_at), { day: "numeric", month: "short" }) : "data N/D"), j.salary || "Compenso N/D", CONTRACT_LABEL[s.contract]]
      .forEach(x => facts.appendChild(h("span", "cc-fact", x)));
    c.append(top, facts, h("div", "cl-reasons", s.reasons.join(" ")));
    if (s.gaps.length) {
      const g = h("div", "cl-gaps");
      s.gaps.forEach(x => g.appendChild(h("span", "cl-gap", x)));
      c.appendChild(g);
    }
    if (s.excluded && j.status === "nuovo") c.appendChild(h("div", "cc-why-out", s.excluded));
    if (j.status_note) c.appendChild(h("div", "cc-note", j.status_note));
    const foot = h("div", "cc-foot");
    const links = h("div", "cc-links");
    if (j.url) { const a = h("button", "cc-link", "Apri annuncio ↗"); a.addEventListener("click", e => { e.stopPropagation(); K.L.openUrl(j.url, "com.android.chrome"); }); links.appendChild(a); }
    const acts = h("div", "cc-acts cl-acts");
    const act = (label, fn, on) => { const b = h("button", "pill small" + (on ? " on" : ""), label); b.addEventListener("click", e => { e.stopPropagation(); fn(); }); acts.appendChild(b); };
    if (j.status === "scartato") act("Ripristina", () => setStatus(j, "nuovo", ""));
    else {
      act(j.status === "salvato" ? "Salvato" : "Salva", () => setStatus(j, j.status === "salvato" ? "nuovo" : "salvato"), j.status === "salvato");
      act(j.status === "candidato" ? "Candidato ✓" : "Candidato", () => setStatus(j, j.status === "candidato" ? "salvato" : "candidato"), j.status === "candidato");
      act("Scarta", () => openDiscard(j));
    }
    foot.append(links, acts);
    c.appendChild(foot);
    c.addEventListener("click", () => openDetail(j, s));
    return c;
  }

  // ---------- Pannelli ----------
  function closeSheet() { ui.sheet.hidden = true; ui.sheet.innerHTML = ""; }
  function sheet(title) {
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box cc-box");
    box.appendChild(h("h3", null, title));
    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
    return box;
  }
  function rowButtons(box, buttons) {
    const row = h("div", "row");
    buttons.forEach(([label, cls, fn]) => { const b = h("button", cls || null, label); b.addEventListener("click", fn); row.appendChild(b); });
    box.appendChild(row);
  }
  function field(box, label, input) { const w = h("label", "cc-field"); w.append(h("span", null, label), input); box.appendChild(w); return input; }
  function input(value, ph) { const i = h("input", "field"); i.value = value ?? ""; if (ph) i.placeholder = ph; return i; }
  function area(value, ph) { const t = h("textarea", "field"); t.value = value ?? ""; if (ph) t.placeholder = ph; return t; }
  const lines = t => t.split("\n").map(x => x.trim()).filter(Boolean);

  function openDetail(j, s) {
    const box = sheet(j.title);
    box.appendChild(h("p", null, `${j.company || "Azienda N/D"} · ${j.location || "sede N/D"} · ${FIT_LABEL[s.fit]} (${s.score})`));
    box.appendChild(h("p", "cl-reasons", s.reasons.join(" ")));
    if (j.note) box.appendChild(h("p", "cc-note", j.note));
    if (j.description) box.appendChild(h("p", "cc-desc", j.description));
    const note = area(j.status_note, "La tua nota (candidatura, contatti, motivo dello scarto…)");
    note.classList.add("cc-notefield");
    note.addEventListener("input", () => setNote(j, note.value));
    box.appendChild(note);
    rowButtons(box, [["Chiudi", null, () => { closeSheet(); render(); }]].concat(j.url ? [["Apri annuncio ↗", "primary", () => K.L.openUrl(j.url, "com.android.chrome")]] : []));
  }

  function openDiscard(j) {
    const box = sheet("Scarta annuncio");
    box.appendChild(h("p", null, `${j.title} — non verrà riproposto dalle prossime ricerche.`));
    const why = field(box, "Perché? (facoltativo, ti aiuta a scrivere le regole)", input("", "Es. ruolo commerciale, settore non mio"));
    rowButtons(box, [["Annulla", null, closeSheet], ["Scarta", "primary", () => { setStatus(j, "scartato", why.value.trim()); closeSheet(); }]]);
  }

  function openKeysInfo() {
    const box = sheet("Ricerca automatica non attiva");
    box.appendChild(h("p", null, "La ricerca automatica usa Jooble, con una chiave gratuita che si chiede dal loro sito (it.jooble.org/api/about) e si salva nell'archivio: Supabase → Edge Functions → Secrets, nome JOOBLE_KEY. Adzuna invece è a pagamento e non la usiamo."));
    box.appendChild(h("p", null, "Intanto gli annunci nuovi arrivano chiedendo a Claude dal computer: «aggiorna la ricerca lavoro»."));
    rowButtons(box, [["Ho capito", "primary", closeSheet]]);
  }

  function openUpdateInfo() {
    const box = sheet("Aggiorna ricerca");
    const l = data.last;
    box.appendChild(h("p", null, l ? `Ultima ricerca: ${D.label(D.parse(l.date), { day: "numeric", month: "long", year: "numeric" })}${l.sources ? " (" + l.sources + ")" : ""}, ${l.added} annunci nuovi.` : "Ultima ricerca: quella di partenza, ottobre 2026."));
    box.appendChild(h("p", null, "Per aggiornare chiedi a Claude, dal Mac o dal PC (Claude Code nella cartella lei-launcher):"));
    box.appendChild(h("p", "cc-quote", "«aggiorna la ricerca lavoro»"));
    box.appendChild(h("p", null, "Claude cerca su LinkedIn, Indeed e gli altri portali, legge ogni annuncio, salta quelli che hai scartato e quelli contro le tue regole, e li aggiunge qui con un suo commento. Li trovi in «Nuovi», qui e sull'iPhone."));
    rowButtons(box, [["Ricerca automatica (Jooble)", null, () => { closeSheet(); runSearch(); }], ["Ho capito", "primary", closeSheet]]);
  }

  function openPaste() {
    const box = sheet("Incolla annuncio");
    box.appendChild(h("p", null, "Da LinkedIn, Indeed o da una mail di avviso: incolla il link e il testo. Se lasci vuoti titolo o sede, li cerco nel testo."));
    const url = field(box, "Link", input("", "https://www.linkedin.com/jobs/view/…"));
    const title = field(box, "Titolo", input("", "Es. Packaging designer"));
    const company = field(box, "Azienda", input(""));
    const loc = field(box, "Sede", input("", "Es. Torino, ibrido"));
    const text = field(box, "Testo dell'annuncio", area("", "Requisiti, contratto, compenso…"));
    text.classList.add("cc-paste");
    rowButtons(box, [["Annulla", null, closeSheet], ["Aggiungi", "primary", () => {
      const u = url.value.trim(), body = text.value.trim();
      if (!u && !body && !title.value.trim()) return K.toast("Incolla almeno il link o il testo");
      const first = body.split("\n").map(x => x.trim()).find(Boolean);
      const known = [[/linkedin\./i, "LinkedIn"], [/indeed\./i, "Indeed"], [/jooble\./i, "Jooble"], [/infojobs\./i, "InfoJobs"], [/subito\./i, "Subito"], [/monster\./i, "Monster"], [/glassdoor\./i, "Glassdoor"]];
      const src = u ? ((known.find(k => k[0].test(u)) || [])[1] || (u.match(/^https?:\/\/(?:www\.)?([^/]+)/i) || [])[1] || "Inserito a mano") : "Inserito a mano";
      let hash = 0;
      for (const ch of normalize(body)) hash = (Math.imul(31, hash) + ch.charCodeAt(0)) | 0;
      const r = addJobs([{ id: u ? `link:${u.split("?")[0]}` : `testo:${(hash >>> 0).toString(36)}`, source: src, url: u,
        title: title.value.trim() || first || "Annuncio senza titolo", company: company.value.trim(),
        location: loc.value.trim() || findTerm(normalize(body), data.profile.areas) || "", description: body, salary: "Non indicata", contractHint: "" }]);
      closeSheet();
      tab = "nuovi";
      render();
      K.toast(r.duplicates ? "Questo annuncio c'è già" : r.excluded ? "Aggiunto, ma escluso dal profilo: lo trovi in «Esclusi»" : "Annuncio aggiunto");
    }]]);
  }

  function openProfile() {
    const p = data.profile;
    const box = sheet("Profilo");
    box.appendChild(h("p", null, "Da qui nascono punteggio ed esclusioni. Le ricerche sono quelle di «Aggiorna ricerca»."));
    const queries = field(box, "Ricerche (una per riga)", area(p.searchQueries.join("\n")));
    const city = field(box, "Città", input(p.searchCity));
    const radius = field(box, "Raggio (km)", input(p.searchRadiusKm));
    const age = field(box, "Annunci al massimo di quanti giorni", input(p.maxAgeDays));
    const rules = field(box, "Le tue regole: cosa non vuoi vedere (una per riga, es. «niente stage»)", area(p.rules.join("\n")));
    const mine = field(box, "Software che usi (uno per riga)", area(p.mySoftware.join("\n")));
    const gaps = field(box, "Software che non hai: diventano lacune (uno per riga)", area(p.gapSoftware.join("\n")));
    const areas = field(box, "Zone accettate (una per riga)", area(p.areas.join("\n")));
    rowButtons(box, [["Annulla", null, closeSheet], ["Salva", "primary", () => {
      saveProfile(Object.assign({}, p, {
        searchQueries: lines(queries.value), searchCity: city.value.trim() || "Torino",
        searchRadiusKm: Number(radius.value) || 40, maxAgeDays: Number(age.value) || 30,
        rules: lines(rules.value), mySoftware: lines(mine.value), gapSoftware: lines(gaps.value), areas: lines(areas.value)
      }));
      closeSheet();
    }]]);
  }

  S.register("lavoro", {
    open(el, opts) {
      root = el;
      tab = opts && opts.tab ? opts.tab : "nuovi";
      build(el);
      if (data) render();
      else {
        ui.body.appendChild(h("div", "sec-empty", "Carico gli annunci…"));
        loadAll(true).then(d => { if (!data) { data = d; render(); } }).catch(() => { });
      }
      refresh();
    },
    close() { root = null; closeSheet(); DB.flush(); },
    back() { if (ui.sheet && !ui.sheet.hidden) { closeSheet(); return true; } return false; },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });
  window.LeiCercaLavoro = { scoreJob, evaluate };
})();
