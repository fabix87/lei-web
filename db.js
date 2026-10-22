// Collegamento di Lei all'archivio online (Supabase), condiviso con le app dell'iPhone.
// Accesso con il tuo utente, copia dei dati sul tablet (per aprire subito anche senza rete)
// e coda delle modifiche: se manca la rete, partono appena torna.
(function () {
  const SB = (window.LEI_CONFIG || {}).supabase || {};
  const PFX = "lei.sb.";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(PFX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(PFX + k); } catch (e) { } }
  };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { } });

  // ---------- Accesso ----------
  let session = ls.get("session", null);   // { access_token, refresh_token, expires_at (s), email }

  async function authCall(grant, body) {
    const r = await fetch(`${SB.url}/auth/v1/token?grant_type=${grant}`, {
      method: "POST",
      headers: { apikey: SB.key, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error_description || j.msg || j.message || `Errore ${r.status}`);
      err.status = r.status;
      throw err;
    }
    session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      email: (j.user && j.user.email) || (session && session.email) || ""
    };
    ls.set("session", session);
    return session;
  }

  async function signIn(email, password) {
    await authCall("password", { email: email.trim(), password });
    emit();
    flush();
  }

  function signOut() {
    session = null;
    ls.del("session");
    emit();
  }

  let refreshing = null;
  async function token() {
    if (!session) throw Object.assign(new Error("Accesso richiesto"), { status: 401 });
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    if (!refreshing) {
      refreshing = authCall("refresh_token", { refresh_token: session.refresh_token })
        .catch(e => {
          // Token non più valido (non un problema di rete): bisogna rifare l'accesso
          if (e.status === 400 || e.status === 401) signOut();
          throw e;
        })
        .finally(() => (refreshing = null));
    }
    return (await refreshing).access_token;
  }

  // ---------- Richieste ----------
  async function rest(path, opts = {}) {
    const headers = {
      apikey: SB.key,
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json"
    };
    if (opts.prefer) headers.Prefer = opts.prefer;
    const r = await fetch(`${SB.url}/rest/v1/${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    if (r.status === 401) { signOut(); throw Object.assign(new Error("Accesso scaduto"), { status: 401 }); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw Object.assign(new Error(j.message || `Errore ${r.status}`), { status: r.status });
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  // Lettura con copia locale: prova la rete, se non va restituisce l'ultima copia salvata.
  let online = true;
  async function load(path) {
    try {
      const rows = await rest(path);
      ls.set("cache." + path, rows);
      online = true;
      return rows;
    } catch (e) {
      if (e.status === 401) throw e;
      online = false;
      const cached = ls.get("cache." + path, null);
      if (cached === null) throw e;
      return cached;
    }
  }

  // Solo la copia locale (per mostrare subito la sezione mentre arrivano i dati aggiornati)
  function peek(path) {
    const cached = ls.get("cache." + path, null);
    return cached === null ? Promise.reject(new Error("nessuna copia")) : Promise.resolve(cached);
  }

  // Indirizzi temporanei (1 ora) per le foto della cartella privata. Restituisce { percorso: indirizzo }.
  async function signPhotos(paths) {
    if (!paths.length) return {};
    const r = await fetch(`${SB.url}/storage/v1/object/sign/product-photos`, {
      method: "POST",
      headers: { apikey: SB.key, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600, paths })
    });
    if (!r.ok) throw Object.assign(new Error("Indirizzi delle foto non disponibili"), { status: r.status });   // diverso da "foto che manca"
    const list = await r.json().catch(() => []);
    const out = {};
    list.forEach(x => { if (x.signedURL && !x.error) out[x.path] = `${SB.url}/storage/v1${x.signedURL}`; });
    return out;
  }

  // Identificativo dell'utente (dal token di accesso): serve per la cartella privata delle foto
  function uid() {
    try {
      const p = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(p)).sub || null;
    } catch (e) { return null; }
  }

  // Carica una foto (Blob) nella cartella privata. path = "<cartella>/<file>" dentro quella dell'utente.
  // Restituisce il percorso completo da salvare nella tabella.
  async function uploadPhoto(path, blob) {
    const full = `${uid()}/${path}`;
    const r = await fetch(`${SB.url}/storage/v1/object/product-photos/${full}`, {
      method: "POST",
      headers: { apikey: SB.key, Authorization: `Bearer ${await token()}`, "Content-Type": blob.type || "image/jpeg", "x-upsert": "true" },
      body: blob
    });
    if (!r.ok) throw Object.assign(new Error(`Foto non caricata (${r.status})`), { status: r.status });
    return full;
  }

  // Funzione sul server di Supabase (Edge Function), con l'accesso dell'utente. Restituisce il JSON o null.
  async function fn(name, query) {
    try {
      const r = await fetch(`${SB.url}/functions/v1/${name}${query ? "?" + query : ""}`, {
        headers: { apikey: SB.key, Authorization: `Bearer ${await token()}` }
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  // ---------- Modifiche con coda ----------
  // Ogni modifica è una richiesta (metodo, percorso, dati) che resta in coda finché l'archivio non la accetta.
  let outbox = ls.get("outbox", []).map(o => o.path ? o : {   // coda salvata dalla versione 0.4
    key: o.key, method: "POST", path: `${o.table}?on_conflict=${o.onConflict}`, body: [o.row],
    prefer: "resolution=merge-duplicates,return=minimal"
  });
  function enqueue(op) {
    if (op.key) outbox = outbox.filter(o => o.key !== op.key);   // vale solo l'ultima modifica della stessa riga
    outbox.push(op);
    ls.set("outbox", outbox);
    return flush();
  }

  // Inserisci o aggiorna la riga identificata dalle colonne di onConflict (es. "user_id,date,item_id")
  function save(table, row, onConflict) {
    return enqueue({
      key: table + "|" + onConflict.split(",").map(c => row[c]).join("|"),
      method: "POST", path: `${table}?on_conflict=${onConflict}`, body: [row],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }
  // Nuova riga (peso, check-in…)
  function insert(table, row) {
    return enqueue({ method: "POST", path: table, body: [row], prefer: "return=minimal" });
  }
  // Molte righe nuove in una volta; quelle che esistono già (stesse colonne di onConflict) vengono saltate
  function insertMany(table, rows, onConflict) {
    if (!rows.length) return Promise.resolve();
    return enqueue({ method: "POST", path: `${table}?on_conflict=${onConflict}`, body: rows, prefer: "resolution=ignore-duplicates,return=minimal" });
  }
  // Modifica delle righe che rispondono al filtro (es. "id=eq.12")
  function update(table, filter, values) {
    return enqueue({ key: table + "?" + filter, method: "PATCH", path: `${table}?${filter}`, body: values, prefer: "return=minimal" });
  }

  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (outbox.length && session) {
        const o = outbox[0];
        try {
          await rest(o.path, { method: o.method, body: o.body, prefer: o.prefer });
          online = true;
        } catch (e) {
          if (!e.status || e.status === 401) { online = !!e.status; break; }   // rete assente o accesso: riprova dopo
          console.warn("Modifica scartata", o, e);                             // dato rifiutato: non bloccare la coda
        }
        outbox = outbox.filter(x => x !== o);
        ls.set("outbox", outbox);
      }
    })().finally(() => { flushing = null; emit(); });
    return flushing;
  }
  window.addEventListener("online", flush);
  setInterval(() => { if (outbox.length) flush(); }, 30000);

  window.LeiDB = {
    configured: !!(SB.url && SB.key),
    get signedIn() { return !!session; },
    get email() { return session ? session.email : ""; },
    get online() { return online; },
    get pending() { return outbox.length; },
    signIn, signOut, load, peek, save, insert, insertMany, update, flush, signPhotos, uploadPhoto, uid, fn,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
