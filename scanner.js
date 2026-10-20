// Lettore di codici a barre a tutto schermo (fotocamera + ZXing), usato dalla Dispensa.
// Stessa tecnica e stesso aspetto dello scanner della COLLECTION (classi col-scan-* in collection.css).
//   LeiScanner.open({ hint, onCode(code, { burst }) → Promise<{ text, cls }>, onManual, onPhotoSearch })
//   LeiScanner.open({ mode: "photo", hint, onPhoto(blob, url) }): foto quadrata con il pulsante di scatto
// Scansione singola: al primo codice chiude e chiama onCode. Raffica: chiama onCode per ogni codice nuovo
// e mostra in basso la riga restituita ({ text, cls: "ok" | "dup" | "todo" }).
(function () {
  const K = window.LeiCore;
  let cam = null, reader = null;

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function getReader() {
    if (reader || !window.ZXing) return reader;
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    return reader;
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
    K.L.vibrate && K.L.vibrate(ok ? 60 : 160);
  }

  function open(opts) {
    close();
    const box = h("div", "col-scan lei-scan");
    const video = h("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    const photo = opts.mode === "photo";
    const frame = h("div", photo ? "col-scan-frame lei-photo-frame" : "col-scan-frame");
    if (!photo) frame.appendChild(h("div", "col-scan-line"));
    const top = h("div", "col-scan-top");
    const x = h("button", "sec-close", "✕");
    x.addEventListener("click", close);
    const hint = h("div", "col-scan-hint", opts.hint || "Inquadra il codice a barre");
    top.append(x, hint);
    const status = h("div", "col-scan-status");
    const bottom = h("div", "col-scan-bottom");
    box.append(video, frame, top, status, bottom);
    document.body.appendChild(box);
    const c = cam = { opts, box, video, status, burst: false, seen: new Map(), busy: false };

    if (photo) {
      const shutter = h("button", "col-shutter");
      shutter.setAttribute("aria-label", "Scatta");
      shutter.addEventListener("click", () => snap(c));
      bottom.appendChild(shutter);
      start(c);
      return;
    }
    const tools = h("div", "col-scan-row");
    const burst = h("button", "pill small", "Raffica: no");
    burst.addEventListener("click", () => {
      c.burst = !c.burst;
      burst.classList.toggle("on", c.burst);
      burst.textContent = c.burst ? "Raffica: sì" : "Raffica: no";
      hint.textContent = c.burst ? "Raffica: passa un prodotto dopo l'altro" : (opts.hint || "Inquadra il codice a barre");
    });
    const type = h("button", "pill small", "Scrivi il codice");
    type.addEventListener("click", () => {
      const f = h("input", "field col-scan-input");
      f.inputMode = "numeric";
      f.placeholder = "Codice a barre, poi Invio";
      f.addEventListener("keydown", e => { if (e.key === "Enter" && f.value.trim()) { onCode(c, f.value.trim()); f.value = ""; } });
      tools.replaceChild(f, type);
      f.focus();
    });
    tools.append(burst, type);
    if (opts.onManual) {
      const manual = h("button", "pill small", "Senza codice");
      manual.addEventListener("click", () => { close(); opts.onManual(); });
      tools.appendChild(manual);
    }
    if (opts.onPhotoSearch) {
      const ph = h("button", "pill small", "Dalla foto");
      ph.addEventListener("click", () => { const fn = opts.onPhotoSearch; close(); fn(); });
      tools.appendChild(ph);
    }
    c.list = h("div", "col-burst");
    bottom.append(tools, c.list);
    start(c);
  }

  async function start(c) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (cam !== c) { stream.getTracks().forEach(t => t.stop()); return; }
      c.stream = stream;
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { }
      c.video.srcObject = stream;
      c.video.play().catch(() => { });
      if (c.opts.mode !== "photo") loop(c);
    } catch (e) {
      c.status.textContent = "Fotocamera non disponibile: usa \"Scrivi il codice\".";
      c.status.classList.add("show");
      console.warn("Fotocamera", e && e.name, e && e.message);
    }
  }

  function loop(c) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (cam !== c) return;
      c.timer = setTimeout(tick, 180);
      const v = c.video, r = getReader();
      if (!r || !v.videoWidth || c.busy) return;
      // Solo la fascia centrale (dove c'è il riquadro), rimpicciolita: più veloce
      const sw = v.videoWidth * 0.8, sh = v.videoHeight * 0.4;
      const sx = (v.videoWidth - sw) / 2, sy = v.videoHeight * 0.12;
      const scale = Math.min(1, 900 / sw);
      canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      try {
        const Z = window.ZXing;
        const res = r.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas))));
        r.reset();
        if (res) onCode(c, res.getText());
      } catch (e) { r.reset(); }
    };
    tick();
  }

  async function onCode(c, raw) {
    if (cam !== c) return;
    const code = String(raw).replace(/\D/g, "");
    if (code.length < 8) return;
    const last = c.seen.get(code);
    if (last && Date.now() - last < (c.burst ? 60000 : 3000)) return;   // in raffica ogni codice una volta sola
    c.seen.set(code, Date.now());
    if (!c.burst) {
      c.busy = true;
      beep(true);
      c.status.textContent = "Cerco " + code + "…";
      c.status.classList.add("show");
      const fn = c.opts.onCode;
      close();
      fn(code, { burst: false });
      return;
    }
    beep(true);
    const row = h("div", "col-burst-row", code + " · cerco…");
    c.list.prepend(row);
    try {
      const r = await c.opts.onCode(code, { burst: true });
      if (r) { row.textContent = r.text; row.className = "col-burst-row " + (r.cls || "ok"); }
    } catch (e) { row.textContent = code + " · errore"; row.className = "col-burst-row todo"; }
  }

  // Foto: ritaglio quadrato al centro, 800×800 (immagine del prodotto e lettura del testo)
  function snap(c) {
    const v = c.video;
    if (!v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight) * 0.9;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 800;
    canvas.getContext("2d").drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 800, 800);
    canvas.toBlob(blob => {
      if (!blob) return;
      const fn = c.opts.onPhoto;
      close();
      fn && fn(blob, URL.createObjectURL(blob));
    }, "image/jpeg", 0.85);
  }

  function close() {
    const c = cam;
    if (!c) return false;
    cam = null;
    clearTimeout(c.timer);
    if (c.stream) c.stream.getTracks().forEach(t => t.stop());
    c.box.remove();
    return true;
  }

  window.LeiScanner = { open, close, isOpen: () => !!cam };
})();
