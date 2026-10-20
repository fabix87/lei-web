// Configurazione di "Lei": modifica qui zone, app e progetti Claude.
window.LEI_CONFIG = {
  name: "Fabio",

  // Archivio online condiviso con le app dell'iPhone (Dispensa, MindEasy). Vedi supabase/.
  // La chiave "publishable" è fatta per stare nelle app: i dati sono protetti dall'accesso con il tuo utente.
  supabase: {
    url: "https://icenqkbmbebesiwnxjux.supabase.co",
    key: "sb_publishable_pLvxTun18qWUvQOgTNWudA_cCJqVeVO"
  },

  claude: {
    pkg: "com.anthropic.claude",
    web: "https://claude.ai/new",
    // Incolla qui i link dei tuoi progetti Claude (es. https://claude.ai/project/xxxx).
    // Se il link è vuoto, il pulsante apre semplicemente Claude.
    // "section" apre invece una sezione interna di Lei (collegata all'archivio online).
    projects: [
      { label: "Dieta", icon: "leaf", url: "", section: "dieta" },
      { label: "Allenamento", icon: "dumbbell", url: "", section: "allenamento" },
      { label: "Dispensa", icon: "box", url: "", section: "dispensa" },
      { label: "Scrittura", icon: "pen", url: "", section: "scrittura" }
    ]
  },

  // Pagina "Giornata": momenti fissi che si uniscono agli eventi del calendario.
  // Cambia orari ed etichette come preferisci (icone: cup, fork, dumbbell, moon, sun).
  routine: [
    { time: "08:00", label: "Colazione", icon: "cup" },
    { time: "13:00", label: "Pranzo", icon: "fork" },
    { time: "18:30", label: "Allenamento", icon: "dumbbell" },
    { time: "20:00", label: "Cena", icon: "moon" }
  ],

  // COLLECTION: chiave Google Books personale e gratuita (console.cloud.google.com → Books API → Credenziali).
  // Senza chiave si usa la quota condivisa, che spesso è esaurita.
  collection: { googleBooksKey: "" },

  // Sezione Dieta: peso obiettivo (linea tratteggiata nel grafico)
  // porzioni: quantità standard dello schema della dietista (DIETA26/DIeta24), a crudo e al netto degli scarti.
  // La Dispensa le usa per scalare i prodotti quando un pasto è fatto o quando tocchi "Usato".
  dieta: {
    pesoObiettivo: 75,
    porzioni: {
      cereali: 100,        // g: pasta, riso, farro, orzo, cous cous…
      pane: 100,           // g a pasto, preferibilmente senza sale
      carne: 100,          // g
      pesce: 150,          // g
      uova: 2,             // pezzi (+ albume libero)
      formaggio: 100,      // g, formaggi magri (mozzarella, ricotta, stracchino…)
      formaggioGrasso: 50, // g (parmigiano, fontina, gorgonzola…)
      legumiSecchi: 30,    // g
      legumiCotti: 90,     // g, freschi o in scatola
      verduraCotta: 200,   // g
      verduraCruda: 80,    // g (insalata, pomodori crudi…)
      frutta: 150,         // g
      latte: 150,          // ml
      yogurt: 150          // g
    }
  },

  // Pagina "Cucina"
  cucina: {
    ricette: "com.vorwerk.cookidoo",
    spesa: "com.todoist",
    timerPresets: [1, 3, 5, 10, 15, 20, 30, 45]   // minuti
  },

  // Pagina "Focus": durate disponibili in minuti e quella proposta all'inizio
  focus: { durations: [15, 25, 45, 60], default: 25 },

  zones: [
    {
      id: "casa", title: "Casa", side: "left",
      items: [
        { label: "Google Home", pkg: "com.google.android.apps.chromecast.app" },
        { label: "Clima", pkg: "com.daikineurope.online.controller" },
        { label: "Comando vocale", action: "voice" }
      ]
    },
    {
      id: "lavoro", title: "Lavoro", side: "right",
      items: [
        { label: "Todoist", pkg: "com.todoist" },
        { label: "Gmail", pkg: "com.google.android.gm" },
        { label: "Acrobat", pkg: "com.adobe.reader" },
        { label: "Chrome", pkg: "com.android.chrome" }
      ]
    },
    {
      id: "corpo", title: "Corpo", side: "right",
      items: [
        { label: "Garmin", pkg: "com.garmin.android.apps.connectmobile" },
        { label: "Cookidoo", pkg: "com.vorwerk.cookidoo" },
        { label: "Everli", pkg: "it.supermercato24.supermercato24" }
      ]
    },
    {
      id: "relax", title: "Relax", side: "right",
      items: [
        { label: "YouTube", pkg: "com.google.android.youtube" },
        { label: "Netflix", pkg: "com.netflix.mediaclient" },
        { label: "Spotify", pkg: "com.spotify.music" },
        { label: "Audible", pkg: "com.audible.application" }
      ]
    }
  ]
};
