// Extract every storage container (Storage Bins, Refrigerator, reservoirs, etc.) with its
// map position, custom name, and full contents — plus a faint building silhouette.
// Ported from the CLI extract-boxes.mjs; takes a parsed save, returns plain data.
import { SimHashes, num } from "./loadSave.js";
import { pretty } from "./elementNames.js";

// The prefab groups a player thinks of as "storage boxes / containers".
// value = friendly category label.
const CONTAINER_PREFABS = {
  StorageLocker: "Storage Bin",
  StorageLockerSmart: "Smart Storage Bin",
  Refrigerator: "Refrigerator",
  RationBox: "Ration Box",
  GasReservoir: "Gas Reservoir",
  LiquidReservoir: "Liquid Reservoir",
  ObjectDispenser: "Object Dispenser",
  CritterDropOff: "Critter Drop-Off",
};

const elementName = (id) => SimHashes[id] ?? `#${id}`;
const beh = (go, name) => go.behaviors.find((b) => b.name === name)?.templateData;
const normalize = (s) => s.replace(/\s+/g, "").toLowerCase();

// Strip ONI rich-text link tags from a saved name: <link="X">Foo</link> -> Foo
function cleanName(s) {
  if (!s) return "";
  return s.replace(/<link="[^"]*">/g, "").replace(/<\/link>/g, "").replace(/<[^>]+>/g, "").trim();
}

export function extractBoxes(save) {
  const boxes = [];
  const buildings = []; // faint silhouette: every completed building's footprint
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const expand = (x, y) => {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
  };

  for (const grp of save.gameObjects) {
    const isContainer = CONTAINER_PREFABS[grp.name];
    for (const go of grp.gameObjects) {
      const hasBuilding = go.behaviors.some((b) => b.name === "BuildingComplete");
      if (hasBuilding) {
        buildings.push([Math.round(go.position.x), Math.round(go.position.y)]);
        expand(go.position.x, go.position.y);
      }
      if (!isContainer) continue;

      const storage = go.behaviors.find((b) => b.name === "Storage");
      const agg = new Map(); // internal name -> { kg, n }
      let totalKg = 0;
      for (const item of storage?.extraData || []) {
        const pe = item.behaviors?.find((ib) => ib.name === "PrimaryElement")?.templateData;
        const kg = pe ? num(pe.Units) || 0 : 0;
        const key = item.name || (pe ? elementName(num(pe.ElementID)) : "Unknown");
        const a = agg.get(key) || { kg: 0, n: 0 };
        a.kg += kg; a.n += 1; totalKg += kg;
        agg.set(key, a);
      }
      const items = [...agg.entries()]
        .map(([name, a]) => ({ name: pretty(name), kg: Math.round(a.kg), n: a.n }))
        .sort((a, b) => b.kg - a.kg);

      const cleaned = cleanName(beh(go, "UserNameable")?.savedName || "");
      const isCustom = cleaned && normalize(cleaned) !== normalize(isContainer) && !/^storage bin$/i.test(cleaned);

      boxes.push({
        id: boxes.length,
        prefab: grp.name,
        category: isContainer,
        x: Math.round(go.position.x),
        y: Math.round(go.position.y),
        name: isCustom ? cleaned : "",
        totalKg: Math.round(totalKg),
        items,
      });
      expand(go.position.x, go.position.y);
    }
  }

  if (!isFinite(bounds.minX)) { bounds.minX = 0; bounds.maxX = 1; bounds.minY = 0; bounds.maxY = 1; }
  const gi = save.header.gameInfo;
  const meta = {
    base: gi.baseName,
    cycle: num(gi.numberOfCycles),
    dupes: num(gi.numberOfDuplicants),
    bounds: {
      minX: Math.floor(bounds.minX), maxX: Math.ceil(bounds.maxX),
      minY: Math.floor(bounds.minY), maxY: Math.ceil(bounds.maxY),
    },
    counts: {},
  };
  for (const b of boxes) meta.counts[b.category] = (meta.counts[b.category] || 0) + 1;

  return { meta, boxes, buildings };
}
