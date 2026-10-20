// Categorie dei prodotti della Dispensa: 9 categorie generiche (griglia 3×3), ognuna con la sua icona.
// La categoria scelta a mano (colonna products.category) vince; altrimenti si capisce dal nome,
// e se il nome non dice niente dal posto (frigo → Freschi, freezer → Surgelati, dispensa → Comuni).
(function () {
  const ICON = {
    pasta: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M7 11c0-3 2-6 2-6M11 11c0-4 1-7 1-7M15 11c0-3 2-5 2-5"/>',
    meat: '<path d="M14 4a6 6 0 0 1 5 8c-1.5 4-6 6-9.5 6S4 16 5 12s5-8 9-8z"/><circle cx="14" cy="10" r="2"/>',
    fish: '<path d="M3 12c3-5 10-6 14-2l4-3v10l-4-3c-4 4-11 3-14-2z"/><circle cx="8" cy="11" r=".8"/>',
    can: '<ellipse cx="12" cy="5.5" rx="6" ry="2"/><path d="M6 5.5v13c0 1.1 2.7 2 6 2s6-.9 6-2v-13"/><path d="M6 9.5c0 1.1 2.7 2 6 2s6-.9 6-2M6 15c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
    apple: '<path d="M12 7c-2-1.5-7-1-7 5 0 5 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-6-5-6.5-7-5z"/><path d="M12 7c0-2 1-4 3-4"/>',
    carrot: '<path d="M14 10l-9 11 11-9a3 3 0 0 0-2-2z"/><path d="M15 9l2-5M15 9l5-2M15 9l3.5-3.5"/>',
    milk: '<path d="M8 3h8v3l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 6h8M6 12h12"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    jar: '<path d="M8 3h8v3H8z"/><path d="M7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1z"/><path d="M6 11h12M6 16h12"/>',
    // icone dei posti (frigo, freezer, dispensa)
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"/>'
  };

  // Ordine della griglia 3×3
  const LIST = [
    { id: "pasta", label: "Pasta", sub: "riso, patate, cereali", icon: "pasta", color: "#F2C66D" },
    { id: "carne", label: "Carne", sub: "anche salumi", icon: "meat", color: "#F0A08A" },
    { id: "pesce", label: "Pesce", sub: "", icon: "fish", color: "#93B4F2" },
    { id: "scatolame", label: "Scatolame", sub: "pelati, legumi, tonno", icon: "can", color: "#D9B98A" },
    { id: "frutta", label: "Frutta", sub: "", icon: "apple", color: "#F5B07A" },
    { id: "verdura", label: "Verdura", sub: "", icon: "carrot", color: "#8FD3A0" },
    { id: "freschi", label: "Freschi", sub: "latte, formaggi, uova", icon: "milk", color: "#8EC5F0" },
    { id: "surgelati", label: "Surgelati", sub: "", icon: "snow", color: "#B9A4F5" },
    { id: "comuni", label: "Comuni", sub: "sale, zucchero, farina…", icon: "jar", color: "#C9B8A0" }
  ];
  const BY_ID = {};
  LIST.forEach(c => (BY_ID[c.id] = c));

  // [categoria, parole]: vince la prima regola che trova una parola nel nome.
  // Una parola vale anche come inizio di parola ("biscott" → biscotti); con "=" alla fine deve essere intera.
  const RULES = [
    ["surgelati", ["surgelat", "gelato", "gelati=", "ghiaccio", "frozen", "bastoncini", "sofficini", "findus"]],
    // prima di Pasta e Frutta: farina, pangrattato, patatine e frutta secca stanno fra i Comuni
    ["comuni", ["farina", "pangrattato", "semola", "lievito", "patatine", "chips", "popcorn", "noci=", "nocciole", "mandorle", "arachidi", "pistacchi", "anacardi", "frutta secca", "uvetta"]],
    ["freschi", ["pasta sfoglia", "pasta brisee", "pasta frolla", "pasta per pizza"]],
    ["scatolame", ["pelati", "passata", "polpa", "concentrato", "in scatola", "scatolett", "tonno", "sgombro", "sardine", "legumi", "fagioli=", "fagioli borlotti", "fagioli cannellini", "ceci=", "lenticchie", "piselli", "fave=", "mais=", "olive", "capperi", "sottaceti", "sott'olio", "sottolio", "carciofini", "sugo", "sughi", "ragu", "pesto", "simmenthal", "pomodorini in", "fagiolini in"]],
    ["pasta", ["pasta", "spaghetti", "penne", "fusilli", "rigatoni", "maccheroni", "linguine", "tagliatelle", "lasagne", "farfalle", "orecchiette", "tortellini", "ravioli", "gnocchi", "bucatini", "paccheri", "mezze maniche", "trofie", "ditalini", "noodle", "ramen", "riso=", "risotto", "basmati", "carnaroli", "arborio", "farro", "orzo", "couscous", "cous cous", "quinoa", "patat", "polenta", "pane=", "panino", "pancarre", "baguette", "piadin", "focaccia", "grissini", "cracker", "fette biscottate", "friselle", "tarall", "pizza", "cereali", "muesli", "corn flakes", "cornflakes", "granola", "fiocchi", "avena"]],
    ["pesce", ["pesce", "salmone", "merluzzo", "gamber", "alici", "acciugh", "branzino", "orata", "calamar", "polpo", "cozze", "vongole", "baccala", "surimi", "seppi", "trota", "spigola", "platessa", "nasello"]],
    ["carne", ["carne", "manzo", "maiale", "vitello", "pollo", "tacchino", "petto", "cosce", "ali di", "hamburger", "bistecca", "macinato", "arrosto", "fettin", "spezzatino", "polpett", "salsicc", "wurstel", "prosciutto", "salame", "mortadella", "speck", "bresaola", "pancetta", "guanciale", "coppa=", "affettat", "salum", "agnello", "coniglio", "cotolett"]],
    ["freschi", ["latte=", "yogurt", "yogourt", "skyr", "kefir", "panna", "formaggi", "mozzarella", "parmigiano", "grana", "ricotta", "stracchino", "gorgonzola", "pecorino", "scamorza", "provola", "mascarpone", "burrata", "feta=", "emmental", "fontina", "asiago", "philadelphia", "spalmabile", "burro", "uova=", "uovo=", "besciamella"]],
    ["verdura", ["insalata", "lattuga", "rucola", "spinaci", "valeriana", "radicchio", "bietol", "cavol", "verza", "basilico", "prezzemolo", "carot", "peperon", "zucchin", "melanzan", "broccol", "cipoll", "aglio", "sedano", "finocchi", "carciof", "asparag", "zucca", "cetriol", "verdur", "minestrone", "funghi", "pomodor", "porri", "fagiolini", "ravanell", "germogli"]],
    ["frutta", ["mela=", "mele=", "banan", "pesca=", "pesche", "albicocc", "kiwi", "prugn", "frutta", "avocado", "pera=", "pere=", "ananas", "melone", "anguria", "fragol", "ciliegi", "mirtill", "lampon", "uva=", "arance", "arancia", "mandarin", "clementin", "limon", "pompelmo", "cachi", "fichi", "melagran"]]
  ];
  const BY_PLACE = { frigo: "freschi", freezer: "surgelati", dispensa: "comuni" };

  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9']+/g, " ");
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.box}</svg>`;

  function guess(name) {
    const text = ` ${norm(name)} `;
    for (const [id, words] of RULES) {
      if (words.some(w => w.endsWith("=") ? text.includes(` ${w.slice(0, -1)} `) : text.includes(` ${w}`))) return id;
    }
    return null;
  }

  // Categoria di un prodotto: { id, label, sub, icon, color }
  function categoryOf(name, location, chosen) {
    if (chosen && BY_ID[chosen]) return BY_ID[chosen];
    if (location === "freezer") return BY_ID.surgelati;
    return BY_ID[guess(name) || BY_PLACE[location] || "comuni"];
  }

  // Dalle categorie di Open Food Facts (es. "en:canned-tomatoes") a una delle nove
  // Le etichette vanno dalla più generica alla più precisa: si parte dalla più precisa
  // (così "spaghetti" vince su "plant-based-foods-and-beverages").
  const TAG_RULES = [
    ["surgelati", /frozen|surgel/],
    ["scatolame", /canned|legumes|pulses|tomato-sauces|tomato-pulp|peeled-tomatoes|tomato-pur|pickles|olives|pesto|pasta-sauces/],
    ["pesce", /fishes|seafood|^fish/],
    ["carne", /meats|sausages|hams|salami|poultry|^meat/],
    ["freschi", /dairies|dairy|cheeses|yogurts|milks|^eggs|butters|creams/],
    ["comuni", /flours|sugars|salts|breadcrumbs|baking|spices|condiments|oils|vinegars|coffees|teas|^beverages|drinks|biscuits|chocolates|sweet-spreads|jams|honeys|snacks|nuts|dried-fruits/],
    ["pasta", /pasta|spaghetti|rices|^rice|cereals|breads|potatoes|crackers|rusks|gnocchi/],
    ["frutta", /fruits/],
    ["verdura", /vegetables/]
  ];
  function fromTags(tags) {
    const list = (tags || []).map(t => t.replace(/^[a-z]{2}:/, "")).reverse();
    for (const t of list) {
      for (const [id, re] of TAG_RULES) if (re.test(t)) return id;
    }
    return null;
  }

  // Posto suggerito per una categoria (si può cambiare nella scheda)
  const PLACE = { carne: "frigo", pesce: "frigo", freschi: "frigo", verdura: "frigo", surgelati: "freezer" };
  const placeFor = id => PLACE[id] || "dispensa";

  window.LeiCategorie = { LIST, categoryOf, guess, fromTags, placeFor, svg };
})();
