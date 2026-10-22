// Giornata di Lei, comune a tablet e iPhone: impegni di Google Calendar + pasti e allenamento del piano settimanale.
// Pasti solo per nome (Colazione, Spuntino, Pranzo, Cena): il dettaglio sta nella sezione Dieta.
// Impegni: sul tablet dal ponte Android (upcomingEvents), sull'iPhone dalla funzione "calendario" di Supabase,
// che legge l'indirizzo segreto iCal salvato nell'archivio (settings 'calIcs').
// Uso: LeiGiornata.day(offset) → { allDay, items }, .render(ol, opts), .next(n), .refresh(), evento "lei-giornata".
(function () {
  const C = window.LEI_CONFIG || {};
  const pad = n => String(n).padStart(2, "0");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("lei.gi." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("lei.gi." + k, JSON.stringify(v)); } catch (e) { } }
  };
  const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const BLOCKS = "plan_blocks?type=in.(meal,training)&select=day,id,time,time_range,type,title&order=position";
  const EVENTS_EVERY = 10 * 60000;   // sull'iPhone il calendario si riscarica al massimo ogni 10 minuti

  const ICONS = {
    cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M9 3v3M12 3v3"/>',
    apple: '<path d="M12 7c-1.5-1.2-5-1.5-6.5 1.5S5 16 7.5 19c1.4 1.7 3 1.5 4.5.8 1.5.7 3.1.9 4.5-.8 2.5-3 3.5-7.5 2-10.5S13.5 5.8 12 7z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
    fork: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c-2 1-3 4-3 7h3"/>',
    moon: '<path d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    dumbbell: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.sun}</svg>`;

  const toMin = s => { const [h, m] = String(s).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const hhmm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

  // Pasti del piano ridotti al nome: "Pranzo — Couscous" → Pranzo, "Merenda pomeriggio" → Spuntino
  function meal(title) {
    const t = String(title || "").toLowerCase();
    if (t.includes("colazione")) return { label: "Colazione", icon: "cup" };
    if (t.includes("spuntino") || t.includes("merenda")) return { label: "Spuntino", icon: "apple" };
    if (t.includes("pranzo")) return { label: "Pranzo", icon: "fork" };
    if (t.includes("cena")) return { label: "Cena", icon: "moon" };
    return { label: String(title || "Pasto").split(" — ")[0], icon: "fork" };
  }

  // ---------- Dati ----------
  let blocks = store.get("blocks", null);      // null = piano mai scaricato (si usa C.routine)
  let events = store.get("events", { at: 0, list: [] });
  let linked = store.get("linked", null);      // iPhone: indirizzo iCal salvato nell'archivio?
  const bridge = () => window.Lei && typeof window.Lei.upcomingEvents === "function";

  function bridgeEvents() {
    try { const v = JSON.parse(window.Lei.upcomingEvents() || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }

  // Rilegge piano e calendario. Restituisce "ok", "nolink" (manca l'indirizzo iCal), "errore" (calendario non
  // raggiungibile: resta l'ultima copia) o "accesso" (archivio non collegato).
  let refreshing = null;
  function refresh(force) {
    const DB = window.LeiDB;
    if (!DB || !DB.signedIn) return Promise.resolve("accesso");
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let changed = false, result = "ok";
      try {
        const rows = await DB.load(BLOCKS);
        if (JSON.stringify(rows) !== JSON.stringify(blocks)) { blocks = rows; store.set("blocks", rows); changed = true; }
      } catch (e) { }
      if (!bridge() && (force || Date.now() - events.at > EVENTS_EVERY)) {
        const j = await DB.fn("calendario");
        if (!j || j.error) result = "errore";
        if (j && Array.isArray(j.events)) {
          if (!j.linked) result = "nolink";
          if (j.linked !== linked) { linked = j.linked; store.set("linked", linked); changed = true; }
          if (!j.error || j.events.length) {
            changed = changed || JSON.stringify(j.events) !== JSON.stringify(events.list);
            events = { at: Date.now(), list: j.events };
            store.set("events", events);
          }
        }
      }
      if (changed) window.dispatchEvent(new Event("lei-giornata"));
      return result;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  // Indirizzo segreto iCal (solo iPhone): lo salva nell'archivio e riscarica il calendario.
  // Restituisce "ok", "formato" (non è un indirizzo iCal di Google) o "pubblico" (l'indirizzo pubblico funziona
  // solo con il calendario reso pubblico: serve quello segreto, che contiene "private-").
  async function link(url) {
    const u = String(url || "").trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https:\/\/calendar\.google\.com\/calendar\/ical\/\S+\.ics$/.test(u)) return "formato";
    if (!/\/private-[^/]+\//.test(u)) return "pubblico";
    window.LeiDB.save("settings", { key: "calIcs", value: u }, "user_id,key");
    await window.LeiDB.flush();
    await refresh(true);
    return "ok";
  }

  // ---------- Elementi di un giorno (offset 0 = oggi, 1 = domani) ----------
  function day(offset) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (offset || 0));
    const t0 = d.getTime(), t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const allDay = [], items = [];
    (bridge() ? bridgeEvents() : events.list).filter(e => e.begin < t1 && e.end > t0).forEach(e => {
      const title = e.title || "(senza titolo)";
      if (e.allDay) { allDay.push(title); return; }
      const s = Math.max(0, Math.round((e.begin - t0) / 60000));
      const en = Math.min(1440, Math.round((e.end - t0) / 60000));
      items.push({ start: s, end: Math.max(en, s + 15), label: title, icon: "cal", kind: "event" });
    });
    if (blocks) {
      blocks.filter(b => b.day === DAYS[d.getDay()]).forEach(b => {
        const s = toMin(b.time);
        if (b.type === "training") {
          const r = String(b.time_range || "").split(/[–-]/);
          const en = r[1] ? toMin(r[1]) : s + 60;
          items.push({ start: s, end: en > s ? en : s + 60, label: b.title, icon: "dumbbell", kind: "training" });
        } else {
          const m = meal(b.title);
          items.push({ start: s, end: s + 30, label: m.label, icon: m.icon, kind: "meal" });
        }
      });
    } else {
      (C.routine || []).forEach(r => {
        const s = toMin(r.time);
        items.push({ start: s, end: s + 45, label: r.label, icon: r.icon || "sun", kind: "meal" });
      });
    }
    items.sort((a, b) => a.start - b.start || (a.kind === "event" ? -1 : 1));
    return { allDay, items };
  }

  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  // Prossimi n elementi (quello in corso compreso); se oggi non basta, quelli di domani
  function next(n) {
    const now = nowMin();
    const out = day(0).items.filter(it => it.end > now).map(it => ({ ...it, live: it.start <= now, when: it.start <= now ? "adesso" : hhmm(it.start) }));
    if (out.length < n) day(1).items.slice(0, n - out.length).forEach(it => out.push({ ...it, tomorrow: true, when: `domani ${hhmm(it.start)}` }));
    return out.slice(0, n);
  }

  function relTime(mins) {
    if (mins < 1) return "adesso";
    if (mins < 60) return `tra ${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `tra ${h} h ${m} min` : `tra ${h} h`;
  }

  // ---------- Linea del tempo ----------
  // opts.offset: giorno (0 = oggi, con la linea "adesso"); opts.items: elementi già calcolati
  function render(ol, opts) {
    opts = opts || {};
    const items = opts.items || day(opts.offset || 0).items;
    const today = !opts.offset, now = nowMin();
    ol.innerHTML = "";
    let nowPlaced = !today;
    const nowLine = () => {
      const li = document.createElement("li");
      li.className = "now-line";
      li.innerHTML = `<span class="tl-time">${hhmm(now)}</span><span class="tl-bar"></span>`;
      return li;
    };
    items.forEach(it => {
      if (!nowPlaced && it.start > now) { ol.appendChild(nowLine()); nowPlaced = true; }
      const past = today && it.end <= now, live = today && it.start <= now && it.end > now;
      const li = document.createElement("li");
      li.className = `tl-item ${it.kind}${past ? " past" : ""}${live ? " live" : ""}`;
      li.innerHTML = `<span class="tl-time">${hhmm(it.start)}</span><span class="tl-dot">${svg(it.icon)}</span><span class="tl-label"></span>`;
      li.querySelector(".tl-label").textContent = it.kind === "training" ? `${it.label} · ${hhmm(it.start)}–${hhmm(it.end)}` : it.label;
      ol.appendChild(li);
    });
    if (!nowPlaced) ol.appendChild(nowLine());
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "tl-empty";
      li.textContent = "Giornata libera";
      ol.appendChild(li);
    }
    return ol.querySelector(".now-line");
  }

  window.LeiGiornata = {
    day, next, render, refresh, link, svg, hhmm, relTime, nowMin,
    get linked() { return bridge() ? true : linked; },
    get native() { return bridge(); }
  };

  // Primo scaricamento appena l'archivio è pronto e al ritorno sull'app; Sincronizza (sync.js) lo rifà subito
  window.addEventListener("DOMContentLoaded", () => setTimeout(() => refresh(), 400));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
