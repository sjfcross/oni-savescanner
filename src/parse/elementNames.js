// Internal ONI sim names -> in-game display names, extracted from the game's string
// template. Used to prettify both element ids and item/prefab names.
import ELEMENT_NAMES from "../data/element-names.json";

// Prettify an internal prefab/item name into a readable label: use the element display
// table when it's a real element, otherwise CamelCase-split the prefab id.
export function pretty(internal) {
  if (!internal) return "Unknown";
  const disp = ELEMENT_NAMES[internal.toUpperCase()];
  if (disp) return disp;
  return internal
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
}

export { ELEMENT_NAMES };
