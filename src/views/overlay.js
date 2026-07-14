// Storage overlay view. Mounts an interactive top-down map + search sidebar into `root`
// from the { meta, boxes, buildings } object produced by extractBoxes().
// Ported from the standalone build-overlay.mjs client script; scoped to `root`.

// Building sprites (bundled + fingerprinted by Vite). Keyed by container category.
// Categories without a sprite (Ration Box, Critter Drop-Off) fall back to a colored dot.
import spriteBin from "../sprites/Storage_Bin_Sprite.webp";
import spriteSmart from "../sprites/Smart_Storage_Bin_Sprite.webp";
import spriteFridge from "../sprites/Refrigerator_Sprite.webp";
import spriteGas from "../sprites/Gas_Reservoir_Sprite.webp";
import spriteLiquid from "../sprites/Liquid_Reservoir_Sprite.webp";
import spriteDispenser from "../sprites/Automatic_Dispenser_Sprite.webp";

const SPRITE_SRC = {
  "Storage Bin": spriteBin,
  "Smart Storage Bin": spriteSmart,
  "Refrigerator": spriteFridge,
  "Gas Reservoir": spriteGas,
  "Liquid Reservoir": spriteLiquid,
  "Object Dispenser": spriteDispenser,
};

const CATCOLORS = {
  "Storage Bin": "#3fd0c4", "Smart Storage Bin": "#5ad1ff", "Refrigerator": "#7ee0a0",
  "Liquid Reservoir": "#5aa0ff", "Gas Reservoir": "#c79bff", "Ration Box": "#7ee0a0",
  "Object Dispenser": "#f4a94c", "Critter Drop-Off": "#f47c9c",
};
const catColor = (c) => CATCOLORS[c] || "#9fb2ba";
const norm = (s) => s.toLowerCase();
const fmtKg = (kg) => (kg >= 1000 ? (kg / 1000).toFixed(kg >= 10000 ? 0 : 1) + " t" : kg + " kg");

const MARKUP = `
  <div class="ov-wrap">
    <div class="stage" data-el="stage">
      <canvas data-el="cv"></canvas>
      <div class="stage-hud">
        <h1>Storage Scanner</h1>
        <div class="sub mono" data-el="hudsub"></div>
      </div>
      <div class="hint">scroll = zoom · drag = pan · hover a bin for contents</div>
      <div class="tip" data-el="tip"></div>
    </div>
    <aside>
      <div class="search">
        <input data-el="q" placeholder="Search an item — coal, seed, plastic…" autocomplete="off" spellcheck="false">
        <div class="res" data-el="res"></div>
      </div>
      <div class="tabs">
        <div class="tab on" data-tab="items">Item index</div>
        <div class="tab" data-tab="bins">Bins</div>
      </div>
      <div class="scroll" data-el="list"></div>
      <div class="legend" data-el="legend"></div>
      <div class="foot mono" data-el="foot"></div>
    </aside>
  </div>
`;

