// Pulsante SYNC (tablet e iPhone): invia subito le modifiche in coda e dice com'è andata.
// I dati non passano da un dispositivo all'altro: tutti e due leggono e scrivono lo stesso archivio online,
// quindi "sincronizzare" vuol dire svuotare la coda e rileggere l'archivio.
(function () {
  const DB = window.LeiDB;
  const KEY = "lei.sync.last";

  function last() { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } }
  function when(ms) {
    if (!ms) return "mai";
    const d = new Date(ms), today = new Date();
    const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === today.toDateString() ? "oggi alle " + hm : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " alle " + hm;
  }

  // Stato in una riga, per l'etichetta sotto il pulsante
  function status() {
    if (!DB.configured) return "Archivio non configurato";
    if (!DB.signedIn) return "Non collegato all'archivio";
    if (DB.pending) return `${DB.pending} ${DB.pending === 1 ? "modifica" : "modifiche"} da inviare` + (DB.online ? "" : " · senza rete");
    return "Tutto sincronizzato · " + when(last());
  }

  let running = null;
  function run() {
    if (running) return running;
    running = (async () => {
      if (!DB.configured) return "Archivio online non configurato";
      if (!DB.signedIn) return "Accedi prima: apri una sezione e inserisci email e password";
      await DB.flush();
      // Una lettura leggera per sapere se l'archivio risponde (e se l'accesso è ancora valido)
      try { await DB.load("products?select=id&limit=1"); } catch (e) { }
      if (DB.pending) return DB.online ? `${DB.pending} modifiche non ancora accettate: riprovo da solo` : "Senza rete: le modifiche partiranno appena torna";
      if (!DB.online) return "Senza rete: riprova più tardi";
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { }
      window.dispatchEvent(new Event("lei-synced"));   // le schermate rileggono i dati
      // Giornata: piano e calendario riletti subito (sull'iPhone il calendario arriva dall'indirizzo iCal)
      const cal = window.LeiGiornata ? await window.LeiGiornata.refresh(true) : "ok";
      if (cal === "errore") return "Sincronizzato · calendario non raggiungibile, resta l'ultima copia";
      return window.LeiGiornata && !window.LeiGiornata.native && cal === "ok" ? "Sincronizzato · calendario aggiornato" : "Sincronizzato";
    })().finally(() => { running = null; });
    return running;
  }

  // Quando l'app torna in primo piano prova a inviare quello che è rimasto in coda
  document.addEventListener("visibilitychange", () => { if (!document.hidden && DB.signedIn && DB.pending) DB.flush(); });

  window.LeiSync = { run, status, last, when };

  // Tablet: pulsante tondo nella barra in basso (sull'iPhone il pulsante lo gestisce web/core.js).
  // Il puntino dorato indica modifiche ancora da inviare.
  const tb = document.querySelector(".bottombar #syncBtn");
  if (tb && window.LeiCore) {
    const K = window.LeiCore;
    tb.innerHTML = K.svg("sync");
    const paint = () => { tb.classList.toggle("pending", DB.pending > 0); tb.title = status(); };
    tb.addEventListener("click", async () => {
      tb.classList.add("spin");
      const msg = await run();
      tb.classList.remove("spin");
      K.toast(msg);
      paint();
      if (msg === "Sincronizzato" && window.LeiDispensa) window.LeiDispensa.renderTiles(true);
    });
    DB.onChange(paint);
    paint();
  }
})();
