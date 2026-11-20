// Beispiel-Projekte für den Code-Bereich (eigene, frei erfundene kleine Spiele und Programme).
export const LANG_INFO = {
  web: { label: 'HTML · CSS · JavaScript', short: 'Web', hint: 'Webseiten und Spiele mit Grafik' },
  python: { label: 'Python', short: 'Python', hint: 'Text-Programme, Rechnen, Raten' },
  lua: { label: 'Lua', short: 'Lua', hint: 'Kleine, einfache Sprache' },
};

export const BLANK = {
  web: { html: '<h1>Hallo!</h1>\n<p>Tipp auf „Starten“.</p>\n', css: 'body {\n  font-family: system-ui, sans-serif;\n  padding: 20px;\n}\n', js: 'console.log("Los geht\'s");\n' },
  python: { code: 'name = input("Wie heißt du? ")\nprint("Hallo", name)\n' },
  lua: { code: 'for i = 1, 5 do\n  print("Runde " .. i)\nend\n' },
};

export const EXAMPLES = [
  {
    title: 'Sternenfänger (Spiel)', lang: 'web',
    note: 'Fang die gelben Sterne mit dem Korb, weich den grauen Steinen aus. Steuern mit Finger, Pencil oder Pfeiltasten.',
    html: '<canvas id="spiel"></canvas>\n<div id="info">Punkte: 0 · Leben: 3</div>\n',
    css: 'html, body { margin: 0; height: 100%; background: #0d1b2a; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; touch-action: none; }\ncanvas { display: block; width: 100%; height: 100%; }\n#info { position: fixed; top: 10px; left: 12px; font-size: 18px; font-weight: 600; }\n',
    js: `// Sternenfänger: ein kleines Spiel zum Lernen und Umbauen.
// Probier zum Beispiel: andere Farben, schnellere Steine, mehr Leben.
const canvas = document.getElementById("spiel");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");

let breite, hoehe;
function groesse() {
  breite = canvas.width = innerWidth;
  hoehe = canvas.height = innerHeight;
}
groesse();
addEventListener("resize", groesse);

const korb = { x: 200, breite: 90 };
let dinge = [];          // fallende Sterne und Steine
let punkte = 0, leben = 3, tempo = 2, laeuft = true;

// Steuern: Finger/Pencil ziehen oder Pfeiltasten
addEventListener("pointermove", (e) => { korb.x = e.clientX; });
addEventListener("pointerdown", (e) => { korb.x = e.clientX; if (!laeuft) neustart(); });
addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") korb.x -= 40;
  if (e.key === "ArrowRight") korb.x += 40;
});

function neuesDing() {
  const istStern = Math.random() < 0.7;
  dinge.push({ x: 20 + Math.random() * (breite - 40), y: -20, r: istStern ? 14 : 18, stern: istStern, v: tempo + Math.random() * 2 });
}

function stern(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const w = Math.PI / 5 * i - Math.PI / 2;
    const rr = i % 2 ? r / 2.2 : r;
    ctx.lineTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
}

function neustart() { dinge = []; punkte = 0; leben = 3; tempo = 2; laeuft = true; }

let zaehler = 0;
function schritt() {
  ctx.fillStyle = "#0d1b2a";
  ctx.fillRect(0, 0, breite, hoehe);

  if (laeuft) {
    if (zaehler++ % 40 === 0) neuesDing();
    tempo += 0.001;
    for (const d of dinge) d.y += d.v;
    // Fangen?
    const korbY = hoehe - 40;
    for (const d of dinge) {
      if (d.y > korbY - 10 && d.y < korbY + 20 && Math.abs(d.x - korb.x) < korb.breite / 2) {
        d.weg = true;
        if (d.stern) punkte++; else leben--;
      }
      if (d.y > hoehe + 30) d.weg = true;
    }
    dinge = dinge.filter((d) => !d.weg);
    if (leben <= 0) laeuft = false;
  }

  for (const d of dinge) {
    if (d.stern) stern(d.x, d.y, d.r);
    else { ctx.fillStyle = "#8d99ae"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
  }
  // Korb
  ctx.fillStyle = "#ef8354";
  ctx.fillRect(korb.x - korb.breite / 2, hoehe - 40, korb.breite, 18);

  info.textContent = "Punkte: " + punkte + " · Leben: " + leben;
  if (!laeuft) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Vorbei! " + punkte + " Punkte", breite / 2, hoehe / 2);
    ctx.font = "20px system-ui";
    ctx.fillText("Tippen für eine neue Runde", breite / 2, hoehe / 2 + 36);
  }
  requestAnimationFrame(schritt);
}
schritt();
`,
  },
  {
    title: 'Hüpfender Ball (Grafik)', lang: 'web',
    note: 'Ein Ball springt hin und her. Tippe, um einen neuen Ball zu werfen. Gut zum Lernen von Bewegung.',
    html: '<canvas id="c"></canvas>\n',
    css: 'html, body { margin: 0; height: 100%; background: #f4f1ea; overflow: hidden; touch-action: none; }\ncanvas { display: block; width: 100%; height: 100%; }\n',
    js: `const c = document.getElementById("c");
const ctx = c.getContext("2d");
c.width = innerWidth; c.height = innerHeight;

const baelle = [];
function neuerBall(x, y) {
  baelle.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: -8, r: 14 + Math.random() * 18,
    farbe: "hsl(" + Math.floor(Math.random() * 360) + ", 70%, 55%)" });
}
neuerBall(100, 100);
addEventListener("pointerdown", (e) => neuerBall(e.clientX, e.clientY));

const schwerkraft = 0.4;   // probier 0.1 (Mond) oder 1 (schwer)
function bild() {
  ctx.fillStyle = "rgba(244, 241, 234, 0.35)";   // Schweif
  ctx.fillRect(0, 0, c.width, c.height);
  for (const b of baelle) {
    b.vy += schwerkraft;
    b.x += b.vx; b.y += b.vy;
    if (b.y + b.r > c.height) { b.y = c.height - b.r; b.vy *= -0.85; }
    if (b.x - b.r < 0 || b.x + b.r > c.width) b.vx *= -1;
    ctx.fillStyle = b.farbe;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  requestAnimationFrame(bild);
}
bild();
`,
  },
  {
    title: 'Zahlenraten', lang: 'python',
    note: 'Der Computer denkt sich eine Zahl aus, du rätst. Zeigt Schleifen, if und input().',
    code: `import random

geheim = random.randint(1, 100)
versuche = 0
print("Ich denke mir eine Zahl zwischen 1 und 100.")

while True:
    eingabe = input("Dein Tipp: ")
    if not eingabe.isdigit():
        print("Bitte eine Zahl eingeben.")
        continue
    tipp = int(eingabe)
    versuche += 1
    if tipp < geheim:
        print(tipp, "ist zu klein.")
    elif tipp > geheim:
        print(tipp, "ist zu groß.")
    else:
        print("Richtig! Du hast", versuche, "Versuche gebraucht.")
        break
`,
  },
  {
    title: 'Einmaleins-Trainer', lang: 'python',
    note: '5 Aufgaben aus dem kleinen Einmaleins, am Ende gibt es eine Wertung.',
    code: `import random

richtig = 0
for nummer in range(1, 6):
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    antwort = input(f"Aufgabe {nummer}: {a} · {b} = ")
    if antwort.strip() == str(a * b):
        print("Stimmt!")
        richtig += 1
    else:
        print(f"Leider nicht, richtig ist {a * b}.")

print()
print(f"Du hast {richtig} von 5 richtig.")
if richtig == 5:
    print("Perfekt!")
`,
  },
  {
    title: 'Würfel-Statistik', lang: 'lua',
    note: 'Würfelt 600-mal und zählt, wie oft jede Zahl kommt.',
    code: `math.randomseed(os.time())

local anzahl = {0, 0, 0, 0, 0, 0}
for i = 1, 600 do
  local w = math.random(1, 6)
  anzahl[w] = anzahl[w] + 1
end

for zahl = 1, 6 do
  print(zahl .. ": " .. string.rep("#", anzahl[zahl] // 5) .. " " .. anzahl[zahl])
end
`,
  },
];
