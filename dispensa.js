// Sezione Dispensa: i prodotti dell'app Dispensa dell'iPhone (archivio online) e le ricette del piano Dieta
// che si possono preparare con quello che c'è in casa, prima quelle che usano prodotti in scadenza.
(function () {
  const S = window.LeiSections, DB = window.LeiDB, D = S.D, K = window.LeiCore, CAT = window.LeiCategorie;
  const ZONES = [["frigo", "Frigo"], ["freezer", "Freezer"], ["dispensa", "Dispensa"]];
  const ZONE_ICON = { frigo: "fridge", freezer: "snow", dispensa: "box" };
  const UNITS = ["pz", "g", "kg", "ml", "l"];
  const STEP = { pz: 1, g: 100, kg: 0.5, ml: 100, l: 0.5 };   // come i pulsanti −/+ dell'app
  const SOON_DAYS = 3;                                          // "in scadenza" come nell'app
  const PLAN_DAYS = 7;                                          // ricette dei prossimi giorni
  // Ingredienti che si danno per scontati in cucina
  const STAPLES = ["olio", "erbe", "erbette", "sale"];
  const DAY_LONG = { lun: "Lunedì", mar: "Martedì", mer: "Mercoledì", gio: "Giovedì", ven: "Venerdì", sab: "Sabato", dom: "Domenica" };

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const qty = (n, u) => `${String(Math.round(Number(n) * 100) / 100).replace(".", ",")} ${u}`;

  const SHOP = "shopping_items?deleted_at=is.null&select=id,name,amount,done,source,created_at&order=created_at";
  const SOURCE_LABEL = { mano: "", ricetta: "per le ricette", finito: "finito", scaduto: "scaduto" };
  let root = null, ui = {}, data = null, tab = "prodotti", zone = null, onlySoon = false, photos = {};
  let cat = null;            // categoria aperta (null = griglia 3×3 delle categorie)
  let hasCategory = true;    // l'archivio ha la colonna products.category (08_categoria_prodotti.sql)
  const catOf = p => CAT.categoryOf(p.name, p.location, p.category);

  // ---------- Dati ----------
  async function loadAll(cacheOnly) {
    const get = path => (cacheOnly ? DB.peek(path) : DB.load(path));
    // La colonna "category" arriva con 08_categoria_prodotti.sql: finché manca si legge senza
    const prodPath = cols => `products?deleted_at=is.null&select=id,name,quantity,unit,location,expiry_date,image_path,barcode${cols}&order=name`;
    const products = await get(prodPath(",category")).then(r => { if (!cacheOnly) hasCategory = true; return r; }, e => {
      if (e.status === 400) hasCategory = false;
      else if (!cacheOnly) throw e;
      return get(prodPath(""));
    });
    const [blocks, variants] = await Promise.all([
      get("plan_blocks?type=eq.meal&select=day,id,time,title&order=position"),
      get("meal_variants?select=day,meal_id,position,title,description,ingredients&order=position")
    ]);
    const pools = {};
    variants.forEach(v => (pools[v.day + "." + v.meal_id] = pools[v.day + "." + v.meal_id] || []).push(v));
    const meals = {};
    blocks.forEach(b => (meals[b.day] = meals[b.day] || []).push(b));
    // Lista della spesa: null se la tabella non c'è ancora (06_lista_spesa.sql non eseguito)
    const shopping = await get(SHOP).catch(() => null);
    return { products, pools, meals, shopping };
  }

  async function refresh() {
    try {
      data = await loadAll(false);
      render();
      loadPhotos();
    } catch (e) {
      if (e.status === 401) return;
      if (!data) {
        ui.body.innerHTML = "";
        ui.body.appendChild(h("div", "sec-empty", "Non riesco a scaricare la dispensa. Controlla il Wi-Fi e riapri la sezione."));
      }
    }
  }

  // Le foto stanno in una cartella privata: chiede indirizzi temporanei solo per quelle che mancano
  async function loadPhotos() {
    const missing = data.products.map(p => p.image_path).filter(p => p && !photos[p]);
    if (!missing.length) return;
    try {
      Object.assign(photos, await DB.signPhotos(missing));
      render();
    } catch (e) { }
  }

  // ---------- Scadenze ----------
  function daysLeft(p) {
    if (!p.expiry_date) return null;
    return D.between(D.today(), D.parse(p.expiry_date));
  }
  function expiryClass(p) {
    const d = daysLeft(p);
    if (d === null) return "";
    return d < 0 ? "expired" : d <= SOON_DAYS ? "soon" : "";
  }
  function expiryText(p) {
    const d = daysLeft(p);
    if (d === null) return "";
    if (d < 0) return d === -1 ? "scaduto ieri" : `scaduto da ${-d} giorni`;
    if (d === 0) return "scade oggi";
    if (d === 1) return "scade domani";
    return `scade il ${D.label(D.parse(p.expiry_date), { day: "numeric", month: "short" })}`;
  }

  // ---------- Ricette possibili ----------
  // Un ingrediente c'è se il nome di un prodotto lo contiene (es. "pasta" → "Pasta Barilla")
  function matchIngredient(ing) {
    const w = norm(ing);
    if (STAPLES.includes(w)) return { ok: true, staple: true, products: [] };
    const found = data.products.filter(p => Number(p.quantity) > 0 && norm(p.name).split(/[^a-z]+/).some(t => t === w || (w.length > 3 && t.startsWith(w.slice(0, -1)))));
    return { ok: found.length > 0, products: found };
  }
  function evaluate(variant) {
    const ings = variant.ingredients || [];
    const have = [], miss = [], urgent = [];
    ings.forEach(i => {
      const m = matchIngredient(i);
      (m.ok ? have : miss).push(i);
      m.products.forEach(p => { if (expiryClass(p) && !urgent.includes(p)) urgent.push(p); });
    });
    return { variant, have, miss, urgent, score: ings.length ? have.length / ings.length : 0 };
  }
  function upcomingMeals() {
    const out = [];
    for (let i = 0; i < PLAN_DAYS; i++) {
      const date = D.add(D.today(), i), key = D.key(date);
      (data.meals[key] || []).forEach(b => {
        const pool = data.pools[key + "." + b.id];
        if (!pool || !pool.length) return;   // colazione e spuntini non hanno ricetta
        const planned = S.weekVariant(pool, date, b.id);
        const options = pool.map(evaluate).sort((a, c) => (a.variant === planned ? -1 : c.variant === planned ? 1 : 0));
        out.push({ date, block: b, planned: options[0], alternatives: options.slice(1) });
      });
    }
    return out;
  }

  // ---------- Salvataggi (arrivano all'iPhone alla prossima apertura dell'app) ----------
  // Senza la colonna nell'archivio la categoria scelta a mano non si salva (la riga verrebbe rifiutata)
  function forDB(values) {
    const v = Object.assign({}, values);
    if (!hasCategory) delete v.category;
    return v;
  }
  function saveProduct(p, values) {
    Object.assign(p, values);
    DB.update("products", `id=eq.${p.id}`, forDB(values));
    render();
  }
  function removeProduct(p) {
    data.products = data.products.filter(x => x !== p);
    DB.update("products", `id=eq.${p.id}`, { deleted_at: new Date().toISOString() });
    closeSheet();
    render();
  }
  function addProduct(row) {
    data.products.push(Object.assign({ id: null, image_path: null }, row));
    data.products.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    DB.insert("products", forDB(row)).then(refresh);
    closeSheet();
    render();
  }

  // ---------- Codice a barre: Open Food Facts (archivio libero e gratuito, senza chiave) ----------
  async function lookupBarcode(code) {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name_it,product_name,generic_name_it,brands,categories_tags`);
      if (!r.ok) return null;
      const j = await r.json();
      const pr = j && j.status === 1 && j.product;
      if (!pr) return null;
      let name = (pr.product_name_it || pr.product_name || pr.generic_name_it || "").trim();
      const brand = String(pr.brands || "").split(",")[0].trim();
      if (!name) return null;
      if (brand && !norm(name).includes(norm(brand))) name += " " + brand;
      const category = CAT.fromTags(pr.categories_tags) || CAT.guess(name);
      return { name, category, location: category ? CAT.placeFor(category) : "dispensa" };
    } catch (e) { return null; }
  }

  function openScan() {
    window.LeiScanner.open({
      hint: "Inquadra il codice a barre del prodotto",
      onManual: () => openSheet(null),
      onCode: async (code, o) => {
        const existing = data.products.find(p => p.barcode === code);
        if (existing) {
          if (!o.burst) { openSheet(existing, null, "Ce l'hai già: aggiorna la quantità"); return null; }
          if (existing.id === null) return { text: `${existing.name} · in invio, riprova tra poco`, cls: "dup" };
          saveProduct(existing, { quantity: Math.round((Number(existing.quantity) + STEP[existing.unit]) * 100) / 100 });
          return { text: `${existing.name} · ora ${qty(existing.quantity, existing.unit)}`, cls: "dup" };
        }
        if (!o.burst) K.toast("Cerco " + code + "…");
        const found = await lookupBarcode(code);
        if (!o.burst) {
          openSheet(null, Object.assign({ barcode: code }, found || {}),
            found ? "Trovato online: controlla e aggiungi" : "Non l'ho trovato online: scrivi tu il nome");
          return null;
        }
        if (!found) return { text: `${code} · non trovato: aggiungilo a mano`, cls: "todo" };
        addProduct({ name: found.name, quantity: 1, unit: "pz", location: found.location, expiry_date: null, category: found.category || null, barcode: code });
        return { text: `${found.name} · aggiunto`, cls: "ok" };
      }
    });
  }

  // ---------- Interfaccia ----------
  function build(el) {
    el.innerHTML = "";
    el.classList.add("sec-dispensa");
    const head = S.header("Dispensa");
    ui.sub = head.querySelector(".sec-sub");
    ui.sync = head.querySelector(".sec-sync");
    ui.tabs = h("div", "sec-tabs");
    [["prodotti", "Prodotti"], ["ricette", "Ricette possibili"], ["spesa", "Lista spesa"]].forEach(([id, label]) => {
      const b = h("button", "pill small" + (id === tab ? " on" : ""), label);
      b.dataset.tab = id;
      b.addEventListener("click", () => { tab = id; render(); });
      ui.tabs.appendChild(b);
    });
    head.insertBefore(ui.tabs, ui.sync);
    ui.body = h("div", "ds-body");
    ui.sheet = h("div", "sheet ds-sheet");
    ui.sheet.hidden = true;
    ui.sheet.addEventListener("click", e => { if (e.target === ui.sheet) closeSheet(); });
    el.append(head, ui.body, ui.sheet);
  }

  function render() {
    if (!data || !root) return;
    ui.tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    const soon = data.products.filter(p => expiryClass(p)).length;
    ui.sub.textContent = `${data.products.length} prodotti` + (soon ? ` · ${soon} in scadenza o scaduti` : "");
    S.syncLabel(ui.sync);
    ui.body.innerHTML = "";
    ui.body.className = "ds-body ds-" + tab;
    if (tab === "prodotti") renderProducts();
    else if (tab === "ricette") renderRecipes();
    else renderShopping();
  }

  function thumb(p, cls) {
    const t = h("div", "ds-thumb " + (cls || ""));
    const url = p.image_path && photos[p.image_path];
    if (url) {
      const img = h("img");
      img.src = url;
      img.alt = "";
      img.addEventListener("error", () => { t.innerHTML = ""; t.textContent = (p.name || "?").charAt(0).toUpperCase(); });
      t.appendChild(img);
    } else {
      t.textContent = (p.name || "?").charAt(0).toUpperCase();
    }
    return t;
  }

  function renderProducts() {
    const bar = h("div", "ds-filters");
    const chip = (label, active, fn) => { const b = h("button", "pill small" + (active ? " on" : ""), label); b.addEventListener("click", fn); bar.appendChild(b); };
    chip("Tutti", !zone, () => { zone = null; render(); });
    ZONES.forEach(([id, label]) => chip(label, zone === id, () => { zone = id; render(); }));
    chip("In scadenza", onlySoon, () => { onlySoon = !onlySoon; render(); });
    const scan = h("button", "pill ds-scan");
    scan.innerHTML = CAT.svg("barcode") + "<span>Scansiona</span>";
    scan.addEventListener("click", openScan);
    const add = h("button", "pill primary ds-add", "+ Aggiungi");
    add.addEventListener("click", () => openSheet(null));
    bar.append(scan, add);
    ui.body.appendChild(bar);

    const filtered = data.products.filter(p => (!zone || p.location === zone) && (!onlySoon || expiryClass(p)));
    if (!cat) { ui.body.appendChild(categoryGrid(filtered)); return; }

    // Dentro una categoria: titolo con il ritorno alla griglia
    const c = CAT.LIST.find(x => x.id === cat);
    const back = h("button", "ds-cat-back");
    back.innerHTML = `<span class="ds-cat-arrow">‹</span>${CAT.svg(c.icon)}<span>${c.label}</span>`;
    back.style.color = c.color;
    back.addEventListener("click", () => { cat = null; render(); });
    ui.body.appendChild(back);

    const list = filtered
      .filter(p => catOf(p).id === cat)
      .sort((a, b) => {
        const da = daysLeft(a), db = daysLeft(b);
        if (da === null && db === null) return norm(a.name).localeCompare(norm(b.name));
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    if (!list.length) {
      ui.body.appendChild(h("div", "sec-empty", "Nessun prodotto in questa categoria" + (zone || onlySoon ? " con questi filtri." : ": aggiungilo con Scansiona o + Aggiungi.")));
      return;
    }
    // "Tutti": riquadri con l'icona. Zona scelta: elenco con foto e dettagli.
    ui.body.appendChild(zone ? productList(list) : productTiles(list));
  }

  // Griglia 3×3 delle categorie: quanti prodotti ci sono e quanti stanno per scadere
  function categoryGrid(list) {
    const grid = h("div", "ds-cats");
    CAT.LIST.forEach(c => {
      const items = list.filter(p => catOf(p).id === c.id);
      const urgent = items.filter(p => expiryClass(p)).length;
      const b = h("button", "ds-cat-cell" + (items.length ? "" : " empty") + (urgent ? " soon" : ""));
      const ic = h("div", "ds-ic");
      ic.style.color = c.color;
      ic.style.background = c.color + "22";
      ic.innerHTML = CAT.svg(c.icon);
      b.append(ic, h("div", "ds-cat-name", c.label), h("div", "ds-cat-count", items.length ? `${items.length} ${items.length === 1 ? "prodotto" : "prodotti"}` : "vuota"));
      if (urgent) b.appendChild(h("span", "ds-badge ds-cat-badge", `${urgent} in scadenza`));
      b.addEventListener("click", () => { cat = c.id; render(); });
      grid.appendChild(b);
    });
    return grid;
  }

  function categoryIcon(p, cls) {
    const c = catOf(p);
    const ic = h("div", "ds-ic " + (cls || ""));
    ic.style.color = c.color;
    ic.style.background = c.color + "22";
    ic.innerHTML = CAT.svg(c.icon);
    return ic;
  }

  function shortExpiry(p) {
    const d = daysLeft(p);
    if (d === null || !expiryClass(p)) return "";
    return d < 0 ? "scaduto" : d === 0 ? "oggi" : d === 1 ? "domani" : `${d} gg`;
  }

  function productTiles(list) {
    const grid = h("div", "ds-tiles");
    list.forEach(p => {
      const t = h("button", "ds-tile " + expiryClass(p));
      const ic = categoryIcon(p);
      const dot = h("span", "ds-zone-dot");
      dot.innerHTML = CAT.svg(ZONE_ICON[p.location] || "box");
      ic.appendChild(dot);
      const foot = h("div", "ds-tile-foot");
      foot.appendChild(h("span", "ds-qty", qty(p.quantity, p.unit)));
      const se = shortExpiry(p);
      if (se) foot.appendChild(h("span", "ds-badge", se));
      t.append(ic, h("div", "ds-tile-name", p.name), foot);
      t.addEventListener("click", () => openSheet(p));
      grid.appendChild(t);
    });
    return grid;
  }

  function productList(list) {
    const box = h("div", "ds-list");
    list.forEach(p => {
      const c = catOf(p);
      const r = h("button", "card ds-row " + expiryClass(p));
      const info = h("div", "ds-info");
      const cat = h("div", "ds-cat", c.label);
      cat.style.color = c.color;
      info.append(cat, h("div", "ds-name", p.name));
      const meta = h("div", "ds-meta");
      meta.appendChild(h("span", "ds-chip", qty(p.quantity, p.unit)));
      meta.appendChild(h("span", "ds-chip ds-exp", expiryText(p) || "senza scadenza"));
      info.appendChild(meta);
      r.append(p.image_path && photos[p.image_path] ? thumb(p, "photo") : categoryIcon(p, "photo"), info);
      r.addEventListener("click", () => openSheet(p));
      box.appendChild(r);
    });
    return box;
  }

  function recipeCard(item) {
    const o = item.planned;
    const c = h("div", "card ds-recipe" + (o.miss.length ? "" : " ready") + (o.urgent.length ? " urgent" : ""));
    const top = h("div", "ds-r-top");
    top.append(h("span", "ds-r-when", `${D.iso(item.date) === D.iso(D.today()) ? "Oggi" : DAY_LONG[D.key(item.date)]} · ${item.block.title.split("—")[0].trim()}`),
      h("span", "ds-r-badge", o.miss.length ? `mancano ${o.miss.length}` : "hai tutto"));
    c.append(top, h("div", "ds-r-title", o.variant.title.split("—").pop().trim()), h("div", "ds-r-desc", o.variant.description));
    const ing = h("div", "ds-ings");
    o.have.forEach(i => ing.appendChild(h("span", "ds-ing ok", i)));
    o.miss.forEach(i => ing.appendChild(h("span", "ds-ing miss", i)));
    c.appendChild(ing);
    if (o.urgent.length) c.appendChild(h("div", "ds-r-urgent", "Usa prima: " + o.urgent.map(p => `${p.name} (${expiryText(p)})`).join(", ")));
    const alt = item.alternatives.filter(a => a.score > o.score || (!a.miss.length && o.miss.length));
    if (alt.length) {
      const a = alt.sort((x, y) => y.score - x.score)[0];
      c.appendChild(h("div", "ds-r-alt", `In alternativa, sempre dal piano: ${a.variant.title.split("—").pop().trim()}` + (a.miss.length ? ` (mancano: ${a.miss.join(", ")})` : " (hai tutto)")));
    }
    return c;
  }

  function renderRecipes() {
    const items = upcomingMeals();
    const main = h("div", "ds-r-list"), side = h("div", "wk-side");
    ui.body.append(main, side);
    // Prima i pasti che usano prodotti in scadenza, poi in ordine di giorno
    items.slice().sort((a, b) => (b.planned.urgent.length > 0) - (a.planned.urgent.length > 0) || a.date - b.date)
      .forEach(it => main.appendChild(recipeCard(it)));
    if (!items.length) main.appendChild(h("div", "sec-empty", "Nessuna ricetta nel piano dei prossimi giorni."));

    // Colonna: prodotti da consumare presto e lista della spesa per la settimana
    const soon = data.products.filter(p => expiryClass(p)).sort((a, b) => daysLeft(a) - daysLeft(b));
    const c1 = h("div", "card ds-side");
    c1.appendChild(h("h2", "zone-h", "Da consumare presto"));
    if (!soon.length) c1.appendChild(h("div", "wk-hint", "Niente in scadenza nei prossimi 3 giorni."));
    soon.forEach(p => { const r = h("div", "ds-side-row " + expiryClass(p)); r.append(h("span", null, p.name), h("span", "ds-exp", expiryText(p))); c1.appendChild(r); });
    const shop = new Set();
    items.forEach(it => it.planned.miss.forEach(i => shop.add(i)));
    const c2 = h("div", "card ds-side");
    c2.appendChild(h("h2", "zone-h", "Da comprare per la settimana"));
    if (!shop.size) c2.appendChild(h("div", "wk-hint", "Hai tutto per le ricette del piano."));
    const ings = h("div", "ds-ings");
    [...shop].sort().forEach(i => ings.appendChild(h("span", "ds-ing miss", i)));
    c2.appendChild(ings);
    c2.appendChild(h("div", "wk-hint ds-note", "Gli ingredienti sono confrontati con i nomi dei prodotti: \"pesce\" non riconosce \"merluzzo\"."));
    side.append(c1, c2);
  }

  // ---------- Scheda prodotto (modifica o nuovo) ----------
  function closeSheet() { ui.sheet.hidden = true; ui.sheet.innerHTML = ""; }
  // prefill: dati già noti per un prodotto nuovo (dal codice a barre); note: riga di spiegazione in alto
  function openSheet(p, prefill, note) {
    const isNew = !p;
    const draft = isNew
      ? Object.assign({ name: "", quantity: 1, unit: "pz", location: zone || (cat ? CAT.placeFor(cat) : "dispensa"), expiry_date: null, category: cat, barcode: null }, prefill || {})
      : { quantity: Number(p.quantity), unit: p.unit, location: p.location, expiry_date: p.expiry_date, category: p.category || null };
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box ds-box");
    const head = h("div", "ds-box-head");
    if (!isNew) head.appendChild(p.image_path && photos[p.image_path] ? thumb(p, "big") : categoryIcon(p, "big"));
    const title = h("div");
    title.appendChild(h("h3", null, isNew ? "Nuovo prodotto" : p.name));
    if (!isNew && p.id === null) title.appendChild(h("p", null, "In invio all'archivio…"));
    if (note) title.appendChild(h("p", "ds-note-line", note));
    head.appendChild(title);
    box.appendChild(head);

    let nameIn = null;
    if (isNew) {
      nameIn = h("input", "field");
      nameIn.placeholder = "Nome (es. Pasta Barilla)";
      nameIn.value = draft.name;
      nameIn.addEventListener("input", () => { draft.name = nameIn.value; paintCats(); });
      box.appendChild(nameIn);
    }

    // Categoria: quella scelta a mano, altrimenti quella capita dal nome (segnata come "auto")
    const cats = h("div", "ds-catpick");
    const currentCat = () => draft.category || CAT.categoryOf(isNew ? draft.name : p.name, draft.location).id;
    function paintCats() {
      const cur = currentCat();
      cats.querySelectorAll("button").forEach(b => {
        b.classList.toggle("on", b.dataset.cat === cur);
        b.classList.toggle("auto", b.dataset.cat === cur && !draft.category);
      });
    }
    CAT.LIST.forEach(c => {
      const b = h("button", "ds-catpick-b");
      b.dataset.cat = c.id;
      b.style.setProperty("--c", c.color);
      b.innerHTML = CAT.svg(c.icon) + `<span>${c.label}</span>`;
      b.addEventListener("click", () => { draft.category = c.id; paintCats(); });
      cats.appendChild(b);
    });
    box.appendChild(cats);
    paintCats();
    // Quantità con −/+
    const qRow = h("div", "ds-qrow");
    const minus = h("button", "dt-en", "−"), plus = h("button", "dt-en", "+");
    const qVal = h("input", "field ds-qval");
    qVal.inputMode = "decimal";
    const showQ = () => (qVal.value = String(draft.quantity).replace(".", ","));
    showQ();
    qVal.addEventListener("input", () => { const n = parseFloat(qVal.value.replace(",", ".")); if (isFinite(n)) draft.quantity = n; });
    minus.addEventListener("click", () => { draft.quantity = Math.max(0, Math.round((draft.quantity - STEP[draft.unit]) * 100) / 100); showQ(); });
    plus.addEventListener("click", () => { draft.quantity = Math.round((draft.quantity + STEP[draft.unit]) * 100) / 100; showQ(); });
    const unit = h("select", "field ds-unit");
    UNITS.forEach(u => { const o = h("option", null, u); o.value = u; unit.appendChild(o); });
    unit.value = draft.unit;
    unit.addEventListener("change", () => (draft.unit = unit.value));
    qRow.append(minus, qVal, plus, unit);
    box.appendChild(qRow);

    const zones = h("div", "ds-zones");
    ZONES.forEach(([id, label]) => {
      const b = h("button", "pill small" + (draft.location === id ? " on" : ""), label);
      b.addEventListener("click", () => { draft.location = id; zones.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); paintCats(); });
      zones.appendChild(b);
    });
    box.appendChild(zones);

    const expRow = h("div", "ds-exprow");
    const exp = h("input", "field");
    exp.type = "date";
    exp.value = draft.expiry_date || "";
    exp.addEventListener("change", () => (draft.expiry_date = exp.value || null));
    const noExp = h("button", "pill small", "senza scadenza");
    noExp.addEventListener("click", () => { exp.value = ""; draft.expiry_date = null; });
    expRow.append(h("span", "wk-hint", "Scadenza"), exp, noExp);
    box.appendChild(expRow);

    const row = h("div", "row");
    const cancel = h("button", null, "Annulla");
    cancel.addEventListener("click", closeSheet);
    const ok = h("button", "primary", isNew ? "Aggiungi" : "Salva");
    ok.addEventListener("click", () => {
      if (isNew) {
        const name = nameIn.value.trim();
        if (!name) return K.toast("Scrivi il nome del prodotto");
        addProduct({ name, quantity: draft.quantity, unit: draft.unit, location: draft.location, expiry_date: draft.expiry_date, category: draft.category || null, barcode: draft.barcode || null });
      } else {
        if (p.id === null) return K.toast("Aspetta che il prodotto arrivi all'archivio");
        saveProduct(p, { quantity: draft.quantity, unit: draft.unit, location: draft.location, expiry_date: draft.expiry_date, category: draft.category || null });
        closeSheet();
      }
    });
    row.append(cancel, ok);
    if (!isNew && p.id !== null) {
      let armed = false;
      const del = h("button", "ds-del", "Elimina");
      del.addEventListener("click", () => {
        if (armed) return removeProduct(p);
        armed = true; del.textContent = "Tocca ancora per eliminare";
        setTimeout(() => { armed = false; del.textContent = "Elimina"; }, 3000);
      });
      row.appendChild(del);
    }
    box.appendChild(row);
    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
  }

  // ---------- Lista della spesa ----------
  function inList(name) {
    const n = norm(name);
    return (data.shopping || []).some(i => !i.done && (norm(i.name) === n || norm(i.name).includes(n) || n.includes(norm(i.name))));
  }
  function addItem(name, amount, source) {
    name = name.trim();
    if (!name) return;
    data.shopping.push({ id: null, name, amount: amount || "", done: false, source: source || "mano", created_at: new Date().toISOString() });
    DB.insert("shopping_items", { name, amount: amount || "", source: source || "mano" }).then(refresh);
    render();
  }
  function toggleItem(i) {
    if (i.id === null) return K.toast("Un attimo: lo sto ancora salvando");
    i.done = !i.done;
    DB.update("shopping_items", `id=eq.${i.id}`, { done: i.done });
    render();
  }
  function removeItems(items) {
    items.filter(i => i.id !== null).forEach(i => DB.update("shopping_items", `id=eq.${i.id}`, { deleted_at: new Date().toISOString() }));
    data.shopping = data.shopping.filter(i => !items.includes(i));
    render();
  }
  // Suggerimenti: prodotti finiti o scaduti e ingredienti che mancano per le ricette dei prossimi giorni
  function suggestions() {
    const out = [], seen = new Set();
    const push = (name, source, why) => { const k = norm(name); if (seen.has(k) || inList(name)) return; seen.add(k); out.push({ name, source, why }); };
    data.products.filter(p => Number(p.quantity) <= 0).forEach(p => push(p.name, "finito", "finito"));
    data.products.filter(p => expiryClass(p) === "expired").forEach(p => push(p.name, "scaduto", expiryText(p)));
    upcomingMeals().forEach(m => m.planned.miss.forEach(i => push(i, "ricetta", `${DAY_LONG[D.key(m.date)]}: ${m.planned.variant.title.split("—").pop().trim()}`)));
    return out;
  }

  function renderShopping() {
    if (!data.shopping) {
      ui.body.appendChild(h("div", "sec-empty", "La lista della spesa non è ancora pronta nell'archivio: va eseguito il file 06_lista_spesa.sql su Supabase."));
      return;
    }
    const main = h("div", "card sp-main"), side = h("div", "wk-side");
    ui.body.append(main, side);

    const form = h("div", "sp-form");
    const name = h("input", "field sp-name"); name.placeholder = "Cosa devi comprare?";
    const amount = h("input", "field sp-amount"); amount.placeholder = "quanto";
    const add = h("button", "pill primary", "Aggiungi");
    const submit = () => { addItem(name.value, amount.value.trim(), "mano"); };
    add.addEventListener("click", submit);
    name.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    form.append(name, amount, add);
    main.appendChild(form);

    const todo = data.shopping.filter(i => !i.done), done = data.shopping.filter(i => i.done);
    if (!data.shopping.length) main.appendChild(h("div", "wk-hint sp-empty", "La lista è vuota. Aggiungi qualcosa qui sopra o dai suggerimenti."));
    const row = i => {
      const r = h("div", "sp-item" + (i.done ? " done" : ""));
      const tick = h("button", "dt-tick", i.done ? "✓" : "");
      tick.addEventListener("click", () => toggleItem(i));
      const body = h("div", "sp-body");
      body.appendChild(h("span", "sp-text", i.name));
      if (i.amount) body.appendChild(h("span", "sp-amt", i.amount));
      if (SOURCE_LABEL[i.source]) body.appendChild(h("span", "sp-src", SOURCE_LABEL[i.source]));
      const del = h("button", "dt-del", "✕");
      del.addEventListener("click", () => removeItems([i]));
      r.append(tick, body, del);
      return r;
    };
    todo.forEach(i => main.appendChild(row(i)));
    if (done.length) {
      const head = h("div", "sp-done-head");
      head.appendChild(h("h2", "zone-h", `Nel carrello (${done.length})`));
      const clear = h("button", "pill small", "Togli i comprati");
      clear.addEventListener("click", () => removeItems(done));
      head.appendChild(clear);
      main.appendChild(head);
      done.forEach(i => main.appendChild(row(i)));
    }

    const sug = suggestions();
    const c = h("div", "card ds-side");
    c.appendChild(h("h2", "zone-h", "Suggeriti"));
    if (!sug.length) c.appendChild(h("div", "wk-hint", "Niente da suggerire: hai tutto per le ricette dei prossimi giorni."));
    sug.forEach(sg => {
      const r = h("button", "sp-sug");
      const t = h("div");
      t.append(h("div", "sp-text", sg.name), h("div", "sp-why", sg.why));
      r.append(h("span", "sp-plus", "+"), t);
      r.addEventListener("click", () => addItem(sg.name, "", sg.source));
      c.appendChild(r);
    });
    if (sug.length > 1) {
      const all = h("button", "pill small sp-all", "Aggiungi tutti");
      all.addEventListener("click", () => sug.forEach(sg => addItem(sg.name, "", sg.source)));
      c.appendChild(all);
    }
    side.appendChild(c);
  }

  // ---------- Riquadri della pagina Cucina (Dispensa e Lista spesa) ----------
  // Usano l'ultima copia salvata sul tablet e la aggiornano se c'è l'accesso
  async function renderTiles(fresh) {
    const tD = document.querySelector("#tileDispensa .tile-sub"), tS = document.querySelector("#tileSpesa .tile-sub");
    if (!tD || !DB.configured) return;
    let d = data;
    if (!d) { try { d = await loadAll(true); } catch (e) { d = null; } }
    if (fresh && DB.signedIn) { try { d = data = await loadAll(false); } catch (e) { } }
    if (!d) return;
    const prev = data; data = d;   // le funzioni sulle scadenze leggono "data"
    const urgent = d.products.filter(p => expiryClass(p)).sort((a, b) => daysLeft(a) - daysLeft(b));
    tD.textContent = `${d.products.length} prodotti` + (urgent.length ? ` · ${urgent.map(p => `${p.name} ${shortExpiry(p)}`).slice(0, 2).join(", ")}` : " · niente in scadenza");
    if (tS && d.shopping) {
      const n = d.shopping.filter(i => !i.done).length;
      tS.textContent = n ? `${n} da comprare: ${d.shopping.filter(i => !i.done).slice(0, 3).map(i => i.name).join(", ")}` : "Lista vuota";
    }
    data = prev || d;
  }
  window.LeiDispensa = { renderTiles };

  S.register("dispensa", {
    open(el, opts) {
      root = el;
      tab = opts && opts.tab ? opts.tab : "prodotti";
      cat = null;
      build(el);
      if (data) { render(); loadPhotos(); }
      else {
        ui.body.appendChild(h("div", "sec-empty", "Carico la dispensa…"));
        loadAll(true).then(d => { if (!data) { data = d; render(); } }).catch(() => { });
      }
      refresh();
    },
    close() {
      window.LeiScanner.close();
      root = null;
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      DB.flush();
      renderTiles(false);
    },
    // Back: prima lo scanner, poi la scheda, poi dalla categoria alla griglia
    back() {
      if (window.LeiScanner.close()) return true;
      if (ui.sheet && !ui.sheet.hidden) { closeSheet(); return true; }
      if (tab === "prodotti" && cat) { cat = null; render(); return true; }
      return false;
    },
    sync() { if (root && ui.sync) S.syncLabel(ui.sync); }
  });
  renderTiles(false);
})();
