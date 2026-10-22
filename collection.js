// COLLECTION: libri, fumetti, dischi, film e giochi da tavolo di casa.
// Schede in basso per stato (In corso, Collezione, Desiderati, In arrivo, Prestati), griglia di copertine,
// ricerca in alto, pulsante tondo + per scansionare il codice a barre (anche a raffica).
// I dati stanno nell'archivio online (tabella collection_items, vedi supabase/07_collezione.sql).
(function () {
  const S = window.LeiSections, DB = window.LeiDB, K = window.LeiCore, D = S.D;
  const L = K.L;

  const KINDS = [["libro", "Libri", "book"], ["fumetto", "Fumetti", "comic"], ["disco", "Dischi", "disc"], ["film", "Film", "film"], ["gioco", "Giochi", "dice"]];
  const KIND_ONE = { libro: "Libro", fumetto: "Fumetto", disco: "Disco", film: "Film", gioco: "Gioco" };
  const STATUSES = [["in_corso", "In corso", "play"], ["collezione", "Collezione", "shelf"], ["desiderati", "Desiderati", "heart"], ["in_arrivo", "In arrivo", "truck"], ["prestati", "Prestati", "hand"]];
  const STATUS_ONE = { in_corso: "In corso", collezione: "In collezione", desiderati: "Desiderato", in_arrivo: "In arrivo", prestati: "Prestato" };
  const CREATOR = { libro: "Autore", fumetto: "Autore", disco: "Artista", film: "Regia", gioco: "Autore" };
  const PUBLISHER = { libro: "Editore", fumetto: "Editore", disco: "Etichetta", film: "Produzione", gioco: "Editore" };
  const COLS = ["client_id", "kind", "status", "title", "creator", "publisher", "year", "pages", "format", "barcode", "cover_url", "cover_path",
    "description", "rating", "note", "location", "lent_to", "arriving_on", "finished_on", "deleted_at"];
  const SEL = "collection_items?deleted_at=is.null&select=" + COLS.filter(c => c !== "deleted_at").join(",") + ",created_at&order=created_at.desc";
  const LOCAL = "lei.col.items";

  const ICONS = {
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M19 19v2H6"/>',
    comic: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h9M12 4v16M15 9h3M15 15h3"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    book3d: '<path d="M7.5 3h11v16.5h-11z"/><path d="M7.5 3L5.5 4.5V21h11l2-1.5"/><path d="M6.5 20.2h10.5"/><path d="M10 7.5h6M10 9.5h4"/>',
    disc3d: '<ellipse cx="12" cy="11.5" rx="9" ry="7.6"/><path d="M3 11.5v.9a9 7.6 0 0 0 18 0v-.9"/><ellipse cx="12" cy="11.5" rx="2.3" ry="1.9"/><path d="M15.6 6.4a6 5 0 0 1 2.6 3"/>',
    dice3d: '<path d="M5 8.5h10.5V19H5z"/><path d="M5 8.5L8 6h10.5l-3 2.5M15.5 19l3-2.5V6"/><circle cx="7.6" cy="11" r=".5"/><circle cx="10.25" cy="13.75" r=".5"/><circle cx="12.9" cy="16.5" r=".5"/><ellipse cx="11.75" cy="7.25" rx=".7" ry=".35"/><ellipse cx="16.6" cy="10.4" rx=".3" ry=".5"/><ellipse cx="17.4" cy="14.2" rx=".3" ry=".5"/>',
    vinyl3d: '<ellipse cx="12" cy="11.5" rx="9.5" ry="8"/><path d="M2.5 11.5v.9a9.5 8 0 0 0 19 0v-.9"/><ellipse cx="12" cy="11.5" rx="7.2" ry="6"/><ellipse cx="12" cy="11.5" rx="5.2" ry="4.4"/><ellipse cx="12" cy="11.5" rx="2.6" ry="2.2"/><circle cx="12" cy="11.5" r=".4"/>',
    play: '<path d="M4 6h10M4 12h10M4 18h6"/><path d="M16 14l5 3-5 3z"/>',
    shelf: '<path d="M3 20h18M5 20V6M9 20V4M13 20V8M17.5 20l-2.5-11 3-1 3 11"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.3 13a1.5 1.5 0 0 1 2.5-1.6L7 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    share: '<circle cx="6" cy="12" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M8 11l7-4M8 13l7 4"/>',
    burst: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 8v8M11 8v8M13 8v8M16 8v8"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg>`;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const newId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });

  // ---------- Dati (copia sul tablet + archivio online) ----------
  let items = loadLocal();          // [{client_id, …, _dirty}]
  let missingTable = false;
  const photos = {};               // cover_path → indirizzo temporaneo

  function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch (e) { return []; } }
  function saveLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(items)); } catch (e) { } }
  const visible = () => items.filter(i => !i.deleted_at);

  function rowOf(it) {
    const r = {};
    COLS.forEach(c => { if (it[c] !== undefined) r[c] = it[c] === "" && ["year", "pages", "rating", "arriving_on", "finished_on"].includes(c) ? null : it[c]; });
    return r;
  }

  function persist(it) {
    it._dirty = true;
    if (!items.includes(it)) items.unshift(it);
    saveLocal();
    DB.save("collection_items", rowOf(it), "client_id").then(afterFlush);
  }
  function afterFlush() {
    if (DB.pending === 0 && items.some(i => i._dirty)) { items.forEach(i => delete i._dirty); saveLocal(); }
  }

  async function refresh() {
    try {
      await DB.flush();
      afterFlush();
      const rows = await DB.load(SEL);
      missingTable = false;
      const dirty = items.filter(i => i._dirty);
      const byId = new Map(rows.map(r => [r.client_id, r]));
      dirty.forEach(d => byId.set(d.client_id, d));          // le modifiche non ancora inviate vincono
      items = [...byId.values()].filter(i => !(i.deleted_at && !i._dirty));
      items.sort((a, b) => String(b.created_at || "9").localeCompare(String(a.created_at || "9")));
      saveLocal();
    } catch (e) {
      if (e.status === 401) return;
      console.warn("Collection: errore archivio", e.status, e.message);
      // Tabella non ancora creata: PostgREST risponde 404 (PGRST205)
      if (e.status === 404 || /could not find the table/i.test(e.message || "")) missingTable = true;
    }
    render();
    loadPhotos();
  }

  async function loadPhotos() {
    const missing = visible().map(i => i.cover_path).filter(p => p && !photos[p]);
    if (!missing.length) return;
    try { Object.assign(photos, await DB.signPhotos(missing)); render(); } catch (e) { }
  }

  // ---------- Cataloghi online (libri, dischi, prodotti) ----------
  const waiting = {};
  let seq = 0;
  window.LeiHttp = {
    done(id, status, body) { const f = waiting[id]; if (f) { delete waiting[id]; f({ status, body }); } }
  };
  function http(url) {
    return new Promise(res => {
      if (!L.httpGet) {   // anteprima nel browser del PC
        fetch(url).then(r => r.text().then(t => res({ status: r.status, body: t }))).catch(() => res({ status: 0, body: "" }));
        return;
      }
      const id = "h" + (++seq);
      waiting[id] = res;
      L.httpGet(url, id);
      setTimeout(() => window.LeiHttp.done(id, 0, ""), 20000);
    });
  }
  let quotaHit = false;   // Google Books ha risposto "limite giornaliero raggiunto" (429)
  async function getJSON(url) {
    const r = await http(url);
    if (r.status === 429 && /googleapis/.test(url)) quotaHit = true;
    if (r.status < 200 || r.status >= 300) return null;
    try { return JSON.parse(r.body); } catch (e) { return null; }
  }
  // Chiave Google Books personale e gratuita (config.js → collection.googleBooksKey): quota solo tua
  const gbKey = () => { const k = ((window.LEI_CONFIG || {}).collection || {}).googleBooksKey; return k ? "&key=" + encodeURIComponent(k) : ""; };
  const notFoundMsg = () => quotaHit
    ? "Il catalogo Google ha raggiunto il limite di oggi: completa tu i dati o riprova più tardi"
    : "Non l'ho trovato online: completa tu i dati";
  const stripHtml =s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const yearOf = s => { const m = String(s || "").match(/\d{4}/); return m ? Number(m[0]) : null; };

  function isIsbn(code) {
    return /^97[89]\d{10}$/.test(code) || /^\d{9}[\dX]$/i.test(code);
  }

  // Catalogo SBN delle biblioteche italiane (gratuito, senza chiave): "La volta giusta / Lorenza Gentile",
  // "Gentile, Lorenza", "Milano : Feltrinelli, 2026". Sull'iPhone passa dalla funzione "libri" (niente CORS).
  const SBN = isbn => `https://opac.sbn.it/opacmobilegw/search.json?isbn=${isbn}`;
  function sbnRecord(j, isbn) {
    const list = (j && j.briefRecords) || [];
    const r = list.find(x => String(x.isbn || "").replace(/[^0-9X]/gi, "") === isbn) || list[0];
    if (!r || !r.titolo) return null;
    const name = String(r.autorePrincipale || "").replace(/<[^>]*>/g, "").trim();
    const parts = name.split(/,\s*/);
    const pub = String(r.pubblicazione || "");
    return {
      title: r.titolo.split(" / ")[0].replace(/\s+:\s+/g, ": ").trim(),
      creator: parts.length === 2 ? `${parts[1]} ${parts[0]}` : name,
      publisher: (pub.split(" : ")[1] || "").replace(/,?\s*\[?\d{4}.*$/, "").trim(),
      year: yearOf(pub)
    };
  }

  async function lookupBook(isbn) {
    const [gb, ol, srv, sbnDirect] = await Promise.all([
      getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${gbKey()}`),
      getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
      DB.signedIn ? DB.fn("libri", "isbn=" + isbn) : null,   // SBN (+ Google con la chiave personale, se c'è)
      L.httpGet ? getJSON(SBN(isbn)) : null                  // sul tablet SBN si interroga anche da qui
    ]);
    const first = j => j && j.items && j.items[0] && j.items[0].volumeInfo;
    const v = first(gb) || first(srv && srv.google);
    const o = ol && ol["ISBN:" + isbn];
    const s = sbnRecord(srv && srv.sbn, isbn) || sbnRecord(sbnDirect, isbn);
    if (!v && !o && !s) return null;
    const gbCover = v && v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return {
      title: (v && (v.title + (v.subtitle ? ": " + v.subtitle : ""))) || (s && s.title) || (o && o.title) || "",
      creator: (v && v.authors && v.authors.join(", ")) || (s && s.creator) || (o && o.authors && o.authors.map(a => a.name).join(", ")) || "",
      publisher: (v && v.publisher) || (s && s.publisher) || (o && o.publishers && o.publishers[0] && o.publishers[0].name) || "",
      year: yearOf(v && v.publishedDate) || (s && s.year) || yearOf(o && o.publish_date),
      pages: (v && v.pageCount) || (o && o.number_of_pages) || null,
      description: stripHtml(v && v.description),
      cover_url: (o && o.cover && (o.cover.large || o.cover.medium)) ||
        (gbCover ? gbCover.replace("http:", "https:").replace("&edge=curl", "") : null)
    };
  }

  // want: titolo letto dalla copertina. Se c'è, chiede più risultati e tiene quello col titolo più simile (non il primo)
  async function searchBookByTitle(q, want) {
    const n = want ? 8 : 1;
    const gb = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${n}&langRestrict=it${gbKey()}`)
      || await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${n}${gbKey()}`);
    const list = (gb && gb.items) || [];
    const it = want ? bestBy(list, x => rankSim(want, x.volumeInfo.title + " " + (x.volumeInfo.subtitle || ""))) : list[0];
    if (!it) return searchOpenLibrary(q, want);
    const v = it.volumeInfo, ids = v.industryIdentifiers || [];
    const isbn = (ids.find(x => x.type === "ISBN_13") || ids.find(x => x.type === "ISBN_10") || {}).identifier;
    const cover = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return {
      title: v.title + (v.subtitle ? ": " + v.subtitle : ""), creator: (v.authors || []).join(", "), publisher: v.publisher || "",
      year: yearOf(v.publishedDate), pages: v.pageCount || null, description: stripHtml(v.description),
      cover_url: cover ? cover.replace("http:", "https:").replace("&edge=curl", "") : null, barcode: isbn || undefined
    };
  }

  // Ripiego gratuito e senza chiave quando Google Books non trova o ha finito la quota.
  // Cerca tutte le parole insieme: col testo pulito trova, col rumore no. Niente ISBN: sarebbe di un'edizione a caso.
  async function searchOpenLibrary(q, want) {
    const ol = await getJSON(`https://openlibrary.org/search.json?limit=${want ? 5 : 1}&fields=title,subtitle,author_name,first_publish_year,cover_i,publisher,number_of_pages_median&q=${encodeURIComponent(q)}`);
    const docs = (ol && ol.docs) || [];
    const d = want ? bestBy(docs, x => rankSim(want, x.title + " " + (x.subtitle || ""))) : docs[0];
    if (!d) return null;
    return {
      title: d.title + (d.subtitle ? ": " + d.subtitle : ""), creator: (d.author_name || []).join(", "), publisher: (d.publisher || [])[0] || "",
      year: d.first_publish_year || null, pages: d.number_of_pages_median || null,
      cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null
    };
  }

  function mbToItem(r) {
    const artist = (r["artist-credit"] || []).map(a => (a.name || "") + (a.joinphrase || "")).join("");
    const fmt = ((r.media || [])[0] || {}).format || "";
    return {
      kind: "disco", title: r.title || "", creator: artist, year: yearOf(r.date),
      publisher: (((r["label-info"] || [])[0] || {}).label || {}).name || "",
      format: /vinyl/i.test(fmt) ? "Vinile" : /cd/i.test(fmt) ? "CD" : /cassette/i.test(fmt) ? "Musicassetta" : fmt,
      cover_url: `https://coverartarchive.org/release/${r.id}/front-500`
    };
  }
  async function lookupDisc(code) {
    // Lo stesso disco può essere registrato come UPC (12 cifre) o EAN (13, con uno 0 davanti)
    const variants = [code];
    if (code.length === 13 && code[0] === "0") variants.push(code.slice(1));
    if (code.length === 12) variants.push("0" + code);
    for (const v of variants) {
      const mb = await getJSON(`https://musicbrainz.org/ws/2/release/?query=barcode:${v}&fmt=json&limit=1`);
      const r = mb && mb.releases && mb.releases[0];
      if (r) return mbToItem(r);
    }
    return null;
  }
  async function searchDiscByTitle(q, want) {
    const mb = await getJSON(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&fmt=json&limit=${want ? 5 : 1}`);
    const rs = (mb && mb.releases) || [];
    const r = want ? bestBy(rs, x => rankSim(want, x.title)) : rs[0];
    return r ? mbToItem(r) : null;
  }

  async function lookupProduct(code) {
    const u = await getJSON(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
    const p = u && u.items && u.items[0];
    if (!p) return null;
    const cat = String(p.category || "") + " " + String(p.title || "");
    const kind = /blu-?ray|dvd|movie|film/i.test(cat) ? "film" : /board game|game/i.test(cat) ? "gioco"
      : /music|vinyl|\bcd\b/i.test(cat) ? "disco" : /book/i.test(cat) ? "libro" : null;
    return {
      kind, title: p.title || "", publisher: p.brand || "",
      format: /blu-?ray/i.test(cat) ? "Blu-ray" : /dvd/i.test(cat) ? "DVD" : "",
      cover_url: (p.images || [])[0] || null
    };
  }

  // Cerca i dati del codice. kind: tipo scelto nello scanner, oppure null (automatico)
  async function lookup(code, kind) {
    quotaHit = false;
    if (isIsbn(code) && (!kind || kind === "libro" || kind === "fumetto")) {
      const b = await lookupBook(code);
      return b ? Object.assign(b, { kind: kind || "libro" }) : null;
    }
    if (kind === "disco" || !kind) {
      const d = await lookupDisc(code);
      if (d) return d;
    }
    const p = await lookupProduct(code);
    if (p) { p.kind = kind || p.kind || "film"; return p; }
    return null;
  }

  function findByCode(code) {
    const clean = s => String(s).replace(/[^0-9X]/gi, "").replace(/^0+/, "");   // UPC ed EAN dello stesso oggetto
    const c = clean(code);
    return visible().find(i => i.barcode && clean(i.barcode) === c);
  }

  // ---------- Interfaccia ----------
  let root = null, ui = {}, status = "collezione", kind = null, query = "";

  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-col");
    const head = S.header("Collection");
    ui.sync = head.querySelector(".sec-sync");
    head.querySelector(".sec-sub").remove();
    const search = h("label", "col-search");
    search.innerHTML = svg("search");
    ui.search = h("input");
    ui.search.type = "search";
    ui.search.placeholder = "Cerca titolo, autore o codice…";
    ui.search.value = query;
    ui.search.addEventListener("input", () => { query = ui.search.value; renderGrid(); });
    search.appendChild(ui.search);
    head.insertBefore(search, ui.sync);

    ui.kinds = h("div", "col-kinds");
    ui.body = h("div", "col-body");
    ui.tabs = h("nav", "col-tabs");
    STATUSES.forEach(([id, label, icon]) => {
      const b = h("button", "col-tab");
      b.dataset.status = id;
      b.innerHTML = `${svg(icon)}<span class="col-tab-l"></span><span class="col-tab-n"></span>`;
      b.querySelector(".col-tab-l").textContent = label;
      b.addEventListener("click", () => { status = id; query = ""; ui.search.value = ""; render(); ui.body.scrollTop = 0; });
      ui.tabs.appendChild(b);
    });
    ui.fab = h("button", "col-fab");
    ui.fab.setAttribute("aria-label", "Aggiungi con il codice a barre");
    ui.fab.innerHTML = svg("plus");
    ui.fab.addEventListener("click", () => openScanner({ mode: "add" }));

    ui.sheet = h("div", "sheet col-sheet");
    ui.sheet.hidden = true;
    ui.sheet.addEventListener("click", e => { if (e.target === ui.sheet) closeSheet(); });
    ui.scan = h("div", "col-scan");
    ui.scan.hidden = true;
    el.append(head, ui.kinds, ui.body, ui.tabs, ui.fab, ui.sheet, ui.scan);
  }

  function render() {
    if (!root) return;
    S.syncLabel(ui.sync);
    // Tipi
    ui.kinds.innerHTML = "";
    const chip = (label, on, fn) => { const b = h("button", "pill small" + (on ? " on" : ""), label); b.addEventListener("click", fn); ui.kinds.appendChild(b); };
    chip("Tutto", !kind, () => { kind = null; render(); });
    KINDS.forEach(([id, label]) => chip(label, kind === id, () => { kind = kind === id ? null : id; render(); }));
    // Schede con il conteggio
    const all = visible().filter(i => !kind || i.kind === kind);
    ui.tabs.querySelectorAll(".col-tab").forEach(b => {
      const n = all.filter(i => i.status === b.dataset.status).length;
      b.querySelector(".col-tab-n").textContent = n || "";
      b.classList.toggle("on", !query.trim() && b.dataset.status === status);
    });
    renderGrid();
  }

  function cover(it, cls) {
    const box = h("div", "col-cover " + (cls || "") + " k-" + it.kind);
    const url = (it.cover_path && photos[it.cover_path]) || it._preview || it.cover_url;
    const fallback = () => {
      box.innerHTML = "";
      box.classList.add("empty");
      const ic = h("div", "col-cover-ic"); ic.innerHTML = svg((KINDS.find(k => k[0] === it.kind) || KINDS[0])[2]);
      box.append(ic, h("div", "col-cover-t", it.title || "Senza titolo"));
    };
    if (url) {
      const img = h("img");
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("load", () => { if (img.naturalWidth < 5) fallback(); });   // Open Library: immagine vuota se manca
      img.addEventListener("error", fallback);
      img.src = url;
      box.appendChild(img);
    } else fallback();
    return box;
  }

  function renderGrid() {
    if (!root) return;
    ui.body.innerHTML = "";
    if (missingTable) {
      const m = h("div", "sec-empty");
      m.innerHTML = "Manca ancora la tabella nell'archivio online.<br>Apri Supabase → SQL Editor ed esegui una volta il file <b>supabase/07_collezione.sql</b>.";
      ui.body.appendChild(m);
      return;
    }
    const q = norm(query.trim());
    const digits = query.replace(/[^0-9X]/gi, "");
    let list = visible().filter(i => !kind || i.kind === kind);
    if (q) {
      list = list.filter(i => norm(i.title + " " + i.creator + " " + i.publisher).includes(q) || (digits.length >= 4 && (i.barcode || "").includes(digits)));
      ui.tabs.querySelectorAll(".col-tab").forEach(b => b.classList.remove("on"));
      const info = h("div", "col-found", list.length ? `${list.length} in tutta la collection` : "Non ce l'hai");
      ui.body.appendChild(info);
      if (!list.length) {
        const add = h("button", "pill primary", digits.length >= 8 ? "Cerca il codice online e aggiungi" : "Aggiungi a mano");
        add.addEventListener("click", () => digits.length >= 8 ? handleCode(digits, { mode: "add" }) : openSheet(blank({ title: query.trim() })));
        info.appendChild(add);
        return;
      }
    } else {
      list = list.filter(i => i.status === status);
      if (!list.length) {
        const empty = {
          in_corso: "Niente in corso. Apri un libro e segna \"In corso\".",
          collezione: "La collezione è vuota: tocca + e inquadra il codice a barre.",
          desiderati: "Nessun desiderio, per ora.",
          in_arrivo: "Niente in arrivo.",
          prestati: "Non hai prestato niente."
        }[status];
        ui.body.appendChild(h("div", "sec-empty", empty));
        return;
      }
    }
    const grid = h("div", "col-grid");
    list.forEach(it => {
      const t = h("button", "col-tile");
      t.appendChild(cover(it));
      if (q) t.appendChild(h("span", "col-badge s-" + it.status, STATUS_ONE[it.status]));
      if (it.rating) t.appendChild(h("span", "col-stars", "★".repeat(it.rating)));
      t.appendChild(h("div", "col-tile-t", it.title || "Senza titolo"));
      t.appendChild(h("div", "col-tile-c", it.status === "prestati" && it.lent_to ? "a " + it.lent_to : it.creator || KIND_ONE[it.kind]));
      t.addEventListener("click", () => openSheet(it));
      grid.appendChild(t);
    });
    ui.body.appendChild(grid);
  }

  // ---------- Scheda dell'oggetto ----------
  function blank(extra) {
    return Object.assign({
      client_id: newId(), kind: kind || "libro", status: status === "in_corso" ? "collezione" : status, title: "", creator: "", publisher: "",
      year: null, pages: null, format: "", barcode: null, cover_url: null, cover_path: null, description: "", rating: null,
      note: "", location: "", lent_to: "", arriving_on: null, finished_on: null, _new: true
    }, extra || {});
  }

  let sheetItem = null;
  function closeSheet() { if (!ui.sheet) return; ui.sheet.hidden = true; ui.sheet.innerHTML = ""; sheetItem = null; }

  function openSheet(src, message) {
    const it = Object.assign({}, src);     // si lavora su una copia: si salva solo con "Salva"
    sheetItem = { it, src };
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box col-box");
    const left = h("div", "col-box-left");
    const right = h("div", "col-box-right");
    box.append(left, right);

    // Copertina e azioni sotto
    const coverWrap = h("div", "col-box-cover");
    const redrawCover = () => { coverWrap.innerHTML = ""; coverWrap.appendChild(cover(it, "big")); };
    redrawCover();
    const shot = h("button", "pill small", "Fotografa copertina");
    shot.addEventListener("click", () => openScanner({ mode: "photo", onPhoto: (blob, url) => { it._blob = blob; it._preview = url; redrawCover(); } }));
    left.append(coverWrap, shot);
    if (it.barcode) left.appendChild(h("div", "col-code", (isIsbn(it.barcode) ? "ISBN " : "Codice ") + it.barcode));

    if (message) right.appendChild(h("div", "col-msg", message));

    // Tipo e stato
    const pills = (opts, get, set) => {
      const row = h("div", "col-pills");
      opts.forEach(([id, label]) => {
        const b = h("button", "pill small" + (get() === id ? " on" : ""), label);
        b.addEventListener("click", () => { set(id); row.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); refreshFields(); });
        row.appendChild(b);
      });
      return row;
    };
    right.appendChild(pills(KINDS.map(k => [k[0], KIND_ONE[k[0]]]), () => it.kind, v => (it.kind = v)));
    right.appendChild(pills(STATUSES, () => it.status, v => (it.status = v)));

    // Campi
    const field = (key, ph, type) => {
      const f = h("input", "field");
      f.type = type || "text";
      f.placeholder = ph;
      f.value = it[key] === null || it[key] === undefined ? "" : it[key];
      f.addEventListener("input", () => { it[key] = type === "number" ? (f.value === "" ? null : Number(f.value)) : f.value; });
      return f;
    };
    const titleRow = h("div", "col-row");
    const title = field("title", "Titolo");
    titleRow.appendChild(title);
    const find = h("button", "pill small", "Cerca online");
    find.addEventListener("click", async () => {
      const byIsbn = it.kind !== "disco" && isIsbn(String(it.barcode || ""));
      if (!it.title.trim() && !byIsbn) { K.toast("Scrivi prima il titolo"); return; }
      find.textContent = "Cerco…"; find.disabled = true;
      // Libro con il codice: prima per ISBN (SBN e Google con la chiave personale), poi per titolo
      const found = it.kind === "disco" ? await searchDiscByTitle(it.title)
        : (byIsbn && await lookupBook(it.barcode)) || (it.title.trim() ? await searchBookByTitle(it.title) : null);
      find.textContent = "Cerca online"; find.disabled = false;
      if (!found) { K.toast("Non ho trovato niente online"); return; }
      Object.keys(found).forEach(k => { if (found[k] !== undefined && found[k] !== null && found[k] !== "" && k !== "kind") it[k] = found[k]; });
      reopenWith(it);   // ridisegna la scheda con i dati trovati
    });
    titleRow.appendChild(find);
    right.appendChild(titleRow);

    // Testo letto dalla copertina: si può correggere (togliere le righe inutili) e ricercare
    if (it._ocr !== undefined) {
      const d = h("details", "col-desc col-ocr-text");
      if (!it.title) d.open = true;
      d.appendChild(h("summary", "", "Testo letto dalla copertina"));
      const ta = h("textarea", "field col-note");
      ta.value = it._ocr;
      ta.placeholder = "Nessun testo letto";
      ta.addEventListener("input", () => (it._ocr = ta.value));
      const again = h("button", "pill small", "Cerca con questo testo");
      again.addEventListener("click", async () => {
        const q = ta.value.replace(/\s+/g, " ").trim();
        if (!q) { K.toast("Il testo è vuoto"); return; }
        again.textContent = "Cerco…"; again.disabled = true;
        const found = it.kind === "disco" ? await searchDiscByTitle(q, q) : await searchBookByTitle(q, q);
        again.textContent = "Cerca con questo testo"; again.disabled = false;
        if (!found) { K.toast(notFoundMsg()); return; }
        Object.keys(found).forEach(k => { if (found[k] !== undefined && found[k] !== null && found[k] !== "" && k !== "kind") it[k] = found[k]; });
        reopenWith(it);
      });
      d.append(ta, again);
      right.appendChild(d);
    }

    const dyn = h("div", "col-fields");
    right.appendChild(dyn);
    function refreshFields() {
      dyn.innerHTML = "";
      const two = (a, b) => { const r = h("div", "col-row"); r.append(a, b); return r; };
      dyn.appendChild(two(field("creator", CREATOR[it.kind]), field("publisher", PUBLISHER[it.kind])));
      const third = it.kind === "libro" || it.kind === "fumetto" ? field("pages", "Pagine", "number") : field("format", it.kind === "disco" ? "Formato (vinile, CD…)" : it.kind === "film" ? "Formato (Blu-ray, DVD…)" : "Formato");
      dyn.appendChild(two(field("year", "Anno", "number"), third));
      if (it.status === "prestati") dyn.appendChild(field("lent_to", "Prestato a…"));
      if (it.status === "in_arrivo") {
        const r = h("label", "col-lbl", "Arriva il ");
        r.appendChild(field("arriving_on", "", "date"));
        dyn.appendChild(r);
      }
      // Voto
      const stars = h("div", "col-rate");
      for (let n = 1; n <= 5; n++) {
        const s = h("button", "col-star" + ((it.rating || 0) >= n ? " on" : ""), "★");
        s.addEventListener("click", () => { it.rating = it.rating === n ? null : n; refreshFields(); });
        stars.appendChild(s);
      }
      dyn.appendChild(stars);
      const note = h("textarea", "field col-note");
      note.placeholder = "La tua nota: perché lo consigli, cosa ti è piaciuto…";
      note.value = it.note || "";
      note.addEventListener("input", () => (it.note = note.value));
      dyn.appendChild(note);
      dyn.appendChild(field("location", "Dove si trova in casa (es. salotto, ripiano 3)"));
      if (it.description) {
        const d = h("details", "col-desc");
        d.appendChild(h("summary", "", "Trama / descrizione"));
        d.appendChild(h("p", "", it.description));
        dyn.appendChild(d);
      }
    }
    refreshFields();

    // Pulsanti
    const row = h("div", "row");
    if (!it._new) {
      const del = h("button", "", "Elimina");
      del.addEventListener("click", () => {
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tocca di nuovo per eliminare"; return; }
        src.deleted_at = new Date().toISOString();
        persist(src);
        closeSheet(); render();
        K.toast("Eliminato");
      });
      row.appendChild(del);
      const share = h("button", "", "Consiglia");
      share.addEventListener("click", () => shareItem(it));
      row.appendChild(share);
    } else {
      const cancel = h("button", "", "Annulla");
      cancel.addEventListener("click", closeSheet);
      row.appendChild(cancel);
    }
    const ok = h("button", "primary", it._new ? "Aggiungi" : "Salva");
    ok.addEventListener("click", () => commit(it, src));
    row.appendChild(ok);
    right.appendChild(row);

    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
  }
  // Ridisegna la scheda aperta con i dati aggiornati (dopo "Cerca online")
  function reopenWith(it) {
    const src = sheetItem ? sheetItem.src : it;
    openSheet(Object.assign({}, src, it));
    sheetItem.src = src;
  }

  async function commit(it, src) {
    if (!String(it.title || "").trim()) { K.toast("Manca il titolo"); return; }
    const blob = it._blob, preview = it._preview;
    delete it._blob; delete it._new; delete it._ocr;
    if (it.status === "collezione" && src.status === "in_arrivo") it.arriving_on = null;
    const target = items.find(x => x.client_id === it.client_id) || src;
    Object.assign(target, it);
    delete target._new;
    if (preview) target._preview = preview;
    persist(target);
    closeSheet();
    if (target.status !== status && !query) status = target.status;
    render();
    if (blob) {
      try {
        target.cover_path = await DB.uploadPhoto(`collection/${target.client_id}-${Date.now()}.jpg`, blob);
        persist(target);
      } catch (e) { K.toast("Copertina non caricata: riprova con la rete"); }
    }
  }

  function shareItem(it) {
    const by = it.creator ? (it.kind === "disco" ? ` di ${it.creator}` : ` di ${it.creator}`) : "";
    const lines = [`Ti consiglio "${it.title}"${by}${it.year ? ` (${it.year})` : ""}.`];
    if (it.note) lines.push(it.note);
    if (it.rating) lines.push("★".repeat(it.rating) + "☆".repeat(5 - it.rating));
    if (it.barcode && isIsbn(it.barcode)) lines.push("ISBN " + it.barcode);
    const text = lines.join("\n");
    if (L.share) L.share(text);
    else K.toast("Copiato: " + text);
  }

  // ---------- Fotocamera: scansione (singola o a raffica) e foto della copertina ----------
  let cam = null;   // { stream, timer, opts, burst, seen, list }

  function openScanner(opts) {
    closeScanner();
    const box = ui.scan;
    box.innerHTML = "";
    box.hidden = false;
    const photo = opts.mode === "photo";
    const video = h("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    const frame = h("div", photo ? "col-scan-frame photo" : "col-scan-frame");
    if (!photo) frame.appendChild(h("div", "col-scan-line"));
    const top = h("div", "col-scan-top");
    const x = h("button", "sec-close", "✕");
    x.addEventListener("click", closeScanner);
    const hint = h("div", "col-scan-hint", photo ? (opts.hint || "Inquadra la copertina e scatta") : "Inquadra il codice a barre");
    top.append(x, hint);
    const status_ = h("div", "col-scan-status");
    const bottom = h("div", "col-scan-bottom");
    box.append(video, frame, top, status_, bottom);
    cam = { opts, burst: false, seen: new Map(), list: [], video, status: status_, hint, kindSel: null, statusSel: status === "in_corso" ? "collezione" : status, busy: false };

    if (photo) {
      const shutter = h("button", "col-shutter");
      shutter.setAttribute("aria-label", "Scatta");
      shutter.addEventListener("click", takePhoto);
      bottom.appendChild(shutter);
    } else {
      // Cosa sto scansionando (automatico = capisce da solo libri e dischi) e dove aggiungerlo
      const kinds = h("div", "col-scan-row");
      const kindBtn = (id, label) => {
        const b = h("button", "pill small" + (cam.kindSel === id ? " on" : ""), label);
        b.addEventListener("click", () => { cam.kindSel = id; kinds.querySelectorAll("button").forEach(z => z.classList.toggle("on", z === b)); });
        kinds.appendChild(b);
      };
      kindBtn(null, "Automatico");
      KINDS.forEach(([id]) => kindBtn(id, KIND_ONE[id]));
      const dest = h("div", "col-scan-row");
      dest.appendChild(h("span", "col-scan-lbl", "Aggiungi a"));
      STATUSES.filter(s => s[0] !== "prestati").forEach(([id, label]) => {
        const b = h("button", "pill small" + (cam.statusSel === id ? " on" : ""), label);
        b.addEventListener("click", () => { cam.statusSel = id; dest.querySelectorAll("button").forEach(z => z.classList.toggle("on", z === b)); });
        dest.appendChild(b);
      });
      const tools = h("div", "col-scan-row");
      const burst = h("button", "pill small", "Raffica: no");
      burst.innerHTML = svg("burst") + "<span>Raffica: no</span>";
      burst.addEventListener("click", () => {
        cam.burst = !cam.burst;
        burst.classList.toggle("on", cam.burst);
        burst.querySelector("span").textContent = cam.burst ? "Raffica: sì" : "Raffica: no";
        hint.textContent = cam.burst ? "Raffica: passa un oggetto dopo l'altro" : "Inquadra il codice a barre";
      });
      const type = h("button", "pill small", "Scrivi il codice");
      type.addEventListener("click", () => {
        const f = h("input", "field col-scan-input");
        f.inputMode = "numeric";
        f.placeholder = "ISBN o codice a barre, poi Invio";
        f.addEventListener("keydown", e => { if (e.key === "Enter" && f.value.trim()) { onCode(f.value.trim()); f.value = ""; } });
        tools.replaceChild(f, type);
        f.focus();
      });
      const manual = h("button", "pill small", "Senza codice");
      manual.addEventListener("click", () => { const st = cam.statusSel, kd = cam.kindSel; closeScanner(); openSheet(blank({ status: st, kind: kd || "libro" })); });
      const fromCover = h("button", "pill small", "Dalla copertina");
      fromCover.addEventListener("click", () => {
        const st = cam.statusSel, kd = cam.kindSel;
        openScanner({ mode: "photo", hint: "Inquadra la copertina: titolo dritto e ben illuminato", onPhoto: (blob, url) => readCoverFlow(blob, url, kd, st) });
      });
      tools.append(burst, type, fromCover, manual);
      cam.burstList = h("div", "col-burst");
      bottom.append(kinds, dest, tools, cam.burstList);
    }
    startCamera();
  }

  async function startCamera() {
    const c = cam;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (cam !== c) { stream.getTracks().forEach(t => t.stop()); return; }
      c.stream = stream;
      // Messa a fuoco continua, se la fotocamera la permette
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        console.log("Fotocamera", JSON.stringify(track.getSettings ? track.getSettings() : {}), "fuoco:", JSON.stringify(caps.focusMode || null));
        if (caps.focusMode && caps.focusMode.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { }
      c.video.srcObject = stream;
      // Non aspetta play(): su alcune WebView la promessa non si risolve mai
      c.video.play().catch(e => console.warn("Video play", e && e.message));
      if (c.opts.mode !== "photo") scanLoop(c);
    } catch (e) {
      c.status.textContent = "Fotocamera non disponibile: usa \"Scrivi il codice\".";
      c.status.classList.add("show");
      console.warn("Fotocamera", e && e.name, e && e.message);
    }
  }

  let reader = null;
  function getReader() {
    if (reader || !window.ZXing) return reader;
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    return reader;
  }

  function scanLoop(c) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (cam !== c) return;
      c.timer = setTimeout(tick, 180);
      const v = c.video, r = getReader();
      c.ticks = (c.ticks || 0) + 1;
      if (c.ticks === 10) console.log("Scanner pronto?", "ZXing:", typeof window.ZXing, "video:", v.videoWidth + "x" + v.videoHeight, "stato:", v.readyState);
      if (!r || !v.videoWidth || c.busy) return;
      // Solo la fascia centrale (dove c'è il riquadro), rimpicciolita: più veloce sul tablet
      const sw = v.videoWidth * 0.8, sh = v.videoHeight * 0.4;
      const sx = (v.videoWidth - sw) / 2, sy = v.videoHeight * 0.12;
      const scale = Math.min(1, 900 / sw);
      canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      c.frames = (c.frames || 0) + 1;
      try {
        const Z = window.ZXing;
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        const res = r.decodeWithState(bmp);
        r.reset();
        if (res) onCode(res.getText());
      } catch (e) {
        r.reset();
        const name = (e && (e.name || (e.constructor && e.constructor.name))) || String(e);
        if (!/NotFound|Checksum|Format|detect the code/i.test(name + " " + (e && e.message)) && !c.loggedError) { c.loggedError = true; console.warn("Scanner errore", name, e && e.message); }
      }
      if (c.frames % 25 === 1) console.log("Scanner", c.frames, "frame", v.videoWidth + "x" + v.videoHeight, "ritaglio", canvas.width + "x" + canvas.height);
    };
    tick();
  }

  function beep(ok) {
    try {
      const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = ok ? 1320 : 440;
      g.gain.setValueAtTime(0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.2);
    } catch (e) { }
    L.vibrate && L.vibrate(ok ? 60 : 160);
  }

  function onCode(raw) {
    const c = cam;
    if (!c) return;
    const code = String(raw).replace(/[^0-9X]/gi, "").toUpperCase();
    if (code.length < 8) return;
    const last = c.seen.get(code);
    if (last && Date.now() - last < (c.burst ? 60000 : 3000)) return;   // in raffica ogni codice una volta sola
    c.seen.set(code, Date.now());
    handleCode(code, c.opts, c);
  }

  async function handleCode(code, opts, c) {
    const existing = findByCode(code);
    if (c && !c.burst) {
      // Singola: si ferma e mostra il risultato
      c.busy = true;
      beep(!existing);
      if (existing) {
        closeScanner();
        openSheet(existing, `Ce l'hai già · ${STATUS_ONE[existing.status]}${existing.location ? " · " + existing.location : ""}`);
        return;
      }
      c.status.textContent = "Cerco " + code + "…";
      c.status.classList.add("show");
      const found = await lookup(code, c.kindSel);
      if (cam !== c) return;
      const st = c.statusSel;
      closeScanner();
      openSheet(blank(Object.assign({ status: st, barcode: code }, found || {}, { kind: (found && found.kind) || c.kindSel || "libro" })),
        found ? "Trovato online: controlla e aggiungi" : notFoundMsg());
      return;
    }
    if (!c) {
      // Dalla ricerca: codice scritto a mano
      if (existing) { openSheet(existing, `Ce l'hai già · ${STATUS_ONE[existing.status]}`); return; }
      K.toast("Cerco " + code + "…");
      const found = await lookup(code, kind);
      openSheet(blank(Object.assign({ barcode: code }, found || {}, { kind: (found && found.kind) || kind || "libro" })),
        found ? "Trovato online: controlla e aggiungi" : notFoundMsg());
      return;
    }
    // Raffica: aggiunge da solo e passa al prossimo
    beep(!existing);
    const row = h("div", "col-burst-row");
    c.burstList.prepend(row);
    if (existing) {
      row.classList.add("dup");
      row.textContent = `Già presente: ${existing.title} (${STATUS_ONE[existing.status]})`;
      return;
    }
    row.textContent = "Cerco " + code + "…";
    const found = await lookup(code, c.kindSel);
    const it = blank(Object.assign({ status: c.statusSel, barcode: code }, found || {}, { kind: (found && found.kind) || c.kindSel || "libro" }));
    if (!it.title) it.title = "Da completare · " + code;
    delete it._new;
    persist(it);
    c.list.push(it);
    row.classList.add(found ? "ok" : "todo");
    row.textContent = (found ? "✓ " : "? ") + it.title;
    c.hint.textContent = `Raffica: ${c.list.length} aggiunti`;
  }

  function takePhoto() {
    const c = cam, v = c && c.video;
    if (!v || !v.videoWidth) return;
    // Ritaglio verticale 2:3 al centro, come una copertina
    const ch = v.videoHeight * 0.9, cw = Math.min(v.videoWidth, ch * 2 / 3);
    const canvas = document.createElement("canvas");
    canvas.height = 750; canvas.width = Math.round(750 * cw / ch);
    canvas.getContext("2d").drawImage(v, (v.videoWidth - cw) / 2, (v.videoHeight - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const cb = c.opts.onPhoto;
      closeScanner();
      cb && cb(blob, url);
    }, "image/jpeg", 0.85);
  }

  function closeScanner() {
    if (!cam) { if (ui.scan) ui.scan.hidden = true; return; }
    const c = cam;
    cam = null;
    clearTimeout(c.timer);
    if (c.stream) c.stream.getTracks().forEach(t => t.stop());
    ui.scan.hidden = true;
    ui.scan.innerHTML = "";
    if (c.list && c.list.length) { K.toast(`Aggiunti ${c.list.length} oggetti`); render(); }
  }

  // ---------- Riconoscimento dalla foto della copertina (OCR gratuito e offline: Tesseract.js) ----------
  // Tutto negli asset: tesseract.min.js, tesseract-worker.min.js, core wasm (con e senza SIMD), ita/eng "fast".
  // Sul tablet worker, core e lingue arrivano da un indirizzo https finto servito da MainActivity (shouldInterceptRequest).
  const OCR_BASE = L.httpGet ? "https://appassets.androidplatform.net/assets/" : new URL(".", location.href).href;
  const OCR_TIMEOUT = 90000;
  let ocrJob = null;   // { worker, cancelled }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "tesseract.min.js";
      s.onload = ok;
      s.onerror = () => ko(new Error("tesseract.min.js non caricato"));
      document.head.appendChild(s);
    });
  }
  const hasSimd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };

  // Legge il testo della foto; onStep(testo) per l'indicatore. Libera sempre il worker alla fine.
  async function ocrCover(blob, onStep) {
    const job = { worker: null, cancelled: false };
    ocrJob = job;
    const t0 = Date.now();
    let timer;
    try {
      await loadTesseract();
      const core = OCR_BASE + (hasSimd() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js");
      const work = (async () => {
        job.worker = await Tesseract.createWorker(["ita", "eng"], 1, {
          workerPath: OCR_BASE + "tesseract-worker.min.js", corePath: core, langPath: OCR_BASE.replace(/\/$/, ""),
          cacheMethod: "none", gzip: true,
          logger: m => { if (m.status === "recognizing text") onStep("Leggo la copertina… " + Math.round((m.progress || 0) * 100) + "%"); }
        });
        if (job.cancelled) return null;
        const tLoad = Date.now() - t0;
        onStep("Leggo la copertina…");
        const r = await job.worker.recognize(blob, {}, { blocks: true, text: true });
        console.log("Copertina: OCR", core.split("/").pop(), "avvio", tLoad, "ms, lettura", Date.now() - t0 - tLoad, "ms");
        return r.data;
      })();
      const data = await Promise.race([work, new Promise((_, ko) => { timer = setTimeout(() => ko(new Error("tempo scaduto")), OCR_TIMEOUT); })]);
      return data && Object.assign(pickCoverText(data), { ms: Date.now() - t0 });
    } finally {
      clearTimeout(timer);
      if (ocrJob === job) ocrJob = null;
      if (job.worker) job.worker.terminate().catch(() => { });
    }
  }
  function cancelOcr() {
    const j = ocrJob;
    if (!j) return;
    j.cancelled = true;
    ocrJob = null;
    if (j.worker) j.worker.terminate().catch(() => { });
  }

  // Dalle righe lette sceglie il titolo (le scritte più grandi) e l'autore (un nome fra le altre righe)
  const NOISE = /bestseller|copie vendute|dall'autore|dell'autore|autore di|edizione|romanzo|in collaborazione|prefazione|introduzione|traduzione|tradotto|a cura di|www\.|\.com|\.it\b|isbn|euro|€/i;
  function pickCoverText(data) {
    const lines = [];
    (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => {
      // Solo le parole lette con sicurezza (le lettere singole solo se sicurissime): via i pezzi di disegno
      const ws = (l.words || []).map(w => ({ t: String(w.text || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?.)]+$/gu, ""), c: w.confidence }))
        .filter(w => w.t && w.c >= 55 && (w.t.length > 1 ? true : w.c >= 85 && /\p{L}|\d/u.test(w.t)));
      const text = (l.words ? ws.map(w => w.t).join(" ") : String(l.text || "")).replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?.)]+$/gu, "").trim();
      const letters = (text.match(/\p{L}/gu) || []).length;
      if (letters < 3 || letters / text.replace(/\s/g, "").length < 0.7 || l.confidence < 45) return;
      // Le parole "vere" (almeno due lettere di fila) devono essere la maggior parte: scarta il rumore tipo "ii l1 Y"
      const words = text.split(" "), good = words.filter(w => /\p{L}{2,}/u.test(w)).length;
      if (good / words.length < 0.6) return;
      lines.push({ text, conf: l.confidence, h: l.bbox.y1 - l.bbox.y0, y: l.bbox.y0, noise: NOISE.test(text) });
    })));
    const byY = lines.slice().sort((a, b) => a.y - b.y);
    const cand = lines.filter(l => !l.noise).sort((a, b) => b.h - a.h);
    if (!cand.length) return { title: "", creator: "", lines: byY.map(l => l.text) };
    // Titolo: la riga più grande, più le righe vicine di altezza simile (titoli su due righe)
    const top = cand[0];
    const titleLines = byY.filter(l => !l.noise && l.h >= top.h * 0.75 && Math.abs(l.y - top.y) <= top.h * 2.6);
    const title = titleLines.map(l => l.text).join(" ");
    // Autore: fra le altre righe, la più grande che sembra un nome (2–4 parole senza cifre, iniziali maiuscole)
    const isName = t => !/\d/.test(t) && t.split(" ").length >= 2 && t.split(" ").length <= 4 && t.split(" ").every(w => /^[\p{Lu}]/u.test(w) || /^(de|di|da|del|della|van|von|le|la)$/i.test(w));
    const author = cand.find(l => !titleLines.includes(l) && isName(l.text));
    return { title, creator: author ? author.text : "", lines: byY.map(l => l.text) };
  }

  // L'elemento col punteggio più alto (a parità, il primo: il più pertinente per il catalogo)
  function bestBy(list, score) {
    let best = null, bs = -1;
    list.forEach(x => { const s = score(x); if (s > bs) { bs = s; best = x; } });
    return best;
  }
  // Quanto il titolo trovato online somiglia a quello letto (0–1)
  function similarity(a, b) {
    const ws = s => norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(w => w.length > 2);
    const A = ws(a), B = new Set(ws(b));
    if (!A.length) return 0;
    return A.filter(w => B.has(w)).length / A.length;
  }
  // Per scegliere fra più risultati: conta anche quanto del titolo trovato è stato letto (meno parole in più = meglio)
  const rankSim = (want, title) => similarity(want, title) + 0.3 * similarity(title, want);
  const niceCase = s => s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;

  async function readCoverFlow(blob, url, kd, st) {
    // Pannello "Leggo la copertina…" sopra a tutto, con la foto e Annulla
    const box = ui.scan;
    box.innerHTML = "";
    box.hidden = false;
    const panel = h("div", "col-ocr");
    const img = h("img");
    img.src = url;
    const msg = h("div", "col-ocr-msg", "Preparo il lettore…");
    const stop = h("button", "pill small", "Annulla");
    let cancelled = false;
    stop.addEventListener("click", () => { cancelled = true; cancelOcr(); box.hidden = true; box.innerHTML = ""; });
    panel.append(img, msg, stop);
    box.appendChild(panel);
    const base = { status: st, kind: kd || "libro", _blob: blob, _preview: url };

    let read = null;
    try {
      read = await ocrCover(blob, t => (msg.textContent = t));
    } catch (e) {
      console.warn("Copertina: OCR fallito", e && e.message);
    }
    if (cancelled || !root) return;
    box.hidden = true; box.innerHTML = "";
    if (!read || !read.title) {
      openSheet(blank(Object.assign({}, base, { _ocr: read ? read.lines.join("\n") : "" })),
        read ? "Non sono riuscito a leggere il titolo: scrivilo tu" : "Lettura non riuscita: scrivi tu il titolo");
      return;
    }
    console.log("Copertina letta in", read.ms, "ms · titolo:", read.title, "· autore:", read.creator, "· righe:", JSON.stringify(read.lines));
    K.toast("Cerco \"" + read.title + "\"…");
    quotaHit = false;
    const kindNow = base.kind;
    const search = kindNow === "disco" ? searchDiscByTitle : (kindNow === "libro" || kindNow === "fumetto") ? searchBookByTitle : null;
    let found = null;
    if (search) {
      // Titolo + autore, solo titolo, poi tutte le righe lette (i cataloghi perdonano le parole in più):
      // si ferma al primo risultato col titolo simile, altrimenti tiene il più simile
      const all = read.lines.join(" ").split(" ").slice(0, 12).join(" ");
      const tries = [(read.title + " " + read.creator).trim(), read.title, all].filter((q, i, a) => q && a.indexOf(q) === i);
      let bestSim = -1;
      for (const q of tries) {
        const f = await search(q, read.title);
        const s = f ? similarity(read.title, f.title) : -1;
        if (s > bestSim) { bestSim = s; found = f; }
        if (s >= 0.5) break;
      }
    }
    const ocr = read.lines.join("\n");
    if (!found) {
      openSheet(blank(Object.assign({}, base, { title: niceCase(read.title), creator: niceCase(read.creator), _ocr: ocr })),
        search ? "Letto dalla copertina, ma non l'ho trovato online: correggi il titolo" : "Letto dalla copertina: correggi il titolo");
      return;
    }
    const sure = similarity(read.title, found.title) >= 0.5;
    console.log("Copertina: trovato", found.title, "/", found.creator, "somiglianza", similarity(read.title, found.title).toFixed(2));
    delete found.kind;   // resta il tipo scelto; la copertina mostrata è la tua foto (cover_url solo di riserva)
    openSheet(blank(Object.assign({}, base, found, { _ocr: ocr })),
      sure ? "Riconosciuto dalla copertina: controlla" : "Riconosciuto dalla copertina, ma non ne sono sicuro: controlla bene");
  }

  // ---------- Pulsante nella Home ----------
  (function setupLaunch() {
    const btn = document.getElementById("collectionBtn");
    if (!btn) return;
    // Icone in prospettiva, tratto sottile come quelle dei progetti sotto l'onda
    btn.querySelector(".cl-icons").innerHTML = ["book3d", "disc3d", "dice3d", "vinyl3d"]
      .map(n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".6" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`).join("");
    btn.addEventListener("click", () => S.open("collection"));
  })();

  S.register("collection", {
    open(el) {
      root = el;
      build(el);
      render();
      loadPhotos();
      refresh();
    },
    close() {
      cancelOcr();
      closeScanner();
      closeSheet();
      root = null;
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      DB.flush();
    },
    back() {
      if (cam) { closeScanner(); return true; }
      const ocrStop = ui.scan && !ui.scan.hidden && ui.scan.querySelector(".col-ocr button");
      if (ocrStop) { ocrStop.click(); return true; }
      if (ui.sheet && !ui.sheet.hidden) { closeSheet(); return true; }
      if (query) { query = ""; ui.search.value = ""; render(); return true; }
      return false;
    },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });

  // http: anche per la Dispensa (sul tablet passa dal ponte Java, senza i limiti CORS)
  window.LeiCollection = { lookup, ocrCover, http };   // ocrCover: anche per le prove da console
})();
