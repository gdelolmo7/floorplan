// "How it works": the app's main processes in plain words (graph.processes, from architecture.json
// `processes`). Each process is a row of emoji-labelled steps joined by labelled arrows; the processes
// stack top to bottom. A step that points at a node or file opens it on the map. Drawn with plain
// HTML and SVG, so it works offline like the rest. Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  const P = SC && SC.graph.processes;
  if (!P || !P.length) return;
  const { h } = SC;

  SC.icons.processes = '<rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M9 6.5h6M18 9v2.5a1.5 1.5 0 0 1-1.5 1.5H12v2"/>';

  const W = 172, H = 96, GX = 92, GY = 22; // card size and the gaps between columns and rows

  const style = document.createElement('style');
  style.textContent = `
    #pr-view { position: fixed; inset: 0; z-index: 60; background: var(--bg); overflow: auto; display: none; }
    #pr-view.open { display: block; }
    #pr-view .pr-top { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 14px var(--gutter); background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--hair); }
    #pr-view .pr-top h2 { margin: 0; font-size: 17px; font-weight: 600; flex: 1; }
    #pr-view .pr-top .pr-hint { color: var(--text-3); font-size: 12.5px; }
    #pr-view .pr-body { padding: 22px var(--gutter) 60px; max-width: 100%; }
    .pr-sec { background: var(--surface); border: 1px solid var(--hair); border-radius: var(--r-panel); padding: 18px 20px 20px; box-shadow: var(--shadow-card); }
    .pr-sec h3 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; }
    .pr-sec .pr-d { color: var(--text-2); font-size: 13px; line-height: 1.55; margin-top: 4px; max-width: 760px; }
    .pr-scroll { overflow-x: auto; margin-top: 14px; padding-bottom: 4px; }
    .pr-canvas { position: relative; }
    .pr-canvas svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    .pr-canvas svg path { fill: none; stroke: var(--text-4); stroke-width: 1.5; }
    .pr-canvas svg text { fill: var(--text-3); font: 500 11.5px var(--sans); }
    .pr-canvas svg .pr-lb { fill: var(--surface); }
    .pr-step { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; padding: 8px 10px; border-radius: 16px; background: var(--raise); border: 1px solid var(--hair-2); color: var(--text); font: 500 12.5px/1.35 var(--sans); }
    .pr-step .pr-e { font-size: 20px; line-height: 1; }
    .pr-step .pr-l { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .pr-step.link { cursor: pointer; }
    .pr-step.link:hover, .pr-step.link:focus-visible { background: var(--raise-2); border-color: var(--ring); outline: none; }
    .pr-step.link::after { content: "↗"; position: absolute; top: 6px; right: 9px; color: var(--text-4); font-size: 11px; }
    .pr-join { display: flex; justify-content: center; color: var(--text-4); font-size: 18px; padding: 6px 0; }
  `;
  document.head.appendChild(style);

  /** Columns by longest path from the first steps; arrows that point back (loops) are left out of the ranking. */
  function layout(pr) {
    const order = new Map(pr.steps.map((s, i) => [s.id, i]));
    const out = new Map(pr.steps.map((s) => [s.id, []]));
    for (const a of pr.arrows) out.get(a.a).push(a);
    const back = new Set(), seen = new Set(), stack = new Set();
    const dfs = (id) => { seen.add(id); stack.add(id); for (const a of out.get(id)) { if (stack.has(a.b)) back.add(a); else if (!seen.has(a.b)) dfs(a.b); } stack.delete(id); };
    for (const s of pr.steps) if (!seen.has(s.id)) dfs(s.id);
    const col = new Map(pr.steps.map((s) => [s.id, 0]));
    for (let pass = 0; pass < pr.steps.length; pass++) for (const a of pr.arrows) if (!back.has(a) && col.get(a.b) < col.get(a.a) + 1) col.set(a.b, col.get(a.a) + 1);
    const cols = [];
    for (const s of [...pr.steps].sort((x, y) => order.get(x.id) - order.get(y.id))) (cols[col.get(s.id)] ||= []).push(s.id);
    const rows = Math.max(...cols.map((c) => c.length));
    const pos = new Map();
    cols.forEach((c, ci) => c.forEach((id, ri) => pos.set(id, { x: ci * (W + GX), y: (ri + (rows - c.length) / 2) * (H + GY) })));
    return { pos, back, w: cols.length * (W + GX) - GX, h: rows * (H + GY) - GY };
  }

  function arrowSvg(a, pos, isBack, hgt) {
    const p = pos.get(a.a), q = pos.get(a.b);
    let d, lx, ly;
    if (isBack) { // a loop back to an earlier step: under the cards
      const y = hgt + 26, x1 = p.x + W / 2, x2 = q.x + W / 2;
      d = `M${x1},${p.y + H} C${x1},${y} ${x2},${y} ${x2},${q.y + H + 6}`;
      lx = (x1 + x2) / 2; ly = y - 4;
    } else {
      const x1 = p.x + W, y1 = p.y + H / 2, x2 = q.x - 6, y2 = q.y + H / 2, m = (x1 + x2) / 2;
      d = `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
      lx = m; ly = (y1 + y2) / 2 - 7;
    }
    const lab = a.label ? `<text class="pr-lb" x="${lx}" y="${ly}" text-anchor="middle" stroke="var(--surface)" stroke-width="5" stroke-linejoin="round">${h(a.label)}</text><text x="${lx}" y="${ly}" text-anchor="middle">${h(a.label)}</text>` : '';
    return `<path d="${d}" marker-end="url(#pr-arrow)"/>${lab}`;
  }

  function section(pr, i) {
    const { pos, back, w, h: hgt } = layout(pr);
    const extra = back.size ? 40 : 0;
    const cards = pr.steps.map((s) => {
      const p = pos.get(s.id), link = s.ref && SC.exists(s.ref);
      const tip = [s.note, link ? `Opens “${SC.info(s.ref).name}” on the map` : ''].filter(Boolean).join(' · ');
      return `<div class="pr-step${link ? ' link' : ''}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px"${link ? ` tabindex="0" role="button" data-ref="${h(s.ref)}"` : ''}${tip ? ` title="${h(tip)}"` : ''}>${s.emoji ? `<span class="pr-e">${h(s.emoji)}</span>` : ''}<span class="pr-l">${h(s.label)}</span></div>`;
    }).join('');
    const svg = `<svg width="${w}" height="${hgt + extra}"><defs><marker id="pr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" style="fill:var(--text-4);stroke:none"/></marker></defs>${pr.arrows.map((a) => arrowSvg(a, pos, back.has(a), hgt)).join('')}</svg>`;
    return `${i ? '<div class="pr-join" aria-hidden="true">↓</div>' : ''}<section class="pr-sec"><h3>${h(pr.title)}</h3>${pr.description ? `<div class="pr-d">${h(pr.description)}</div>` : ''}<div class="pr-scroll"><div class="pr-canvas" style="width:${w}px;height:${hgt + extra}px">${svg}${cards}</div></div></section>`;
  }

  const view = document.createElement('div');
  view.id = 'pr-view';
  view.setAttribute('role', 'dialog');
  view.setAttribute('aria-label', 'How it works');
  view.innerHTML = `<div class="pr-top"><h2>How it works</h2><span class="pr-hint">Click a step with ↗ to see it on the map</span><button class="btn" data-close>Back to the map</button></div><div class="pr-body">${P.map(section).join('')}</div>`;
  document.body.appendChild(view);

  const close = () => view.classList.remove('open');
  const openRef = (ref) => { close(); SC.reveal(ref); };
  view.querySelector('[data-close]').onclick = close;
  view.querySelectorAll('[data-ref]').forEach((el) => {
    el.addEventListener('click', () => openRef(el.dataset.ref));
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRef(el.dataset.ref); } });
  });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && view.classList.contains('open')) { ev.stopPropagation(); close(); } }, true);

  SC.addHeaderButton({ id: 'btn-processes', label: 'How it works', icon: 'processes', title: "The app's main processes, in plain words", onClick: () => { SC.closeMenus(); view.classList.add('open'); view.scrollTop = 0; } });
})();
