# ONI Save Scanner

**Live:** https://oni-savescanner.netlify.app

Drop an [Oxygen Not Included](https://www.klei.com/games/oxygen-not-included) save file
(`.sav`) and get an interactive top-down map of **every storage container in your colony** —
search any item to see which bins hold it, how much, and exactly where they are.

It runs **entirely in your browser**. Your save is read locally and never uploaded — there is
no server, no account, no tracking. The whole thing is a static site.

---

## What it does

- **Storage map** — a top-down plot of your base. Every completed building is drawn as a faint
  silhouette dot for context; every storage container is a colored marker sized by how full it is.
- **Search** — type an item (`coal`, `seed`, `plastic`, `gold`…). Matching bins glow, everything
  else dims, and the sidebar tells you the total mass and which bins/coordinates hold it.
- **Item index** — every stored item ranked by mass, click to locate it on the map.
- **Bins list** — click a marker (or a row) to see a container's full contents and jump to it.
- Pan (drag), zoom (scroll), hover a bin for a contents tooltip.

Recognized containers: Storage Bins (incl. Smart), Refrigerators, Ration Boxes, Gas & Liquid
Reservoirs, Object Dispensers, Critter Drop-Offs.

---

## How it works

### 100% client-side parsing
The interesting part: ONI's binary save format is parsed **in the browser**. The app bundles
[`oni-save-parser`](https://github.com/RoboPhred/oni-save-parser), which only needs `pako`
(zlib in JS) and a `TextEncoder` polyfill — no Node `fs`/`Buffer`/`zlib`. So a dropped `.sav`
is decompressed and decoded on your machine; nothing is sent anywhere.

A ~4 MB save parses in roughly 4 seconds (it's synchronous, so a loading screen covers the
brief freeze — see [Ideas](#ideas--not-done)).

### Pipeline
```
File (.sav)
  └─ arrayBuffer()
       └─ loadSave()      src/parse/loadSave.js   → oni-save-parser → save object
            └─ extractBoxes()  src/parse/boxes.js → { meta, boxes, buildings }
                 └─ mountOverlay()  src/views/overlay.js → canvas map + sidebar
```

`extractBoxes` walks `save.gameObjects`, picks out the container prefab groups, and for each one
reads its world `position`, its `UserNameable` custom name, and its `Storage.extraData` contents
(aggregated by item, with mass from each item's `PrimaryElement`). It also collects every
`BuildingComplete` footprint to draw the base silhouette. Internal sim names are mapped to
in-game display names via `src/data/element-names.json`.

> **Note on coordinates:** positions are raw save-grid cells with the Y axis pointing up, so the
> map flips Y for screen space. They're internally consistent (relative positions are correct),
> but not guaranteed to match ONI's own coordinate readout.

### The two parser patches
`oni-save-parser` is from 2023 and needs two small fixes, kept as a
[patch-package](https://github.com/ds300/patch-package) patch in `patches/` and re-applied
automatically on every `npm install` (via the `postinstall` script):

1. **`parser/types.js`** — replaces `util.isObject()` (removed from modern Node, and a Node-only
   API that wouldn't bundle for the browser) with a plain `typeof` check.
2. **`save-structure/version-validator.js`** — widens the accepted save *minor* version list to
   `31–45` so current Spaced Out saves load. The format is self-describing, so minor bumps parse
   generically. If a future update goes past minor 45, widen the range in the patch.

---

## Project structure
```
oni-savescanner/
├─ index.html               # app entry
├─ src/
│  ├─ main.js               # app shell: dropzone, file handling, VIEWS registry
│  ├─ style.css             # colony-console dark theme
│  ├─ parse/
│  │  ├─ loadSave.js        # oni-save-parser wrapper + friendly errors
│  │  ├─ boxes.js           # extractBoxes(save) → map data
│  │  └─ elementNames.js    # internal → display name helper
│  ├─ views/
│  │  └─ overlay.js         # the interactive map view (canvas + sidebar)
│  └─ data/
│     └─ element-names.json # ONI element display names
├─ patches/                 # frozen oni-save-parser patches (auto-applied)
├─ netlify.toml             # Netlify build config
└─ .github/workflows/       # auto-deploy on push to main
```

### Adding more views
The app is built to grow past the storage map. `src/main.js` holds a `VIEWS` registry:

```js
const VIEWS = [
  { id: "overlay", label: "Storage map", extract: extractBoxes, mount: mountOverlay },
  // { id: "report", label: "Colony report", extract: extractReport, mount: mountReport },
];
```

Each view supplies an `extract(save)` (pure data from the shared parsed save — no re-parsing when
switching tabs) and a `mount(rootEl, data)` that renders into a container and returns a teardown
function. Add an entry and it appears as a tab. A full colony report (duplicants, geysers,
research, resources) is the obvious next one — the CLI already produces that data.

---

## Develop
```bash
npm install        # also applies the parser patches via postinstall
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build
```

Requires Node 18+.

> The dev build exposes a `window.__scan.run(arrayBuffer)` hook for testing the parse pipeline
> without the OS file picker. It is stripped from production builds (`import.meta.env.DEV`).

---

## Deploy

Pushing to `main` on GitHub triggers a GitHub Actions workflow that builds the site and deploys
it to Netlify (`.github/workflows/deploy.yml`). It needs two repository secrets:

- `NETLIFY_AUTH_TOKEN` — a Netlify personal access token
- `NETLIFY_SITE_ID` — the target site's API ID

Manual deploy (from a local build) is also fine:
```bash
npm run build
npx netlify-cli deploy --prod --dir dist --site <NETLIFY_SITE_ID>
```

---

## Background

This started as a one-off: a Node CLI ([`oni-save-parser`](https://github.com/RoboPhred/oni-save-parser)-based)
that turned an ONI save into a Markdown colony report, then a standalone HTML artifact showing
storage on a map. This repo is that idea rebuilt as a shareable web app that reads *any* save,
with parsing moved into the browser so no file ever has to leave your computer.

## Ideas / not done
- Move parsing to a **Web Worker** so large saves don't freeze the tab.
- Full **colony report** view (dupes, geysers, research, resources) as a second tab.
- Overlay the map on an actual base screenshot instead of a footprint silhouette.
- Multi-asteroid clusters are listed flat, not split per asteroid.

## Credits & license
- Save parsing by [RoboPhred/oni-save-parser](https://github.com/RoboPhred/oni-save-parser) (MIT).
- Oxygen Not Included is a game by [Klei Entertainment](https://www.klei.com/). This is an
  unofficial fan tool and is not affiliated with or endorsed by Klei.
- This project: MIT.
