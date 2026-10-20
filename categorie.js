// Categorie dei prodotti della Dispensa, riconosciute dal nome (stesse regole dell'app dell'iPhone,
// app-dispensa/src/utils/productCategory.ts), con icone a linea sottile e colori tenui nello stile di Lei.
(function () {
  // Colori per famiglia: tinta dell'icona (lo sfondo è la stessa tinta, molto trasparente)
  const FAMILY = {
    dairy: "#8EC5F0", carbs: "#F2C66D", sweets: "#F0A6C4", drinks: "#7FD3DC", meat: "#F0A08A",
    fish: "#93B4F2", veggies: "#8FD3A0", fruit: "#F5B07A", pantry: "#D9B98A", frozen: "#B9A4F5", other: "#86A3AE"
  };

  // Icone 24×24 a tratto, come quelle della Home
  const ICON = {
    cup: '<path d="M6 8h12l-1.5 11a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z"/><path d="M5 8h14M9 4.5c1 1 1 2 0 3M13 4.5c1 1 1 2 0 3"/>',
    milk: '<path d="M8 3h8v3l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 6h8M6 12h12"/>',
    cheese: '<path d="M3 15l10-8 8 4v7H3z"/><path d="M3 15h18"/><circle cx="8" cy="18" r="1"/><circle cx="15" cy="13" r="1"/>',
    egg: '<path d="M12 3c3.5 0 6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 2.5-10 6-10z"/>',
    cookie: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r=".8"/><circle cx="14.5" cy="10" r=".8"/><circle cx="10.5" cy="14.5" r=".8"/><circle cx="15" cy="15" r=".8"/>',
    candy: '<rect x="7" y="8" width="10" height="8" rx="4"/><path d="M7 12l-4-3v6zM17 12l4-3v6z"/>',
    cake: '<path d="M4 20h16v-7H4zM4 15c2 1 4 1 6 0s4-1 6 0 3 1 4 0"/><path d="M12 13V9M12 6.5v.5"/>',
    pasta: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M7 11c0-3 2-6 2-6M11 11c0-4 1-7 1-7M15 11c0-3 2-5 2-5"/>',
    rice: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M8 9.5l1-1M11 9l1-1.5M14.5 9.5l1-1M9.5 7l.8-.8M13 6.5l.8-.8"/>',
    bread: '<path d="M5 10a4 4 0 0 1 3-6h8a4 4 0 0 1 3 6v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 9l2 2M12 8l2 2"/>',
    grain: '<path d="M12 21V7M12 11c-3 0-4-2-4-4 2 0 4 1 4 4zM12 11c3 0 4-2 4-4-2 0-4 1-4 4zM12 16c-3 0-4-2-4-4 2 0 4 1 4 4zM12 16c3 0 4-2 4-4-2 0-4 1-4 4zM12 7V3"/>',
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M9 3v3M12 3v3"/>',
    tea: '<path d="M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 12h1.5a2 2 0 0 1 0 4H17M11 10V5h3"/>',
    bottle: '<path d="M10 2h4v4l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6z"/><path d="M8.5 12h7"/>',
    wine: '<path d="M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0z"/><path d="M12 12.5V20M8.5 20h7M8.3 7h7.4"/>',
    meat: '<path d="M14 4a6 6 0 0 1 5 8c-1.5 4-6 6-9.5 6S4 16 5 12s5-8 9-8z"/><circle cx="14" cy="10" r="2"/>',
    drumstick: '<path d="M15 4a5 5 0 0 1 2 9.5L12 15l-3 3a1.5 1.5 0 1 1-2-1l-1-1a1.5 1.5 0 1 1 1-2l3-3 1.5-5A5 5 0 0 1 15 4z"/>',
    sausage: '<path d="M5 15c-2-2-1-5 1-6 4-2 9-2 12 1 2 2 1 5-1 6-4 2-9 1-12-1z"/><path d="M4 13l-1.5 1M20 12l1.5-1"/>',
    fish: '<path d="M3 12c3-5 10-6 14-2l4-3v10l-4-3c-4 4-11 3-14-2z"/><circle cx="8" cy="11" r=".8"/>',
    pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 7c0-1 1-2 3-2s3 1 3 2"/>',
    shaker: '<path d="M8 9h8l1 11H7z"/><path d="M8 9a4 4 0 0 1 8 0M11 6v.5M13 6.5v.5"/>',
    seed: '<path d="M12 20c-4 0-7-3-7-8 4 0 7 3 7 8zM12 20c4 0 7-3 7-8-4 0-7 3-7 8zM12 20V9"/><circle cx="12" cy="6" r="2.5"/>',
    nut: '<path d="M12 3c3 0 5 2.5 5 5s-1.5 3-1.5 4.5S17 15 17 17a5 5 0 0 1-10 0c0-2 1.5-3 1.5-4.5S7 10.5 7 8s2-5 5-5z"/>',
    snack: '<path d="M6 3h12l-1 3v12l1 3H6l1-3V6z"/><path d="M9 10l2 2 4-4"/>',
    leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    carrot: '<path d="M14 10l-9 11 11-9a3 3 0 0 0-2-2z"/><path d="M15 9l2-5M15 9l5-2M15 9l3.5-3.5"/>',
    sprout: '<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 12c0-5 3-8 8-8 0 5-3 8-8 8z"/>',
    pepper: '<path d="M9 7c-3 1-5 5-4 9 1 3 4 5 8 4s6-5 5-9-5-5-9-4z"/><path d="M12 6c0-2 1-3 3-3"/>',
    apple: '<path d="M12 7c-2-1.5-7-1-7 5 0 5 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-6-5-6.5-7-5z"/><path d="M12 7c0-2 1-4 3-4"/>',
    citrus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 7v10M7 12h10M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
    grapes: '<circle cx="9" cy="10" r="2.2"/><circle cx="13.5" cy="10" r="2.2"/><circle cx="11.2" cy="14" r="2.2"/><circle cx="15.8" cy="14" r="2.2"/><circle cx="13.5" cy="18" r="2.2"/><path d="M12 7.5c0-2 1-3.5 3-4.5"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'
  };

  // [parole, icona, famiglia, nome]: vince la prima regola che trova una parola nel nome
  const RULES = [
    [["yogurt", "yogourt", "skyr", "kefir"], "cup", "dairy", "Yogurt"],
    [["latte", "milk", "panna"], "milk", "dairy", "Latte"],
    [["formaggio", "mozzarella", "parmigiano", "grana", "ricotta", "stracchino", "gorgonzola", "pecorino", "scamorza", "provola", "mascarpone", "burrata", "feta", "emmental", "fontina", "asiago", "philadelphia", "cheese", "spalmabile", "biraghi"], "cheese", "dairy", "Formaggi"],
    [["burro"], "cheese", "dairy", "Burro"],
    [["gelato"], "snow", "sweets", "Gelati"],
    [["biscott", "cookie", "frollini", "wafer", "pan di stelle", "oreo"], "cookie", "sweets", "Biscotti"],
    [["nutella", "nocciolata", "cioccolat", "cacao", "caramell", "pralin"], "candy", "sweets", "Dolci"],
    [["torta", "merendin", "plumcake", "muffin", "pandoro", "panettone", "colomba", "brioche", "cornetto", "croissant"], "cake", "sweets", "Dolci"],
    [["marmellat", "confettur", "miele", "zucchero"], "pot", "sweets", "Dolci"],
    [["spaghetti", "pasta", "penne", "fusilli", "rigatoni", "maccheroni", "linguine", "tagliatelle", "lasagne", "farfalle", "orecchiette", "tortellini", "ravioli", "gnocchi", "bucatini", "paccheri", "mezze maniche", "trofie", "ditalini", "noodle", "ramen"], "pasta", "carbs", "Pasta"],
    [["riso", "risotto", "basmati", "carnaroli", "arborio", "farro", "orzo", "couscous", "quinoa"], "rice", "carbs", "Riso e cereali"],
    [["pane", "panino", "baguette", "piadina", "focaccia", "grissini", "cracker", "fette biscottate", "tarall", "pancarre", "tramezzin", "pizza"], "bread", "carbs", "Pane"],
    [["cereali", "muesli", "corn flakes", "granola", "fiocchi", "avena", "farina", "lievito", "semola", "pangrattato"], "grain", "carbs", "Farine e cereali"],
    [["uova", "uovo"], "egg", "dairy", "Uova"],
    [["caffe", "coffee", "espresso", "capsule"], "coffee", "drinks", "Caffè"],
    [[" te ", " the ", "tisana", "camomilla", "infuso"], "tea", "drinks", "Tè e tisane"],
    [["vino", "prosecco", "spumante", "birra"], "wine", "drinks", "Vino e birra"],
    [["acqua", "succo", "aranciata", "cola", "bibita", "gassosa", "chinotto", "estathe", "sprite", "fanta"], "bottle", "drinks", "Bevande"],
    [["wurstel", "prosciutto", "salame", "mortadella", "speck", "bresaola", "salsiccia", "pancetta", "guanciale", "coppa", "affettat", "salum"], "sausage", "meat", "Salumi"],
    [["pollo", "tacchino", "petto", "cosce", "ali di"], "drumstick", "meat", "Pollo e tacchino"],
    [["carne", "manzo", "maiale", "vitello", "hamburger", "bistecca", "macinato", "arrosto", "fettin", "spezzatino", "polpett"], "meat", "meat", "Carne"],
    [["pesce", "tonno", "salmone", "merluzzo", "gamber", "sgombro", "alici", "acciugh", "branzino", "orata", "calamar", "polpo", "cozze", "vongole", "baccala", "sardin", "surimi"], "fish", "fish", "Pesce"],
    [["pomodor", "passata", "pelati", "sugo", "ragu", "pesto", "concentrato"], "pot", "meat", "Sughi"],
    [["olio", "aceto", "soia", "maionese", "ketchup", "senape", "salsa"], "bottle", "pantry", "Condimenti"],
    [["sale", "pepe", "spezie", "origano", "curry", "paprika", "dado", "brodo"], "shaker", "pantry", "Spezie"],
    [["legumi", "fagioli", "ceci", "lenticchie", "piselli", "fave", "edamame"], "seed", "veggies", "Legumi"],
    [["noci", "nocciole", "mandorle", "arachidi", "pistacchi", "anacardi", "frutta secca"], "nut", "pantry", "Frutta secca"],
    [["popcorn", "patatine", "chips", "fonzie", "snack"], "snack", "pantry", "Snack"],
    [["carot"], "carrot", "veggies", "Verdura"],
    [["peperon", "peperoncin"], "pepper", "veggies", "Verdura"],
    [["insalata", "lattuga", "rucola", "spinaci", "valeriana", "radicchio", "bietol", "cavol", "verza", "basilico", "prezzemolo"], "leaf", "veggies", "Insalata e foglie"],
    [["zucchin", "melanzan", "broccol", "patat", "cipoll", "aglio", "sedano", "finocchi", "carciof", "asparag", "zucca", "cetriol", "verdur", "minestrone", "funghi", "mais"], "sprout", "veggies", "Verdura"],
    [["uva"], "grapes", "fruit", "Frutta"],
    [["arancia", "arance", "mandarin", "clementin", "limone", "limoni", "pompelmo"], "citrus", "fruit", "Agrumi"],
    [["mela", "mele", "banan", "pesca", "pesche", "albicocc", "kiwi", "prugn", "frutta", "avocado", "pera", "pere", "ananas", "melone", "anguria", "fragol", "ciliegi", "mirtill", "lampon"], "apple", "fruit", "Frutta"],
    [["surgelat", "ghiaccio", "frozen"], "snow", "frozen", "Surgelati"]
  ];
  const FALLBACK = { frigo: "fridge", freezer: "snow", dispensa: "box" };

  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.box}</svg>`;

  function categoryOf(name, location) {
    const text = ` ${norm(name)} `;
    for (const [words, icon, family, label] of RULES) {
      if (words.some(w => text.includes(w.startsWith(" ") ? ` ${norm(w.trim())} ` : norm(w)))) {
        return { icon, label, color: FAMILY[family] };
      }
    }
    return { icon: FALLBACK[location] || "box", label: "Altro", color: FAMILY.other };
  }

  window.LeiCategorie = { categoryOf, svg };
})();
