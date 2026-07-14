// Internal ONI sim names -> in-game display names, extracted from the game's string template.
// ELEMENT_NAMES covers raw elements/ores; ITEM_NAMES covers everything else that can be stored
// (food, refined goods, seeds, eggs, critters, molts, suits, …) keyed by UPPERCASE prefab with
// underscores removed. Both are generated from strings_template.pot (build-item-names.mjs).
import ELEMENT_NAMES from "../data/element-names.json";
import ITEM_NAMES from "../data/item-names.json";

// Prettify an internal prefab/item name into a readable label. Priority: item table (most
// specific), then element table, then a CamelCase split as a last resort.
export function pretty(internal) {
  if (!internal) return "Unknown";
  const item = ITEM_NAMES[internal.toUpperCase().replace(/_/g, "")];
  if (item) return item;
  const disp = ELEMENT_NAMES[internal.toUpperCase()];
  if (disp) return disp;
  return internal
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
}

export { ELEMENT_NAMES, ITEM_NAMES };
