// Lei per iPhone: guscio della web app. Prende il posto di app.js (che sul tablet disegna la Home)
// e offre alle sezioni le stesse funzioni (window.LeiCore), con il ponte Android sostituito dal browser.
(function () {
  const C = window.LEI_CONFIG;
  const $ = s => document.querySelector(s);

  // ---- Ponte: sul tablet è Java, qui fa quello che può fare Safari ----
  const L = {
    launch: () => false,
    isInstalled: () => false,
    openUrl: u => { window.location.href = u; },
    share: text => {
      if (navigator.share) navigator.share({ text }).catch(() => { });
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Copiato"));
    },
    vibrate: ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } },
    keepScreenOn: () => { },
    notify: msg => toast(msg)
  };

  // Icone a linea sottile, le stesse del tablet
  const ICONS = {
    leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    dumbbell: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>',
    basket: '<path d="M3 10h18l-2 9H5z"/><path d="M8 10l4-6 4 6M9 14v2M15 14v2"/>',
    house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13h2"/>',
    discs: '<rect x="4" y="5" width="9" height="14" rx="1"/><circle cx="16" cy="12" r="5"/><circle cx="16" cy="12" r="1"/>',
    sync: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    check: '<path d="M4 12l5 5L20 6"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

  // ---- Messaggio breve in basso ----
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  function closeOverlays() {
    if (window.LeiSections && window.LeiSections.isOpen()) window.LeiSections.close();
  }

  window.LeiCore = {
    L, svg, toast, closeOverlays,
    overlayOpen: () => !!(window.LeiSections && window.LeiSections.isOpen()),
    refreshHome: () => { tick(); renderSync(); }
  };

  // ---- Saluto, ora e data ----
  function tick() {
    const now = new Date(), h = now.getHours();
    const saluto = h < 5 ? "Buonanotte" : h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
    $("#greeting").textContent = `${saluto}, ${C.name}`;
    $("#clock").textContent = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    $("#date").textContent = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  }

  // ---- Pulsanti delle sezioni ----
  function setupCards() {
    document.querySelectorAll("[data-sec]").forEach(b => {
      b.querySelector(".w-icon").innerHTML = svg(b.dataset.icon);
      b.addEventListener("click", () => {
        const opts = b.dataset.tab ? { tab: b.dataset.tab } : undefined;
        window.LeiSections.open(b.dataset.sec, opts);
      });
    });
  }

  // ---- SYNC ----
  function renderSync() {
    $("#syncState").textContent = window.LeiSync.status();
    $("#syncBtn").classList.toggle("pending", window.LeiDB.pending > 0);
  }
  function setupSync() {
    const btn = $("#syncBtn");
    btn.querySelector(".w-sync-icon").innerHTML = svg("sync");
    btn.addEventListener("click", async () => {
      btn.classList.add("spin");
      const msg = await window.LeiSync.run();
      btn.classList.remove("spin");
      toast(msg);
      renderSync();
    });
    window.LeiDB.onChange(renderSync);
    window.addEventListener("lei-synced", () => window.LeiDispensa && window.LeiDispensa.renderTiles(true));
    renderSync();
  }

  // ---- Chiudere una sezione con lo scorrimento dal bordo sinistro (su iPhone non c'è il tasto Back) ----
  function setupEdgeSwipe() {
    let x0 = null, y0 = 0;
    document.addEventListener("touchstart", e => {
      const t = e.touches[0];
      x0 = window.LeiSections.isOpen() && t.clientX < 24 ? t.clientX : null;
      y0 = t.clientY;
    }, { passive: true });
    document.addEventListener("touchend", e => {
      if (x0 === null) return;
      const t = e.changedTouches[0];
      if (t.clientX - x0 > 80 && Math.abs(t.clientY - y0) < 60) {
        if (!window.LeiSections.back()) window.LeiSections.close();
      }
      x0 = null;
    }, { passive: true });
  }

  window.addEventListener("DOMContentLoaded", () => {
    tick();
    setInterval(tick, 10000);
    setupCards();
    setupSync();
    setupEdgeSwipe();
  });

  // Copia per l'uso senza rete e aggiornamenti automatici
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { });
  }
})();
