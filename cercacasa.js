// Sezione "Cerca Casa": gli immobili di Torino della ricerca (artifact "Ricerca Casa Torino", app Mole di Case)
// con il punteggio sui criteri, preferiti e scartati, note e "Incolla annuncio". Dati nella tabella `houses`.
// I portali vietano la lettura automatica: le case nuove arrivano incollate qui o quando Fabio chiede a Claude,
// dal computer, di aggiornare la ricerca (skill aggiorna-casa del repository).
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const norm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const euro = n => `€ ${Math.round(n).toLocaleString("it-IT")}`;
  const clamp01 = n => Math.min(1, Math.max(0, n));

  // ---------- Criteri (come Mole di Case: src/criteria/casa.ts) ----------
  const ZONES = ["Cenisia", "San Paolo", "Pozzo Strada", "Santa Rita", "Crocetta", "Cit Turin", "Borgo San Paolo",
    "Mirafiori Nord", "Lingotto", "Nizza Millefonti", "San Salvario", "Centro", "San Donato", "Campidoglio", "Parella",
    "Vanchiglia", "Aurora", "Barriera di Milano", "Madonna di Campagna", "Borgo Po"];
  const TIPOLOGIE = ["Monolocale", "Bilocale", "Trilocale", "Quadrilocale", "5+ locali"];
  // I criteri veri di Fabio stanno nell'archivio privato (settings 'houseCriteria'): la versione per iPhone è pubblica,
  // quindi qui solo valori neutri di riserva.
  const DEFAULT_CRITERIA = {
    maxPrice: 100000000, minMq: 0, minFloor: -1, zones: [], preferredZones: [], tipologie: [],
    excludeWords: ["asta giudiziaria", "all'asta", "tribunale", "procedura esecutiva", "nuda proprieta", "usufrutto", "diritto di superficie", "comodato"],
    importance: { price: 3, pricePerMq: 2, size: 2, elevator: 2, floor: 1, zone: 2, multiPortal: 1 }
  };
  const PPM_WORST = 2600, PPM_BEST = 1400;   // €/m², zone semicentrali di Torino 2026

  function floorLabel(f) {
    if (f === null || f === undefined) return "piano N/D";
    f = Number(f);
    if (f < 0) return "seminterrato";
    if (f === 0) return "piano terra";
    if (f < 1) return "rialzato";
    return `${f}° piano`;
  }
  const floorRange = (a, b) => a === null ? "piano N/D" : (b === null || Number(b) === Number(a) ? floorLabel(a) : `${floorLabel(a)} – ${floorLabel(b)}`);
  const linear = (v, worst, best) => v === null || v === undefined || !isFinite(v) ? null : worst === best ? (v === best ? 1 : 0) : clamp01((v - worst) / (best - worst));
  const num = v => v === null || v === undefined ? null : Number(v);

  // Motore generico (src/scoring/engine.ts): filtri che escludono + preferenze pesate → 0–100 con spiegazione
  function score(l, c) {
    const excluded = [];
    const mq = num(l.mq_max) ?? num(l.mq_min), floor = num(l.floor_max) ?? num(l.floor_min);
    if (l.price_min > c.maxPrice) excluded.push(`Prezzo oltre ${euro(c.maxPrice)}`);
    if (c.zones.length && l.zone && !c.zones.includes(l.zone)) excluded.push(`Zona ${l.zone} non tra quelle scelte`);
    if (mq !== null && mq < c.minMq) excluded.push(`Meno di ${c.minMq} m²`);
    if (floor !== null && floor < c.minFloor) excluded.push(`Sotto il ${c.minFloor}° piano (${floorLabel(floor)})`);
    if (c.tipologie.length && (l.tipologie || []).length && !l.tipologie.some(t => c.tipologie.includes(t))) excluded.push(`Tipologia ${l.tipologie.join("/")} non tra quelle scelte`);
    const words = c.excludeWords.filter(w => w.trim() && norm(`${l.address} ${l.description}`).includes(norm(w.trim())));
    if (words.length) excluded.push(`Contiene "${words.join('", "')}"`);

    const preferred = new Set(c.preferredZones), I = c.importance;
    const portals = new Set((l.links || []).map(x => x.portal));
    const prefs = [
      ["Prezzo", I.price, () => ({ v: linear(l.price_min, c.maxPrice, c.maxPrice * 0.6), d: euro(l.price_min) })],
      ["Prezzo al m²", I.pricePerMq, () => {
        if (!l.mq_min) return { v: null, d: "m² non indicati" };
        const ppm = l.price_min / l.mq_min;
        return { v: linear(ppm, PPM_WORST, PPM_BEST), d: `${euro(ppm)}/m²` };
      }],
      ["Metri quadri", I.size, () => ({ v: linear(num(l.mq_min), c.minMq, c.minMq + 30), d: l.mq_min === null ? "non indicati" : `${l.mq_min} m²` })],
      ["Ascensore", I.elevator, () => {
        if (l.elevator === "si") return { v: 1, d: "presente" };
        if (l.elevator === "no") return { v: floor !== null && floor <= 1 ? 0.7 : floor === 2 ? 0.4 : 0, d: `assente (${floorLabel(floor)})` };
        if (l.elevator === "misto") return { v: 0.5, d: "dati discordanti tra i portali" };
        return { v: null, d: "non indicato" };
      }],
      ["Piano", I.floor, () => {
        const f = num(l.floor_min);
        if (f === null) return { v: null, d: "non indicato" };
        return { v: f >= 3 ? 1 : f >= 2 ? 0.8 : f >= 1 ? 0.5 : 0, d: floorRange(l.floor_min, l.floor_max) };
      }],
      ["Zona preferita", preferred.size ? I.zone : 0, () => !l.zone ? { v: null, d: "zona non indicata" } : preferred.has(l.zone) ? { v: 1, d: `${l.zone} (preferita)` } : { v: 0.3, d: l.zone }],
      ["Su più portali", I.multiPortal, () => ({ v: portals.size >= 2 ? 1 : 0, d: [...portals].join(" + ") || "nessun link" })]
    ].filter(p => p[1] > 0);
    const total = prefs.reduce((s, p) => s + p[1], 0);
    const parts = prefs.map(([label, w, vote]) => {
      const r = vote(), unknown = r.v === null || !isFinite(r.v);
      const max = 100 * w / total;
      return { label, points: (unknown ? 0.5 : clamp01(r.v)) * max, max, detail: r.d, unknown };
    });
    return { score: total ? Math.round(parts.reduce((s, p) => s + p.points, 0)) : 0, excluded, parts };
  }

  // ---------- "Incolla annuncio" (come src/sources/pastedText.ts: si legge solo il testo incollato) ----------
  const PORTALS = [[/immobiliare\.it/i, "immobiliare"], [/idealista\.it/i, "idealista"], [/casa\.it/i, "casa.it"], [/subito\.it/i, "subito"], [/wikicasa\.it/i, "wikicasa"]];
  function portalOf(url) {
    for (const [re, name] of PORTALS) if (re.test(url)) return name;
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "link"; }
  }
  function cleanUrl(url) { try { const u = new URL(url.trim()); u.search = ""; u.hash = ""; return u.toString(); } catch (e) { return url.trim(); } }
  const toNum = t => Number(String(t).replace(/[.\s ]/g, "").replace(",", "."));
  const AMOUNT = "(\\d{1,3}(?:[.\\s\\u00a0]\\d{3})+|\\d{5,7})";
  function parsePasted(text) {
    const m = text.match(/https?:\/\/[^\s<>"']+/i);
    const url = m ? cleanUrl(m[0]) : null;
    const rest = m ? text.replace(m[0], " ") : text, t = norm(rest);
    const pm = rest.match(new RegExp(`€\\s*${AMOUNT}`)) || rest.match(new RegExp(`${AMOUNT}\\s*(?:€|euro\\b)`, "i")) || rest.match(new RegExp(`prezzo[:\\s]+${AMOUNT}`, "i"));
    const price = pm && toNum(pm[1]) >= 10000 ? toNum(pm[1]) : null;
    const mm = rest.match(/(\d{2,3}(?:,\d+)?)\s*(?:m²|m2|mq|metri quadr)/i);
    let tip = null;
    if (/monolocale/.test(t)) tip = "Monolocale"; else if (/bilocale/.test(t)) tip = "Bilocale"; else if (/trilocale/.test(t)) tip = "Trilocale"; else if (/quadrilocale/.test(t)) tip = "Quadrilocale";
    else { const lm = t.match(/(\d)\s*local[ei]/); if (lm) { const n = Number(lm[1]); tip = n <= 1 ? "Monolocale" : n === 2 ? "Bilocale" : n === 3 ? "Trilocale" : n === 4 ? "Quadrilocale" : "5+ locali"; } }
    let floor = null;
    if (/seminterrato/.test(t)) floor = -1; else if (/piano\s+terr[ae]|piano\s+terreno|\bpt\b/.test(t)) floor = 0; else if (/rialzato/.test(t)) floor = 0.5;
    else { const fm = t.match(/(\d{1,2})\s*(?:°|º|o)?\s*piano/) || t.match(/piano[:\s]+(\d{1,2})\b/); if (fm) floor = Number(fm[1]); }
    const elevator = /(senza|no)\s+ascensore|ascensore[:\s]+no\b/.test(t) ? "no" : /ascensore/.test(t) ? "si" : "nd";
    const zone = [...ZONES].sort((a, b) => b.length - a.length).find(z => t.includes(norm(z))) || null;
    const am = rest.match(/\b((?:via|corso|c\.so|piazza|p\.za|largo|strada|viale|vicolo)\s+[A-ZÀ-Ýa-zà-ý'.\s]+?(?:,?\s*\d+[a-zA-Z/]*)?)(?=[,.\n;–-]|\s{2}|$)/i);
    const address = am ? am[1].trim().replace(/^./, c => c.toUpperCase()) : null;
    return { url, portal: url ? portalOf(url) : null, price, mq: mm ? Math.round(toNum(mm[1])) : null, tip, floor, elevator, zone, address, text: rest.trim() };
  }

  // ---------- Dati ----------
  const PATH = "houses?gone_at=is.null&select=id,source,source_key,zone,address,price_min,price_max,mq_min,mq_max,tipologie,floor_min,floor_max,elevator,links,description,status,user_note,added_at&order=price_min";
  const PATH_SET = "settings?key=in.(houseCriteria,houseLastUpdate)&select=key,value";
  let root = null, ui = {}, data = null, tab = "proposte", zoneFilter = "", query = "";

  async function loadAll(cacheOnly) {
    const get = p => (cacheOnly ? DB.peek(p) : DB.load(p));
    const [houses, settings] = await Promise.all([get(PATH), get(PATH_SET)]);
    const set = Object.fromEntries(settings.map(s => [s.key, s.value]));
    let criteria = DEFAULT_CRITERIA;
    try { if (set.houseCriteria) criteria = Object.assign({}, DEFAULT_CRITERIA, JSON.parse(set.houseCriteria)); } catch (e) { }
    criteria.importance = Object.assign({}, DEFAULT_CRITERIA.importance, criteria.importance || {});
    return { houses, criteria, lastUpdate: set.houseLastUpdate || null };
  }
  async function refresh() {
    try { data = await loadAll(false); render(); }
    catch (e) {
      if (e.status === 401) return;
      if (!data) { ui.body.innerHTML = ""; ui.body.appendChild(h("div", "sec-empty", e.status === 404 ? "Le tabelle di Cerca Casa non sono ancora nell'archivio (10_cerca_casa_lavoro.sql)." : "Non riesco a scaricare le case. Controlla il Wi-Fi e riapri la sezione.")); }
    }
  }

  // ---------- Salvataggi ----------
  function setStatus(l, status) {
    l.status = status;
    DB.update("houses", `id=eq.${l.id}`, { status, status_at: new Date().toISOString() });
    render();
  }
  let noteTimer = null;
  function setNote(l, text) {
    l.user_note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => DB.update("houses", `id=eq.${l.id}`, { user_note: text }), 700);
  }
  function saveCriteria(c) {
    data.criteria = c;
    DB.save("settings", { key: "houseCriteria", value: JSON.stringify(c) }, "user_id,key");
    render();
  }

  // ---------- Interfaccia ----------
  const TABS = [["proposte", "Proposte"], ["preferiti", "Preferiti"], ["scartati", "Scartati"], ["esclusi", "Esclusi dai criteri"]];
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-casa", "sec-cerca");
    const head = S.header("Cerca Casa");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    TABS.forEach(([id, label]) => {
      const b = h("button", "pill small", label);
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
    buildBar();
  }

  function buildBar() {
    ui.bar.innerHTML = "";
    const search = h("input", "field cc-search");
    search.placeholder = "Cerca una via…";
    search.value = query;
    search.addEventListener("input", () => { query = search.value; renderList(); });
    const zone = h("select", "field cc-zonesel");
    zone.appendChild(Object.assign(h("option", null, "Tutte le zone"), { value: "" }));
    ui.zoneSel = zone;
    zone.addEventListener("change", () => { zoneFilter = zone.value; renderList(); });
    const paste = h("button", "pill small gold", "+ Incolla annuncio");
    paste.addEventListener("click", openPaste);
    const crit = h("button", "pill small", "Criteri");
    crit.addEventListener("click", openCriteria);
    const upd = h("button", "pill small", "Aggiorna ricerca");
    upd.addEventListener("click", openUpdateInfo);
    const acts = h("div", "cc-actions");
    acts.append(paste, crit, upd);
    ui.bar.append(search, zone, acts);
  }

  function ranked() {
    return data.houses.map(l => ({ l, r: score(l, data.criteria) }))
      .sort((a, b) => b.r.score - a.r.score || a.l.price_min - b.l.price_min);
  }

  function render() {
    if (!data || !root) return;
    ui.tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    const zones = [...new Set(data.houses.map(l => l.zone).filter(Boolean))].sort((a, b) => ZONES.indexOf(a) - ZONES.indexOf(b));
    const cur = ui.zoneSel.value;
    ui.zoneSel.innerHTML = "";
    ui.zoneSel.appendChild(Object.assign(h("option", null, "Tutte le zone"), { value: "" }));
    zones.forEach(z => ui.zoneSel.appendChild(Object.assign(h("option", null, z), { value: z })));
    ui.zoneSel.value = zones.includes(cur) ? cur : "";
    S.syncLabel(ui.sync);
    renderList();
  }

  const isNew = l => D.between(D.parse(l.added_at), D.today()) <= 7 && l.source !== "artifact";

  function renderList() {
    const all = ranked();
    const proposals = all.filter(x => x.l.status === "nuovo" && !x.r.excluded.length);
    const counts = { proposte: proposals.length, preferiti: all.filter(x => x.l.status === "preferito").length, scartati: all.filter(x => x.l.status === "scartato").length, esclusi: all.filter(x => x.l.status === "nuovo" && x.r.excluded.length).length };
    ui.tabs.querySelectorAll("button").forEach(b => (b.textContent = `${TABS.find(t => t[0] === b.dataset.tab)[1]} ${counts[b.dataset.tab]}`));
    const last = data.lastUpdate ? D.label(D.parse(data.lastUpdate), { day: "numeric", month: "long" }) : "mai";
    ui.sub.textContent = `${counts.proposte} ${counts.proposte === 1 ? "proposta" : "proposte"} · ultimo aggiornamento: ${last}`;

    let list = tab === "proposte" ? proposals
      : tab === "esclusi" ? all.filter(x => x.l.status === "nuovo" && x.r.excluded.length)
      : all.filter(x => x.l.status === (tab === "preferiti" ? "preferito" : "scartato"));
    const q = norm(query.trim());
    list = list.filter(x => (!zoneFilter || x.l.zone === zoneFilter) && (!q || norm(`${x.l.address} ${x.l.zone}`).includes(q)));
    ui.body.innerHTML = "";
    if (!list.length) {
      ui.body.appendChild(h("div", "sec-empty", tab === "proposte" ? "Nessuna proposta con questi filtri." : tab === "preferiti" ? "Ancora nessun preferito: tocca ♡ su una casa." : tab === "scartati" ? "Nessuna casa scartata." : "Nessuna casa esclusa dai criteri."));
      return;
    }
    list.forEach(x => ui.body.appendChild(card(x.l, x.r)));
  }

  function badge(r) {
    const b = h("span", "cc-score", String(r.score));
    b.classList.add(r.score >= 70 ? "hi" : r.score >= 50 ? "mid" : "lo");
    return b;
  }

  function card(l, r) {
    const c = h("div", "card cc-card" + (l.status === "preferito" ? " fav" : ""));
    const top = h("div", "cc-top");
    const titles = h("div", "cc-titles");
    titles.append(h("div", "cc-zone", (l.zone || "zona N/D") + (isNew(l) ? " · nuovo" : "")), h("div", "cc-addr", l.address));
    top.append(titles, badge(r));
    const price = l.price_min === l.price_max ? euro(l.price_min) : `${euro(l.price_min)}–${Math.round(l.price_max).toLocaleString("it-IT")}`;
    const facts = h("div", "cc-facts");
    [price, l.mq_min ? `${l.mq_min} m²` : "m² N/D", (l.tipologie || []).join(", ") || "tipologia N/D", floorRange(l.floor_min, l.floor_max),
      l.elevator === "si" ? "ascensore" : l.elevator === "no" ? "senza ascensore" : l.elevator === "misto" ? "ascensore ?" : "ascensore N/D"]
      .forEach((t, i) => facts.appendChild(h("span", i === 0 ? "cc-price" : "cc-fact", t)));
    c.append(top, facts);
    if (r.excluded.length) c.appendChild(h("div", "cc-why-out", r.excluded.join(" · ")));
    if (l.user_note) c.appendChild(h("div", "cc-note", l.user_note));
    const foot = h("div", "cc-foot");
    const links = h("div", "cc-links");
    (l.links || []).forEach(x => {
      const a = h("button", "cc-link", x.portal + " ↗");
      a.addEventListener("click", e => { e.stopPropagation(); K.L.openUrl(x.url, "com.android.chrome"); });
      links.appendChild(a);
    });
    const acts = h("div", "cc-acts");
    const fav = h("button", "cc-act" + (l.status === "preferito" ? " on" : ""), l.status === "preferito" ? "♥" : "♡");
    fav.title = "Preferito";
    fav.addEventListener("click", e => { e.stopPropagation(); setStatus(l, l.status === "preferito" ? "nuovo" : "preferito"); });
    const del = h("button", "cc-act" + (l.status === "scartato" ? " on" : ""), l.status === "scartato" ? "↺" : "✕");
    del.title = l.status === "scartato" ? "Rimetti tra le proposte" : "Scarta";
    del.addEventListener("click", e => { e.stopPropagation(); setStatus(l, l.status === "scartato" ? "nuovo" : "scartato"); });
    acts.append(fav, del);
    foot.append(links, acts);
    c.appendChild(foot);
    c.addEventListener("click", () => openDetail(l, r));
    return c;
  }

  // ---------- Pannelli ----------
  function closeSheet() { if (!ui.sheet) return; ui.sheet.hidden = true; ui.sheet.innerHTML = ""; }
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

  function openDetail(l, r) {
    const box = sheet(l.address);
    box.appendChild(h("p", null, `${l.zone || "Zona N/D"} · punteggio ${r.score} su 100`));
    const bars = h("div", "cc-parts");
    r.parts.forEach(p => {
      const row = h("div", "cc-part");
      const bar = h("div", "wk-bar"), fill = h("span");
      fill.style.width = `${Math.round(p.points / p.max * 100)}%`;
      bar.appendChild(fill);
      row.append(h("span", "cc-part-l", p.label), bar, h("span", "cc-part-d", (p.unknown ? "? " : "") + (p.detail || "")));
      bars.appendChild(row);
    });
    box.appendChild(bars);
    if (r.excluded.length) box.appendChild(h("p", "cc-why-out", "Escluso dai criteri: " + r.excluded.join(" · ")));
    if (l.description) box.appendChild(h("p", "cc-desc", l.description));
    const note = h("textarea", "field cc-notefield");
    note.placeholder = "La tua nota (visita, telefonata, impressioni…)";
    note.value = l.user_note || "";
    note.addEventListener("input", () => setNote(l, note.value));
    box.appendChild(note);
    rowButtons(box, [["Chiudi", null, () => { closeSheet(); render(); }]]);
  }

  function openUpdateInfo() {
    const box = sheet("Aggiorna ricerca");
    const last = data.lastUpdate ? D.label(D.parse(data.lastUpdate), { day: "numeric", month: "long", year: "numeric" }) : "mai";
    box.appendChild(h("p", null, `Ultimo aggiornamento: ${last}.`));
    box.appendChild(h("p", null, "Immobiliare, Idealista e Casa.it non permettono a un'app di leggere i loro annunci da sola. Per aggiornare la ricerca chiedi a Claude, dal Mac o dal PC (Claude Code nella cartella lei-launcher):"));
    box.appendChild(h("p", "cc-quote", "«aggiorna la ricerca casa»"));
    box.appendChild(h("p", null, "Claude rifà la ricerca con i tuoi criteri, salta le case che hai scartato qui, toglie quelle non più online e aggiunge le nuove (segnate «nuovo»). Le vedi qui e sull'iPhone appena finisce."));
    rowButtons(box, [["Ho capito", "primary", closeSheet]]);
  }

  function field(box, label, input) {
    const w = h("label", "cc-field");
    w.append(h("span", null, label), input);
    box.appendChild(w);
    return input;
  }
  function input(type, value, ph) { const i = h("input", "field"); i.type = type; i.value = value ?? ""; if (ph) i.placeholder = ph; return i; }
  function select(options, value) {
    const s = h("select", "field");
    options.forEach(([v, label]) => s.appendChild(Object.assign(h("option", null, label), { value: v })));
    s.value = value ?? "";
    return s;
  }

  function openPaste() {
    const box = sheet("Incolla annuncio");
    box.appendChild(h("p", null, "Incolla il link e, se vuoi, il testo dell'annuncio (anche da una mail di avviso del portale): riconosco prezzo, m², piano, zona e indirizzo."));
    const ta = h("textarea", "field cc-paste");
    ta.placeholder = "https://www.immobiliare.it/annunci/…\nBilocale in via …, 2° piano con ascensore, 55 m², € 115.000";
    box.appendChild(ta);
    rowButtons(box, [["Annulla", null, closeSheet], ["Riconosci", "primary", () => {
      if (!ta.value.trim()) return K.toast("Incolla prima il link o il testo");
      openPasteForm(parsePasted(ta.value));
    }]]);
    setTimeout(() => ta.focus(), 50);
  }

  function openPasteForm(p) {
    const box = sheet("Controlla e aggiungi");
    const addr = field(box, "Indirizzo", input("text", p.address || "", "Via …"));
    const zone = field(box, "Zona", select([["", "Non so"]].concat(ZONES.map(z => [z, z])), p.zone || ""));
    const price = field(box, "Prezzo (€)", input("number", p.price || ""));
    const mq = field(box, "m²", input("number", p.mq || ""));
    const tip = field(box, "Tipologia", select([["", "Non so"]].concat(TIPOLOGIE.map(t => [t, t])), p.tip || ""));
    const floor = field(box, "Piano (0 = terra, 0.5 = rialzato)", input("number", p.floor ?? ""));
    const elev = field(box, "Ascensore", select([["nd", "Non indicato"], ["si", "Sì"], ["no", "No"]], p.elevator));
    const link = field(box, "Link", input("url", p.url || ""));
    rowButtons(box, [["Annulla", null, closeSheet], ["Aggiungi", "primary", () => {
      const priceN = Number(price.value), url = link.value.trim() ? cleanUrl(link.value) : "";
      if (!addr.value.trim()) return K.toast("Scrivi l'indirizzo");
      if (!(priceN >= 10000)) return K.toast("Scrivi il prezzo");
      if (url && data.houses.some(x => (x.links || []).some(k => cleanUrl(k.url) === url))) return K.toast("Questa casa c'è già");
      const f = floor.value === "" ? null : Number(floor.value), m = mq.value === "" ? null : Math.round(Number(mq.value));
      const row = {
        source_key: url ? `link:${url}` : `incolla:${Date.now()}`, source: "incolla",
        zone: zone.value || null, address: addr.value.trim(), price_min: Math.round(priceN), price_max: Math.round(priceN),
        mq_min: m, mq_max: m, tipologie: tip.value ? [tip.value] : [], floor_min: f, floor_max: f, elevator: elev.value,
        links: url ? [{ portal: portalOf(url), url }] : [], description: p.text || "", added_at: D.iso(D.today())
      };
      data.houses.push(Object.assign({ id: null, status: "nuovo", user_note: "" }, row));
      DB.insert("houses", row).then(refresh);
      closeSheet();
      tab = "proposte";
      render();
      K.toast("Casa aggiunta");
    }]]);
  }

  function chips(box, label, all, selected) {
    box.appendChild(h("div", "cc-chips-l", label));
    const wrap = h("div", "cc-chips");
    const set = new Set(selected);
    all.forEach(v => {
      const b = h("button", "pill small" + (set.has(v) ? " on" : ""), v);
      b.addEventListener("click", () => { set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle("on"); });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
    return () => all.filter(v => set.has(v));
  }

  function openCriteria() {
    const c = data.criteria;
    const box = sheet("Criteri");
    box.appendChild(h("p", null, "Le case che non li rispettano finiscono in «Esclusi dai criteri». Valgono anche per il prossimo aggiornamento con Claude."));
    const maxPrice = field(box, "Prezzo massimo (€)", input("number", c.maxPrice));
    const minMq = field(box, "Metri quadri minimi", input("number", c.minMq));
    const minFloor = field(box, "Piano minimo (1 = esclude terra e rialzato)", input("number", c.minFloor));
    const getZones = chips(box, "Zone ammesse", ZONES, c.zones);
    const getPref = chips(box, "Zone preferite (punti in più)", ZONES, c.preferredZones);
    const getTip = chips(box, "Tipologie", TIPOLOGIE, c.tipologie);
    const words = field(box, "Parole che escludono (una per riga)", h("textarea", "field"));
    words.value = c.excludeWords.join("\n");
    box.appendChild(h("div", "cc-chips-l", "Quanto conta (0 = niente, 3 = molto)"));
    const IMP = [["price", "Prezzo"], ["pricePerMq", "Prezzo al m²"], ["size", "Metri quadri"], ["elevator", "Ascensore"], ["floor", "Piano"], ["zone", "Zona preferita"], ["multiPortal", "Su più portali"]];
    const imp = {};
    IMP.forEach(([k, label]) => (imp[k] = field(box, label, select([["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]], String(c.importance[k])))));
    rowButtons(box, [["Annulla", null, closeSheet], ["Salva", "primary", () => {
      const importance = {};
      IMP.forEach(([k]) => (importance[k] = Number(imp[k].value)));
      saveCriteria({
        maxPrice: Number(maxPrice.value) || c.maxPrice, minMq: Number(minMq.value) || 0, minFloor: Number(minFloor.value) || 0,
        zones: getZones(), preferredZones: getPref(), tipologie: getTip(),
        excludeWords: words.value.split("\n").map(w => w.trim()).filter(Boolean), importance
      });
      closeSheet();
    }]]);
  }

  S.register("casa", {
    open(el, opts) {
      root = el;
      tab = opts && opts.tab ? opts.tab : "proposte";
      build(el);
      if (data) render();
      else {
        ui.body.appendChild(h("div", "sec-empty", "Carico le case…"));
        loadAll(true).then(d => { if (!data) { data = d; render(); } }).catch(() => { });
      }
      refresh();
    },
    close() { root = null; closeSheet(); DB.flush(); },
    back() { if (ui.sheet && !ui.sheet.hidden) { closeSheet(); return true; } return false; },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });
  window.LeiCercaCasa = { score, parsePasted, DEFAULT_CRITERIA };
})();
