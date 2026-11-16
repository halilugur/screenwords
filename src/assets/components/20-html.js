/* HTML scenes: a component drawn by the browser instead of by canvas code.
   An `htmlOverlay_<slug>` component carries `params.html` and `params.css`;
   they are laid over the canvas in a 1080-wide box (the drawing space every
   other component uses) and scaled with the stage, so type, flexbox, grid,
   SVG and CSS animation are all available to a scene.

   Time belongs to the film, not to the browser: nothing plays by itself.
   On every frame each CSS animation in the scene is paused and set to where
   the film is, so the same frame always looks the same — in the editor, in
   the exported player and in every frame of a render.

   - An animation runs from the moment its scene starts.
   - An element with `data-at="w12"` is hidden until that word is spoken; its
     animations (and those of everything inside it) run from that word.
     `data-until="w20"` hides it again from that word on.
   - `--t` (seconds into the scene), `--p` (0..1 through it) and, on a
     `data-at` element, `--since` (seconds since its word) are set as custom
     properties for `calc()`.
   - `--paper`, `--ink`, `--accent`, `--accent2`, `--accent-ink` are the
     theme's colours.

   The browser's default styles are removed first: a heading, a <b>, a list
   or a button looks like plain text until the scene's CSS says otherwise.
   Scripts in the markup do not run and CSS transitions are switched off:
   both would make a frame depend on what was shown before it. */

const SW_HTML_PREFIX = 'htmlOverlay_';
/* Every scene starts from the same sheet: the browser's own styles removed
   (SW_RESET_CSS), the frame-sized box, the theme's type and colour,
   hidden-until-spoken, and no transitions. */
const SW_HTML_BASE = SW_RESET_CSS + '\n:host { all: initial; position: absolute; left: 0; top: 0; display: block; overflow: hidden; transform-origin: 0 0;'
  + ' color: var(--ink); font-family: "Space Grotesk", "Montserrat", sans-serif; font-size: 40px; line-height: 1.2; }'
  + ' *, ::before, ::after { transition: none !important; }'
  + ' [data-at]:not(.on), [data-until].off { visibility: hidden; }';

const SW_HTML_THEME = [['paper', '--paper'], ['ink', '--ink'], ['accent', '--accent'], ['accent2', '--accent2'], ['accentInk', '--accent-ink']];

/* Changes on every frame an HTML scene is on show, empty when none is: a
   renderer that snapshots the DOM only when it changes reads this, because
   seeking an animation changes the picture without changing the markup. */
let swHtmlFrame = '';
function swHtmlKey() { return swHtmlFrame; }

/* Lays out and seeks every HTML scene active at `time`. `canvas` is the
   stage canvas; the scenes sit directly over it, under the page's captions.
   env: { words, theme }. */
function swHtmlOverlays(canvas, comps, time, env) {
  if (typeof document === 'undefined' || !canvas || !canvas.parentNode) return;
  env = env || {};
  const all = (comps || []).filter(c => c.componentId && c.componentId.indexOf(SW_HTML_PREFIX) === 0);
  let layer = canvas.parentNode.querySelector(':scope > .sw-html-layer');
  if (!all.length && !layer) return;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'sw-html-layer';
    layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    canvas.insertAdjacentElement('afterend', layer);
  }
  const words = env.words || [];
  const startOf = id => { const w = words.find(x => x.id === id); return w ? w.start : null; };
  const theme = env.theme || {};
  const box = layer.getBoundingClientRect();
  const W = 1080, H = box.width > 0 ? Math.round(W * box.height / box.width) : 1920;
  const hosts = new Map();
  for (const host of Array.from(layer.children)) hosts.set(host.dataset.htmlOverlay, host);
  const active = all.filter(c => time >= c.start && time <= c.end);
  for (const [id, host] of hosts) {
    if (!all.some(c => c.id === id)) host.remove();
    else if (!active.some(c => c.id === id)) host.style.display = 'none';
  }
  for (const c of active) {
    const p = c.params || {};
    let host = hosts.get(c.id);
    if (!host) {
      host = document.createElement('div');
      host.dataset.htmlOverlay = c.id;
      host.attachShadow({ mode: 'open' });
      layer.appendChild(host);
    }
    const source = String(p.css || '') + '\u0000' + String(p.html || '');
    if (host._swSource !== source) {
      host._swSource = source;
      const style = document.createElement('style');
      style.textContent = SW_HTML_BASE + '\n' + String(p.css || '');
      const body = document.createElement('template');
      body.innerHTML = String(p.html || '');
      host.shadowRoot.replaceChildren(style, body.content);
    }
    const local = time - c.start, dur = Math.max(0.01, c.end - c.start);
    const s = host.style;
    s.display = 'block';
    s.width = W + 'px';
    s.height = H + 'px';
    s.transform = 'scale(' + (box.width > 0 ? box.width / W : 1) + ')';
    s.zIndex = String(Math.round(Number(c.zIndex) || 0));
    s.setProperty('--t', local.toFixed(4));
    s.setProperty('--p', Math.min(1, local / dur).toFixed(4));
    for (const [key, name] of SW_HTML_THEME) if (theme[key]) s.setProperty(name, theme[key]);
    /* spoken-word gates */
    const root = host.shadowRoot;
    for (const el of root.querySelectorAll('[data-at], [data-until]')) {
      const from = el.dataset.at ? startOf(el.dataset.at) : c.start;
      const to = el.dataset.until ? startOf(el.dataset.until) : null;
      el.classList.toggle('on', from != null && time >= from);
      el.classList.toggle('off', to != null && time >= to);
      if (el.dataset.at) el.style.setProperty('--since', (from == null ? -1 : time - from).toFixed(4));
    }
    /* every animation is where the film is, not where the clock is */
    for (const a of (root.getAnimations ? root.getAnimations() : [])) {
      const target = a.effect && a.effect.target;
      const gate = target && target.closest ? target.closest('[data-at]') : null;
      const from = gate ? startOf(gate.dataset.at) : c.start;
      a.pause();
      a.currentTime = from == null ? 0 : Math.max(0, time - from) * 1000;
    }
  }
  swHtmlFrame = active.length ? time.toFixed(4) : '';
}
