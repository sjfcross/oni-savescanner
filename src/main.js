// App shell: landing dropzone -> parse in-browser -> mount a view.
// Architected for more than one view: `VIEWS` is a registry keyed by id; today only the
// storage overlay is wired, but adding a "Report" tab later is just another entry.
import "./style.css";
import { loadSave } from "./parse/loadSave.js";
import { extractBoxes } from "./parse/boxes.js";
import { mountOverlay } from "./views/overlay.js";

const VIEWS = [
  {
    id: "overlay",
    label: "Storage map",
    extract: extractBoxes,
    mount: mountOverlay,
  },
  // future: { id: "report", label: "Colony report", extract: extractReport, mount: mountReport },
];

const app = document.getElementById("app");
let save = null;        // the parsed save, kept so views can be switched without re-parsing
let meta = null;
let teardown = null;    // current view's cleanup
let activeView = VIEWS[0].id;

// ---------- landing ----------
function renderLanding(error) {
  app.innerHTML = `
    <div class="landing">
      <div class="drop" data-el="drop" tabindex="0" role="button" aria-label="Choose or drop an ONI save file">
        <div class="badge">📦</div>
        <h1>ONI Save Scanner</h1>
        <p class="lede">Drop your Oxygen Not Included <code>.sav</code> here to map every storage
          bin and search what's inside.</p>
        <button class="pick" data-el="pick" type="button">Choose a save file</button>
        <input type="file" accept=".sav" data-el="file" hidden />
        <p class="privacy">🔒 Runs entirely in your browser. Your save never leaves your computer — no upload, no server.</p>
        ${error ? `<p class="err">${error}</p>` : ""}
        <p class="where">Saves live in <code class="mono">Documents\\Klei\\OxygenNotIncluded\\cloud_save_files\\…</code></p>
      </div>
    </div>`;

  const drop = app.querySelector('[data-el="drop"]');
  const file = app.querySelector('[data-el="file"]');
  app.querySelector('[data-el="pick"]').onclick = () => file.click();
  drop.onclick = (e) => { if (e.target.closest(".pick")) return; file.click(); };
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
  file.onchange = () => { if (file.files[0]) handleFile(file.files[0]); };

  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}

// ---------- loading ----------
function renderLoading(name) {
  app.innerHTML = `<div class="landing"><div class="drop loading"><div class="badge spin">📦</div>
    <h1>Reading ${name}…</h1><p class="lede">Parsing the save in your browser.</p></div></div>`;
}

async function handleFile(f) {
  if (!/\.sav$/i.test(f.name)) { renderLanding("That's not a .sav file."); return; }
  renderLoading(f.name);
  try {
    const buf = await f.arrayBuffer();
    // yield a frame so the loading state paints before the (synchronous) parse blocks
    await new Promise((r) => setTimeout(r, 16));
    save = loadSave(buf);
    meta = { save: f.name };
    activeView = VIEWS[0].id;
    renderApp();
  } catch (err) {
    console.error(err);
    renderLanding(err.message || "Couldn't read that save.");
  }
}

// ---------- app frame + view ----------
function renderApp() {
  if (teardown) { teardown(); teardown = null; }
  const view = VIEWS.find((v) => v.id === activeView);
  const data = view.extract(save);
  data.meta.save = meta.save;

  app.innerHTML = `
    <div class="frame">
      <header class="topbar">
        <div class="brand"><span class="mk">📦</span> ONI Save Scanner</div>
        <nav class="viewtabs">
          ${VIEWS.map((v) => `<button class="vt${v.id === activeView ? " on" : ""}" data-view="${v.id}">${v.label}</button>`).join("")}
        </nav>
        <div class="filechip mono" title="Loaded save (local only)">
          <span class="fn">${data.meta.save}</span>
          <button class="another" data-el="another" type="button">Load another</button>
        </div>
      </header>
      <div class="viewport" data-el="viewport"></div>
    </div>`;

  app.querySelector('[data-el="another"]').onclick = () => { if (teardown) teardown(); save = null; renderLanding(); };
  app.querySelectorAll(".vt").forEach((b) => (b.onclick = () => { if (b.dataset.view !== activeView) { activeView = b.dataset.view; renderApp(); } }));

  teardown = view.mount(app.querySelector('[data-el="viewport"]'), data);
}

renderLanding();

// Dev-only: lets the test harness drive the real pipeline from an ArrayBuffer,
// since a headless browser can't operate the OS file picker. Stripped from prod builds.
if (import.meta.env.DEV) {
  window.__scan = {
    run(buf) {
      save = loadSave(buf);
      meta = { save: "test.sav" };
      activeView = VIEWS[0].id;
      renderApp();
      return extractBoxes(save).meta;
    },
  };
}
