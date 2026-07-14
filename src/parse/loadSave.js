// Thin wrapper around oni-save-parser. Runs entirely in the browser — the ArrayBuffer
// comes straight from a File the user dropped; nothing is uploaded.
import { parseSaveGame, SimHashes } from "oni-save-parser";

export { SimHashes };

/**
 * Parse a .sav ArrayBuffer into the library's save object.
 * Throws with a friendlier message on the common failure (unsupported version).
 */
export function loadSave(arrayBuffer) {
  try {
    return parseSaveGame(arrayBuffer);
  } catch (err) {
    if (err && err.code === "E_VERSION_MINOR") {
      throw new Error(
        "This save is from a newer ONI version than the scanner knows about. " +
          "It usually still works — ping the author to bump the supported range."
      );
    }
    if (err && err.code === "E_VERSION_MAJOR") {
      throw new Error("This doesn't look like a current Spaced Out save (major version mismatch).");
    }
    throw new Error("Couldn't read this file as an ONI save. Is it a .sav from the base game/Spaced Out?");
  }
}

export const num = (v) => (typeof v === "bigint" ? Number(v) : v);
