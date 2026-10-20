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
  let root = null, ui = {}, data = null, tab = "prodotti", photos = {};
  let cat = null;            // categoria aperta (null = griglia 3×3 delle categorie)
  // Colonne aggiunte dopo: category (08_categoria_prodotti.sql), nutrition (09_valori_nutrizionali.sql).
  // Se una manca nell'archivio si legge senza e non la si invia (la riga verrebbe rifiutata).
  const EXTRA = ["category", "nutrition"];
  const cols = { category: true, nutrition: true };
  const catOf = p => CAT.categoryOf(p.name, p.location, p.category);

  // ---------- Dati ----------
  async function loadProducts(get, cacheOnly) {
    const path = list => `products?deleted_at=is.null&select=id,name,quantity,unit,location,expiry_date,image_path,barcode${list.map(c => "," + c).join("")}&order=name`;
    let want = EXTRA.filter(c => cols[c]);
    for (;;) {
      try { return await get(path(want)); }
      catch (e) {
        if (!want.length || !(e.status === 400 || cacheOnly)) throw e;
        if (e.status === 400) cols[want[want.length - 1]] = false;   // l'ultima colonna aggiunta non c'è ancora
        want = want.slice(0, -1);
      }
    }
  }
  async function loadAll(cacheOnly) {
    const get = path => (cacheOnly ? DB.peek(path) : DB.load(path));
    const products = await loadProducts(get, cacheOnly);
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
  function forDB(values) {
    const v = Object.assign({}, values);
    EXTRA.forEach(c => { if (!cols[c]) delete v[c]; });
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

  // ---------- Open Food Facts: archivio libero e gratuito (nome, immagine, valori nutrizionali) ----------
  const OFF_FIELDS = "code,product_name_it,product_name,generic_name_it,brands,quantity,categories_tags,countries_tags,image_front_url,image_front_small_url,nutriments,nutriscore_grade,nova_group";
  const round = (n, d) => (typeof n === "number" && isFinite(n) ? Math.round(n * Math.pow(10, d)) / Math.pow(10, d) : null);

  // Scheda di Open Food Facts → dati della Dispensa
  function fromOFF(pr) {
    let name = (pr.product_name_it || pr.product_name || pr.generic_name_it || "").trim();
    const brand = String(Array.isArray(pr.brands) ? pr.brands[0] || "" : pr.brands || "").split(",")[0].trim();
    if (!name) return null;
    if (brand && !norm(name).includes(norm(brand))) name += " " + brand;
    const category = CAT.fromTags(pr.categories_tags) || CAT.guess(name);
    const n = pr.nutriments || {};
    const nutrition = {
      kcal: round(n["energy-kcal_100g"], 0), fat: round(n.fat_100g, 1), satfat: round(n["saturated-fat_100g"], 1),
      carbs: round(n.carbohydrates_100g, 1), sugars: round(n.sugars_100g, 1), fiber: round(n.fiber_100g, 1),
      protein: round(n.proteins_100g, 1), salt: round(n.salt_100g, 2),
      nutriscore: /^[a-e]$/.test(pr.nutriscore_grade || "") ? pr.nutriscore_grade : null,
      nova: pr.nova_group || null, quantity: pr.quantity || null
    };
    const hasNutrition = ["kcal", "fat", "carbs", "protein", "salt"].some(k => nutrition[k] !== null);
    return {
      name, brand, category, location: category ? CAT.placeFor(category) : "dispensa", barcode: pr.code || null,
      imageUrl: pr.image_front_url || pr.image_front_small_url || null, thumbUrl: pr.image_front_small_url || pr.image_front_url || null,
      nutrition: hasNutrition ? nutrition : null, italy: (pr.countries_tags || []).includes("en:italy")
    };
  }

  // Richiesta a un servizio esterno: sul tablet passa dal ponte Java (niente limiti del browser)
  async function getJSON(url) {
    const L = K.L, C = window.LeiCollection;
    if (L.httpGet && C && C.http) {
      const r = await C.http(url);
      try { return r.status >= 200 && r.status < 300 ? JSON.parse(r.body) : null; } catch (e) { return null; }
    }
    try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  async function lookupBarcode(code) {
    const j = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
    const pr = j && j.status === 1 && j.product;
    return pr ? fromOFF(Object.assign({ code }, pr)) : null;
  }

  // Ricerca per nome. Dal browser dell'iPhone Open Food Facts blocca le ricerche: si passa dalla
  // funzione "off-search" sul nostro Supabase (supabase/functions/off-search). Sul tablet va diretta.
  async function searchOFF(q) {
    q = q.trim();
    if (q.length < 3) return [];
    const qs = `search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=${OFF_FIELDS}`;
    let j = null;
    if (K.L.httpGet) j = await getJSON("https://world.openfoodfacts.org/cgi/search.pl?" + qs);
    else j = (await DB.fn("off-search", "q=" + encodeURIComponent(q))) || (await getJSON("https://world.openfoodfacts.org/cgi/search.pl?" + qs));
    const list = ((j && j.products) || []).map(fromOFF).filter(Boolean);
    return list.sort((a, b) => b.italy - a.italy).slice(0, 5);
  }

  // Immagine del prodotto nella cartella privata (da un indirizzo di Open Food Facts o da una foto).
  // Restituisce subito il percorso; il caricamento prosegue da solo.
  function storeImage(src) {
    const uid = DB.uid();
    if (!uid || !src) return null;
    const rel = `dispensa/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
    const full = `${uid}/${rel}`;
    photos[full] = typeof src === "string" ? src : URL.createObjectURL(src);   // anteprima finché non è caricata
    (async () => {
      try {
        const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
        await DB.uploadPhoto(rel, blob);
      } catch (e) { console.warn("Immagine non caricata", e && e.message); }
    })();
    return full;
  }

  // Completa un prodotto già in dispensa con quello che manca (immagine, valori, categoria, codice)
  function completeFrom(p, found) {
    const values = {};
    if (!p.image_path && found.imageUrl) values.image_path = storeImage(found.imageUrl);
    if (!p.nutrition && found.nutrition && cols.nutrition) values.nutrition = found.nutrition;
    if (!p.barcode && found.barcode) values.barcode = found.barcode;
    if (!p.category && found.category && cols.category) values.category = found.category;
    if (Object.keys(values).length && p.id !== null) saveProduct(p, values);
    return Object.keys(values).length > 0;
  }

  // Nuovo prodotto da un risultato online
  function rowFrom(found, extra) {
    return Object.assign({
      name: found.name, quantity: 1, unit: "pz", location: found.location, expiry_date: null,
      category: found.category || null, barcode: found.barcode || null, nutrition: found.nutrition || null,
      image_path: found.imageUrl ? storeImage(found.imageUrl) : null
    }, extra || {});
  }

  // Dalla foto: la foto diventa l'immagine del prodotto, il testo letto serve a cercarlo online
  function openPhotoSearch() {
    window.LeiScanner.open({
      mode: "photo",
      hint: "Inquadra il davanti della confezione",
      onPhoto: async blob => {
        const C = window.LeiCollection;
        K.toast("Leggo la confezione…");
        let text = "";
        try { const r = C && C.ocrCover ? await C.ocrCover(blob, () => { }) : null; text = r ? (r.title || r.lines.slice(0, 3).join(" ")) : ""; } catch (e) { }
        const results = text ? await searchOFF(text) : [];
        openSheet(null, { name: results.length ? "" : text, photoBlob: blob, results },
          results.length ? "Scegli il prodotto giusto qui sotto, o scrivi tu il nome" : text ? "Non l'ho trovato online: controlla il nome" : "Non riesco a leggere la confezione: scrivi tu il nome");
      }
    });
  }

  function openScan() {
    window.LeiScanner.open({
      hint: "Inquadra il codice a barre del prodotto",
      onManual: () => openSheet(null),
      onPhotoSearch: openPhotoSearch,
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
          openSheet(null, found ? { found } : { barcode: code },
            found ? "Trovato online: controlla e aggiungi" : "Non l'ho trovato online: scrivi tu il nome");
          return null;
        }
        if (!found) return { text: `${code} · non trovato: aggiungilo a mano`, cls: "todo" };
        addProduct(rowFrom(found, { barcode: code }));
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

  function renderProducts() {
    // Schede: Tutti (griglia 3×3) e poi le nove categorie (elenco dei prodotti)
    const bar = h("div", "ds-filters");
    const chips = h("div", "ds-chips");
    const chip = (label, active, fn, c) => {
      const b = h("button", "pill small ds-chip-b" + (active ? " on" : ""));
      if (c) { b.style.setProperty("--c", c.color); b.innerHTML = CAT.svg(c.icon); }
      b.appendChild(h("span", null, label));
      b.addEventListener("click", fn);
      chips.appendChild(b);
      if (active) requestAnimationFrame(() => b.scrollIntoView({ block: "nearest", inline: "center" }));
    };
    chip("Tutti", !cat, () => { cat = null; render(); });
    CAT.LIST.forEach(c => chip(c.label, cat === c.id, () => { cat = c.id; render(); }, c));
    const actions = h("div", "ds-actions");
    const scan = h("button", "pill ds-scan");
    scan.innerHTML = CAT.svg("barcode") + "<span>Scansiona</span>";
    scan.addEventListener("click", openScan);
    const add = h("button", "pill primary ds-add", "+ Aggiungi");
    add.addEventListener("click", () => openSheet(null));
    actions.append(scan, add);
    bar.append(chips, actions);
    ui.body.appendChild(bar);

    if (!cat) { ui.body.appendChild(categoryGrid(data.products)); return; }

    const list = data.products
      .filter(p => catOf(p).id === cat)
      .sort((a, b) => {
        const da = daysLeft(a), db = daysLeft(b);
        if (da === null && db === null) return norm(a.name).localeCompare(norm(b.name));
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    if (!list.length) {
      ui.body.appendChild(h("div", "sec-empty", "Nessun prodotto in questa categoria: aggiungilo con Scansiona o + Aggiungi."));
      return;
    }
    ui.body.appendChild(productTiles(list));
  }

  // Griglia 3×3 delle categorie: l'etichetta dorata dice quanti prodotti stanno per scadere
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
      b.append(ic, h("div", "ds-cat-name", c.label));
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
      // Con l'immagine del prodotto la foto, altrimenti l'icona della categoria
      const url = p.image_path && photos[p.image_path];
      const ic = url ? h("div", "ds-ic ds-ic-photo") : categoryIcon(p);
      if (url) {
        const img = h("img");
        img.src = url;
        img.alt = "";
        img.addEventListener("error", () => { img.remove(); const c = catOf(p); ic.classList.remove("ds-ic-photo"); ic.style.color = c.color; ic.style.background = c.color + "22"; ic.insertAdjacentHTML("afterbegin", CAT.svg(c.icon)); });
        ic.appendChild(img);
      }
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
  // prefill (prodotto nuovo): { found } da Open Food Facts, { barcode }, { name, photoBlob, results } dalla foto.
  // note: riga di spiegazione in alto.
  function openSheet(p, prefill, note) {
    const isNew = !p;
    prefill = prefill || {};
    const draft = isNew
      ? { name: prefill.name || "", quantity: 1, unit: "pz", location: cat ? CAT.placeFor(cat) : "dispensa", expiry_date: null, category: cat, barcode: prefill.barcode || null, nutrition: null, imageSrc: prefill.photoBlob || null }
      : { quantity: Number(p.quantity), unit: p.unit, location: p.location, expiry_date: p.expiry_date, category: p.category || null, imageSrc: null };
    ui.sheet.innerHTML = "";
    const box = h("div", "sheet-box ds-box");

    // Intestazione: immagine (tocca per scattare una foto), nome e spiegazione
    const head = h("div", "ds-box-head");
    const pic = h("button", "ds-pic");
    pic.setAttribute("aria-label", "Scatta una foto del prodotto");
    function paintImage() {
      pic.innerHTML = "";
      const src = draft.imageSrc ? (typeof draft.imageSrc === "string" ? draft.imageSrc : (draft.imageUrl || (draft.imageUrl = URL.createObjectURL(draft.imageSrc)))) : (!isNew && p.image_path && photos[p.image_path]);
      if (src) { const img = h("img"); img.src = src; img.alt = ""; pic.appendChild(img); }
      else {
        const c = CAT.categoryOf(isNew ? draft.name : p.name, draft.location, draft.category);
        const ic = h("div", "ds-ic big");
        ic.style.color = c.color; ic.style.background = c.color + "22";
        ic.innerHTML = CAT.svg(c.icon);
        pic.appendChild(ic);
      }
      pic.appendChild(h("span", "ds-pic-cam", "📷"));
    }
    pic.addEventListener("click", () => window.LeiScanner.open({
      mode: "photo", hint: "Fotografa il prodotto",
      onPhoto: blob => {
        draft.imageSrc = blob; draft.imageUrl = null;
        paintImage();
        if (!isNew && p.id !== null) saveProduct(p, { image_path: storeImage(blob) });
      }
    }));
    const title = h("div", "ds-box-title");
    title.appendChild(h("h3", null, isNew ? "Nuovo prodotto" : p.name));
    if (!isNew && p.id === null) title.appendChild(h("p", null, "In invio all'archivio…"));
    const noteEl = h("p", "ds-note-line", note || "");
    if (!note) noteEl.hidden = true;
    title.appendChild(noteEl);
    head.append(pic, title);
    box.appendChild(head);
    const say = t => { noteEl.textContent = t; noteEl.hidden = !t; };

    // Proposte trovate online: toccandone una si prende nome, immagine, categoria e valori
    const sugg = h("div", "ds-sugg");
    function showResults(list, onPick) {
      sugg.innerHTML = "";
      list.forEach(f => {
        const b = h("button", "ds-sugg-b");
        const im = h("div", "ds-sugg-img");
        if (f.thumbUrl) { const img = h("img"); img.src = f.thumbUrl; img.alt = ""; im.appendChild(img); }
        const t = h("div", "ds-sugg-t");
        t.append(h("div", "ds-sugg-n", f.name), h("div", "ds-sugg-s", [f.nutrition && f.nutrition.quantity, f.nutrition && f.nutrition.kcal !== null ? f.nutrition.kcal + " kcal/100 g" : ""].filter(Boolean).join(" · ")));
        b.append(im, t);
        b.addEventListener("click", () => { sugg.innerHTML = ""; onPick(f); });
        sugg.appendChild(b);
      });
    }

    let nameIn = null;
    if (isNew) {
      nameIn = h("input", "field");
      nameIn.placeholder = "Nome (es. Pasta Barilla): lo cerco online";
      nameIn.value = draft.name;
      let timer = null, seq = 0;
      nameIn.addEventListener("input", () => {
        draft.name = nameIn.value;
        paintCats(); paintImage();
        clearTimeout(timer);
        if (draft.picked || nameIn.value.trim().length < 3) { sugg.innerHTML = ""; return; }
        timer = setTimeout(async () => {
          const my = ++seq;
          sugg.innerHTML = "";
          sugg.appendChild(h("div", "wk-hint", "Cerco online…"));
          const list = await searchOFF(nameIn.value);
          if (my !== seq || ui.sheet.hidden) return;
          sugg.innerHTML = "";
          if (list.length) showResults(list, applyFound);
          else sugg.appendChild(h("div", "wk-hint", "Niente online con questo nome."));
        }, 800);
      });
      box.append(nameIn, sugg);
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
      b.addEventListener("click", () => { draft.category = c.id; paintCats(); paintImage(); });
      cats.appendChild(b);
    });
    box.appendChild(cats);

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
    function paintZones() { zones.querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.zone === draft.location)); }
    ZONES.forEach(([id, label]) => {
      const b = h("button", "pill small", label);
      b.dataset.zone = id;
      b.addEventListener("click", () => { draft.location = id; paintZones(); paintCats(); paintImage(); });
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

    // Valori nutrizionali (da Open Food Facts)
    const nutri = h("div", "ds-nutri-wrap");
    const paintNutri = () => { nutri.innerHTML = ""; const n = isNew ? draft.nutrition : p.nutrition; if (n) nutri.appendChild(nutritionBox(n)); };
    box.appendChild(nutri);

    // Prodotto già in dispensa senza immagine o valori: li cerca da solo (dal codice) o su richiesta (dal nome)
    if (!isNew && p.id !== null && (!p.image_path || (cols.nutrition && !p.nutrition))) {
      const refreshAfter = () => { paintImage(); paintNutri(); paintCats(); render(); };
      if (p.barcode) {
        lookupBarcode(p.barcode).then(f => { if (f && !ui.sheet.hidden && completeFrom(p, f)) { say("Ho aggiunto immagine e valori dal codice a barre"); refreshAfter(); } });
      } else {
        const find = h("button", "pill small ds-find", "Cerca online immagine e valori");
        find.addEventListener("click", async () => {
          find.disabled = true; find.textContent = "Cerco…";
          const list = await searchOFF(p.name);
          find.remove();
          if (!list.length) { say("Non l'ho trovato online"); return; }
          say("Quale di questi è il tuo prodotto?");
          showResults(list, f => { completeFrom(p, f); say(""); refreshAfter(); });
        });
        box.insertBefore(find, cats);
        box.insertBefore(sugg, cats);
      }
    }

    function applyFound(f) {
      draft.picked = true;
      draft.name = f.name;
      if (nameIn) nameIn.value = f.name;
      draft.category = f.category || draft.category;
      draft.location = f.location || draft.location;
      draft.barcode = f.barcode || draft.barcode;
      draft.nutrition = f.nutrition;
      if (!(draft.imageSrc instanceof Blob) && f.imageUrl) draft.imageSrc = f.imageUrl;   // la foto scattata vince
      paintImage(); paintCats(); paintZones(); paintNutri();
    }

    const row = h("div", "row");
    const cancel = h("button", null, "Annulla");
    cancel.addEventListener("click", closeSheet);
    const ok = h("button", "primary", isNew ? "Aggiungi" : "Salva");
    ok.addEventListener("click", () => {
      if (isNew) {
        const name = nameIn.value.trim();
        if (!name) return K.toast("Scrivi il nome del prodotto");
        addProduct({
          name, quantity: draft.quantity, unit: draft.unit, location: draft.location, expiry_date: draft.expiry_date,
          category: draft.category || null, barcode: draft.barcode || null, nutrition: draft.nutrition || null,
          image_path: draft.imageSrc ? storeImage(draft.imageSrc) : null
        });
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

    paintImage(); paintCats(); paintZones(); paintNutri();
    if (prefill.found) applyFound(prefill.found);
    if (prefill.results && prefill.results.length) showResults(prefill.results, applyFound);
    ui.sheet.appendChild(box);
    ui.sheet.hidden = false;
  }

  // Tabella dei valori per 100 g, con Nutri-Score
  function nutritionBox(n) {
    const box = h("div", "ds-nutri");
    const top = h("div", "ds-nutri-top");
    top.appendChild(h("span", "zone-h", "Valori per 100 g" + (n.quantity ? ` · confezione ${n.quantity}` : "")));
    if (n.nutriscore) { const ns = h("span", "ds-ns ns-" + n.nutriscore, "Nutri-Score " + n.nutriscore.toUpperCase()); top.appendChild(ns); }
    box.appendChild(top);
    const num = (v, u) => (v === null || v === undefined ? "—" : String(v).replace(".", ",") + " " + u);
    [["Energia", num(n.kcal, "kcal")], ["Grassi", num(n.fat, "g")], ["di cui saturi", num(n.satfat, "g"), true],
     ["Carboidrati", num(n.carbs, "g")], ["di cui zuccheri", num(n.sugars, "g"), true], ["Fibre", num(n.fiber, "g")],
     ["Proteine", num(n.protein, "g")], ["Sale", num(n.salt, "g")]].forEach(([label, val, sub]) => {
      const r = h("div", "ds-nutri-row" + (sub ? " sub" : ""));
      r.append(h("span", null, label), h("span", null, val));
      box.appendChild(r);
    });
    return box;
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