export function mountOverlay(root, data) {
  root.innerHTML = MARKUP;
  const $ = (name) => root.querySelector(`[data-el="${name}"]`);
  const { meta, boxes, buildings } = data;
  const cv = $("cv"), ctx = cv.getContext("2d");
  const stage = $("stage"), tip = $("tip"), qEl = $("q");
  const B = meta.bounds;
  const worldW = (B.maxX - B.minX) + 4, worldH = (B.maxY - B.minY) + 4;
  const maxBin = Math.max(...boxes.map((b) => b.totalKg), 1);

  // Preload the building sprites; redraw as each arrives so markers pop in.
  const sprites = {}; // category -> HTMLImageElement
  for (const [cat, src] of Object.entries(SPRITE_SRC)) {
    const img = new Image();
    img.onload = () => draw();
    img.src = src;
    sprites[cat] = img;
  }
  // Target on-screen sprite height, in px: ~2.6 world cells, but never smaller than 15px
  // (so bins stay visible when zoomed out) — this is what makes zoom scale the icons.
  const spriteH = () => Math.max(15, 2.6 * view.scale);

  let view = { scale: 1, ox: 0, oy: 0 }, fit = { scale: 1, ox: 0, oy: 0 };
  function computeFit() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const s = Math.min(w / worldW, h / worldH) * 0.92;
    fit = { scale: s, ox: (w - worldW * s) / 2, oy: (h - worldH * s) / 2 };
    view = { ...fit };
  }
  const sx = (wx) => (wx - (B.minX - 2)) * view.scale + view.ox;
  const sy = (wy) => (B.maxY + 2 - wy) * view.scale + view.oy; // flip y (world up -> screen down)

  let query = "", activeItem = null, selected = null, tab = "items";
  const boxMatches = (b, term) => {
    if (!term) return null;
    let kg = 0, hit = false;
    for (const it of b.items) if (norm(it.name).includes(term)) { hit = true; kg += it.kg; }
    return hit ? kg : null;
  };
  const currentTerm = () => (activeItem ? norm(activeItem) : (query.trim() ? norm(query.trim()) : ""));
  const binTitle = (b) => (b.name ? b.name : b.category);

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = stage.clientWidth * dpr;
    cv.height = stage.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

    // grid every 16 cells
    ctx.strokeStyle = "#16232a"; ctx.lineWidth = 1; ctx.beginPath();
    for (let gx = Math.ceil((B.minX - 2) / 16) * 16; gx <= B.maxX + 2; gx += 16) { ctx.moveTo(sx(gx), sy(B.maxY + 2)); ctx.lineTo(sx(gx), sy(B.minY - 2)); }
    for (let gy = Math.ceil((B.minY - 2) / 16) * 16; gy <= B.maxY + 2; gy += 16) { ctx.moveTo(sx(B.minX - 2), sy(gy)); ctx.lineTo(sx(B.maxX + 2), sy(gy)); }
    ctx.stroke();

    // building silhouette
    const ps = Math.max(1, view.scale * 0.9);
    ctx.fillStyle = "rgba(120,150,162,0.14)";
    for (const [bx, by] of buildings) ctx.fillRect(sx(bx) - ps / 2, sy(by) - ps / 2, ps, ps);

    const term = currentTerm();
    const H = spriteH();
    // Painter's order so overlap is consistent, not arbitrary save order:
    //   1. hits drawn last (glow/ring on top of neighbors)
    //   2. higher world-y first → lower-on-screen sprites drawn in front (occlude those behind)
    //   3. left-to-right within a row
    const order = [...boxes].sort((a, b) => {
      const ha = boxMatches(a, term) != null, hb = boxMatches(b, term) != null;
      if (ha !== hb) return ha ? 1 : -1;
      if (a.y !== b.y) return b.y - a.y;
      return a.x - b.x;
    });
    for (const b of order) {
      const x = sx(b.x), y = sy(b.y);
      const isHit = boxMatches(b, term) != null, dimmed = term && !isHit, sel = selected === b;
      const img = sprites[b.category];
      const ready = img && img.complete && img.naturalWidth;

      if (ready) {
        const h = H, w = H * (img.naturalWidth / img.naturalHeight);
        if (isHit) { ctx.beginPath(); ctx.arc(x, y, Math.max(w, h) / 2 + 7, 0, 7); ctx.fillStyle = "rgba(244,169,76,0.20)"; ctx.fill(); }
        ctx.globalAlpha = dimmed ? 0.3 : 1;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        ctx.globalAlpha = 1;
        if (sel || isHit) {
          ctx.lineWidth = sel ? 2.5 : 2;
          ctx.strokeStyle = sel ? "#fff" : "#f4a94c";
          const pad = 2;
          ctx.strokeRect(x - w / 2 - pad, y - h / 2 - pad, w + 2 * pad, h + 2 * pad);
        }
      } else {
        // No sprite for this category (Ration Box, Critter Drop-Off) or not loaded yet.
        const r = Math.max(3.2, H * 0.32);
        if (isHit) { ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.fillStyle = "rgba(244,169,76,0.18)"; ctx.fill(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = dimmed ? "rgba(120,140,150,0.16)" : (isHit ? "#f4a94c" : catColor(b.category));
        ctx.globalAlpha = dimmed ? 0.5 : 1; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = sel ? 2.5 : 1;
        ctx.strokeStyle = sel ? "#fff" : "rgba(0,0,0,0.45)"; ctx.stroke();
      }
    }
  }

  function binAt(mx, my) {
    const rad = spriteH() * 0.55; // roughly the sprite half-extent
    let best = null, bd = 1e9;
    for (const b of boxes) {
      const dx = sx(b.x) - mx, dy = sy(b.y) - my, d = dx * dx + dy * dy;
      if (d < rad * rad && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function showTip(b, px, py) {
    const term = currentTerm();
    const rows = b.items.slice(0, 9).map((it) => {
      const hit = term && norm(it.name).includes(term);
      return `<li${hit ? ' class="hit"' : ""}><span>${it.name}</span><span class="qty">${fmtKg(it.kg)}</span></li>`;
    }).join("");
    const more = b.items.length > 9 ? `<li class="more">+${b.items.length - 9} more…</li>` : "";
    const empty = b.items.length ? "" : '<li class="more">empty</li>';
    tip.innerHTML = `<div class="th"><span class="tname">${binTitle(b)}</span>` +
      `<span class="tpos mono">${b.x}, ${b.y}</span></div>` +
      `<div class="qty mono" style="margin-bottom:4px">${b.category} · ${fmtKg(b.totalKg)}</div>` +
      `<ul>${rows}${more}${empty}</ul>`;
    tip.style.display = "block";
    const tw = tip.offsetWidth, th = tip.offsetHeight, W = stage.clientWidth, H = stage.clientHeight;
    let x = px + 14, y = py + 14;
    if (x + tw > W - 8) x = px - tw - 14;
    if (y + th > H - 8) y = py - th - 14;
    tip.style.left = Math.max(6, x) + "px"; tip.style.top = Math.max(6, y) + "px";
  }

  // ---- interaction ----
  let dragging = false, moved = false, last = null;
  const onDown = (e) => { dragging = true; moved = false; last = [e.clientX, e.clientY]; cv.classList.add("drag"); };
  const onUp = () => { dragging = false; cv.classList.remove("drag"); };
  const onMove = (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragging) {
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      view.ox += dx; view.oy += dy; last = [e.clientX, e.clientY]; draw(); tip.style.display = "none"; return;
    }
    if (e.target !== cv) { tip.style.display = "none"; return; }
    const b = binAt(mx, my);
    if (b) { cv.style.cursor = "pointer"; showTip(b, mx, my); }
    else { cv.style.cursor = "grab"; tip.style.display = "none"; }
  };
  cv.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("mousemove", onMove);
  cv.addEventListener("click", (e) => {
    if (moved) return;
    const rect = cv.getBoundingClientRect();
    const b = binAt(e.clientX - rect.left, e.clientY - rect.top);
    selected = (selected === b) ? null : b;
    if (b) { switchTab("bins"); renderList(); const el = root.querySelector(`[data-bin="${b.id}"]`); if (el) el.scrollIntoView({ block: "nearest" }); }
    draw();
  });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(fit.scale * 14, Math.max(fit.scale * 0.6, view.scale * f));
    view.ox = mx - (mx - view.ox) * (ns / view.scale);
    view.oy = my - (my - view.oy) * (ns / view.scale);
    view.scale = ns; draw();
  }, { passive: false });

  // ---- sidebar ----
  const itemTotals = new Map();
  for (const b of boxes) for (const it of b.items) {
    const t = itemTotals.get(it.name) || { kg: 0, bins: 0 };
    t.kg += it.kg; t.bins += 1; itemTotals.set(it.name, t);
  }
  const itemsSorted = [...itemTotals.entries()].sort((a, b) => b[1].kg - a[1].kg);
  const maxItemKg = itemsSorted.length ? itemsSorted[0][1].kg : 1;
  const totalStored = [...itemTotals.values()].reduce((a, t) => a + t.kg, 0);

  function renderItems() {
    const list = $("list");
    list.innerHTML = itemsSorted.map(([name, t]) => {
      const on = activeItem && norm(activeItem) === norm(name);
      const bw = Math.max(6, Math.round(t.kg / maxItemKg * 54));
      return `<div class="irow${on ? " on" : ""}" data-item="${name.replace(/"/g, "&quot;")}">` +
        `<span class="nm">${name}</span><span class="bar" style="width:${bw}px"></span>` +
        `<span class="kg mono">${fmtKg(t.kg)}</span><span class="bn mono">${t.bins}×</span></div>`;
    }).join("");
    list.querySelectorAll(".irow").forEach((el) => {
      el.onclick = () => { const n = el.getAttribute("data-item"); activeItem = (activeItem === n) ? null : n; query = ""; qEl.value = ""; syncAll(); };
    });
  }

  function renderBins() {
    const list = $("list"); const term = currentTerm();
    const rows = boxes.map((b) => ({ b, m: boxMatches(b, term) }))
      .sort((a, b) => (b.m || -1) - (a.m || -1) || b.b.totalKg - a.b.totalKg);
    list.innerHTML = rows.map(({ b, m }) => {
      const contents = b.items.length ? b.items.map((it) => {
        const hit = term && norm(it.name).includes(term);
        return hit ? `<span class="hit">${it.name}</span>` : it.name;
      }).join(", ") : "empty";
      return `<div class="binrow${selected === b ? " on" : ""}${m != null ? " hit" : ""}" data-bin="${b.id}">` +
        `<div class="bh"><span class="cat">${binTitle(b)}</span>` +
        `<span class="co mono">${b.x},${b.y} · ${fmtKg(b.totalKg)}</span></div>` +
        `<div class="contents">${contents}</div></div>`;
    }).join("");
    list.querySelectorAll(".binrow").forEach((el) => {
      el.onclick = () => { const id = +el.getAttribute("data-bin"); selected = boxes.find((x) => x.id === id); centerOn(selected); draw(); renderBins(); };
    });
  }
  const renderList = () => (tab === "items" ? renderItems() : renderBins());

  function centerOn(b) {
    if (!b) return;
    if (view.scale < fit.scale * 1.3) view.scale = fit.scale * 2.2;
    view.ox = stage.clientWidth / 2 - (b.x - (B.minX - 2)) * view.scale;
    view.oy = stage.clientHeight / 2 - (B.maxY + 2 - b.y) * view.scale;
  }

  function renderRes() {
    const res = $("res"), term = currentTerm();
    if (!term) { res.innerHTML = `${boxes.length} containers · ${fmtKg(totalStored)} stored`; return; }
    let bins = 0, kg = 0;
    for (const b of boxes) { const m = boxMatches(b, term); if (m != null) { bins++; kg += m; } }
    const label = activeItem ? activeItem : `"${query.trim()}"`;
    res.innerHTML = bins
      ? `<span class="clear" data-el="clr">clear</span>Found <b>${fmtKg(kg)}</b> of ${label} in <b>${bins}</b> bin${bins > 1 ? "s" : ""}`
      : `<span class="clear" data-el="clr">clear</span>No bins contain ${label}`;
    const clr = res.querySelector('[data-el="clr"]');
    if (clr) clr.onclick = () => { query = ""; activeItem = null; qEl.value = ""; syncAll(); };
  }

  const syncAll = () => { renderRes(); renderList(); draw(); };
  qEl.addEventListener("input", () => { query = qEl.value; activeItem = null; syncAll(); });

  function switchTab(t) { tab = t; root.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.tab === t)); renderList(); }
  root.querySelectorAll(".tab").forEach((el) => (el.onclick = () => switchTab(el.dataset.tab)));

  $("hudsub").textContent = `${meta.base} · cycle ${meta.cycle}`;
  $("foot").textContent = `${boxes.length} containers · ${buildings.length} buildings`;
  const cats = [...new Set(boxes.map((b) => b.category))];
  $("legend").innerHTML = cats.map((c) => {
    const n = boxes.filter((b) => b.category === c).length;
    const icon = SPRITE_SRC[c]
      ? `<img class="lgs" src="${SPRITE_SRC[c]}" alt="" />`
      : `<i class="dot" style="background:${catColor(c)}"></i>`;
    return `<span>${icon}${c} (${n})</span>`;
  }).join("");

  const onResize = () => { const k = view.scale / fit.scale; computeFit(); view.scale = fit.scale * k; draw(); };
  window.addEventListener("resize", onResize);
  computeFit(); syncAll();

  // return a teardown so the shell can unmount cleanly when loading a new save
  return () => {
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("resize", onResize);
    root.innerHTML = "";
  };
}
