// Build src/data/item-names.json from the game's string template, covering ALL storable
// item kinds (elements, food, ingredients, refined goods, seeds, eggs, critters, molts, …),
// then AUDIT it against every distinct prefab actually stored in a real save so we can see
// what's still unmapped. Usage: node build-item-names.mjs "<save.sav>"
import { readFileSync, writeFileSync } from "fs";
import pkg from "oni-save-parser";
const { parseSaveGame, SimHashes } = pkg;

const POT = "C:/Games/Oxygen Not Included/OxygenNotIncluded_Data/StreamingAssets/strings/strings_template.pot";
const strip = (s) => s.replace(/<link="[^"]*">/g, "").replace(/<\/link>/g, "").replace(/<[^>]+>/g, "").replace(/\\"/g, '"').trim();
const norm = (s) => s.toUpperCase().replace(/_/g, "");

const lines = readFileSync(POT, "utf8").split(/\r?\n/);

// Namespaces whose *.NAME entries name a storable item (non-creature). Creatures, their eggs,
// and plant seeds are handled by the dedicated SPECIES regex below.
const NAME_NS = [
  "STRINGS.ITEMS.",
  "STRINGS.ELEMENTS.",
  "STRINGS.EQUIPMENT.",
  "STRINGS.MISC.",
];
const out = {};
const setIfNew = (k, v) => { if (v && !(k in out)) out[k] = v; };

function msgidAfter(i) {
  for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
    const m = lines[j].match(/^msgid "(.*)"$/);
    if (m) return strip(m[1]);
  }
  return "";
}

// Pass 1: generic non-creature item names (these win on collisions).
for (let i = 0; i < lines.length; i++) {
  const ctx = lines[i].match(/^msgctxt "(.+)"$/);
  if (!ctx) continue;
  const nm = ctx[1].match(/\.([A-Z0-9_]+)\.NAME$/);
  if (nm && NAME_NS.some((ns) => ctx[1].startsWith(ns))) setIfNew(norm(nm[1]), msgidAfter(i));
}

// Pass 2: creatures / eggs / plant seeds. Species may carry a nested .VARIANT_<V> segment;
// the stored prefab concatenates base+variant (Drecko+Plastic -> DreckoPlasticEgg,
// PrickleFlower -> PrickleFlowerSeed named "Bristle Blossom Seed" via the plant's real name).
for (let i = 0; i < lines.length; i++) {
  const ctx = lines[i].match(/^msgctxt "(.+)"$/);
  if (!ctx) continue;
  const m = ctx[1].match(/^STRINGS\.CREATURES\.SPECIES\.(.+?)(?:\.VARIANT_([A-Z0-9_]+))?\.(EGG_NAME|NAME)$/);
  if (!m) continue;
  const token = norm(m[1]) + (m[2] ? norm(m[2]) : "");
  const val = msgidAfter(i);
  if (!val) continue;
  if (m[3] === "EGG_NAME") {
    setIfNew(token + "EGG", val);
  } else {
    setIfNew(token, val);              // live critter / plant
    setIfNew(token + "SEED", val + " Seed"); // its seed prefab (harmless for critters)
    // some seed prefabs drop the "Plant" suffix (MushroomPlant -> MushroomSeed)
    if (token.endsWith("PLANT")) setIfNew(token.slice(0, -5) + "SEED", val + " Seed");
  }
}

writeFileSync("src/data/item-names.json", JSON.stringify(out, null, 0), "utf8");
console.log(`item-names.json: ${Object.keys(out).length} entries`);

// ---- audit against a real save ----
const savePath = process.argv[2];
if (!savePath) process.exit(0);
const buf = readFileSync(savePath);
const save = parseSaveGame(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const ELEMENT_NAMES = JSON.parse(readFileSync("src/data/element-names.json", "utf8"));
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const camel = (s) => s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim();
const resolve = (nameRaw) => {
  const U = norm(nameRaw);
  if (out[U]) return ["item", out[U]];
  if (ELEMENT_NAMES[nameRaw.toUpperCase()]) return ["elem", ELEMENT_NAMES[nameRaw.toUpperCase()]];
  return ["camel", camel(nameRaw)];
};

const stored = new Map(); // prefab -> count
for (const grp of save.gameObjects) for (const go of grp.gameObjects) {
  for (const b of go.behaviors) {
    if (b.name !== "Storage" || !Array.isArray(b.extraData)) continue;
    for (const it of b.extraData) {
      const pe = it.behaviors?.find((x) => x.name === "PrimaryElement")?.templateData;
      const key = it.name || (pe ? (SimHashes[num(pe.ElementID)] ?? "?") : "?");
      stored.set(key, (stored.get(key) || 0) + 1);
    }
  }
}
const rows = [...stored.keys()].sort();
const byCamel = rows.map((r) => [r, ...resolve(r)]).filter(([, src]) => src === "camel");
console.log(`\nDistinct stored prefabs: ${rows.length}`);
console.log(`Resolved via item table / element table / CamelCase fallback:`);
const counts = { item: 0, elem: 0, camel: 0 };
for (const r of rows) counts[resolve(r)[0]]++;
console.log(" ", JSON.stringify(counts));
console.log(`\n--- Still falling back to CamelCase (need attention) ---`);
for (const [raw, , disp] of byCamel) console.log(`  ${raw}  ->  "${disp}"`);
