/* ===== screenwords component library =====
   Injected into player.html and editor.html at the COMPONENTS marker by
   render_html_in and the editor page route. One implementation of every
   component for both renderers: the exported video and the editor stage.
   Host contract: global T (theme), pointOf, hash01, initialsOf, getImage. */

/* Component ids the canvas chain knows how to paint. Both pages receive this
   one library, so the registry, the renderers, and the catalog cannot drift. */
const RENDERED_IDS = [
  'lowerThird', 'titleCard', 'quoteBox', 'statBadge', 'chapterCard',
  'captions', 'kineticWords', 'subtitleBar',
  'numberCounter', 'calloutBox', 'arrowPointer', 'flowConnector', 'linkNodes',
  'clickHighlight', 'highlightMarker', 'iconPop', 'brandLogo', 'progressBar',
  'spotlight', 'circleShape', 'imageOverlay', 'shapeBadge', 'dividerLine',
  'gaugeMeter', 'badgePill',
  'typewriter', 'neonPulse', 'dataBars', 'waveform', 'countdownRing', 'terminalPanel',
  'progressRing', 'cornerFrame', 'marqueeTicker',
  'ambientBackground', 'gradientBackground', 'meshBackground', 'gridBackground', 'particlesBackground',
  'gridWarp', 'starfieldWarp', 'bokehDrift',
  'punchIn', 'splitScreen', 'pictureInPicture', 'textBehindSubject', 'cameraPan',
  'maskBlur', 'vignetteDim', 'glowPulse', 'confettiBurst', 'spotlightFollow', 'scanLines',
  'transitionCrossfade', 'transitionDipToColor', 'transitionSlide', 'transitionWipe',
  'transitionZoomBlur', 'transitionWhipPan', 'transitionGlitch',
  'lottieLowerThird', 'lottieSectionTitle', 'lottieChapterCard', 'lottieSubscribe',
  'lottieSocialHandle', 'lottieEmphasisBurst', 'lottieCountdown', 'lottieLogoReveal'
];

/* Scene components drawn by the character modules (02e-conversation.js). */
const SW_SCENE_IDS = ['conversation'];

/* The player presents these six through styled DOM overlays; any renderer
   without those overlays paints the canvas fallback instead. */
const DRAW_FALLBACK_IDS = [
  'lowerThird', 'titleCard', 'numberCounter', 'captions', 'kineticWords', 'subtitleBar'
];
const DRAW_FALLBACK_SET = new Set(DRAW_FALLBACK_IDS);

/* Background components override the procedural scene style for their window. */
function sharedSceneOverride(comps, time) {
  const BG_IDS = ['ambientBackground', 'gradientBackground', 'meshBackground', 'gridBackground', 'particlesBackground'];
  const BG_DEFAULT = {
    ambientBackground: 'studio', gradientBackground: 'mesh', meshBackground: 'mesh',
    gridBackground: 'grid', particlesBackground: 'stars'
  };
  const bgComp = (comps || [])
    .filter(c => BG_IDS.indexOf(c.componentId) >= 0 && time >= c.start && time <= c.end)
    .sort((a, b) => b.start - a.start)[0];
  if (!bgComp) return null;
  const bp = bgComp.params || {};
  return { params: Object.assign({}, bp, { style: bp.style || BG_DEFAULT[bgComp.componentId] }) };
}

/* Whole-stage camera moves: punch-in, pan drift, slide/whip/zoom transitions,
   and the transform components added with the 300-id catalog. */
function sharedSceneTransforms(ctx, comps, W, H, time) {
  comps = comps || [];
  const active = id => comps.find(c => c.componentId === id && time >= c.start && time <= c.end);

  const activePunch = active('punchIn');
  if (activePunch) {
    const p = activePunch.params || {};
    const scale = p.scale || 1.35;
    const dur = Math.max(0.1, activePunch.end - activePunch.start);
    const enterProg = Math.min(1, (time - activePunch.start) / Math.min(0.4, dur * 0.3));
    const ease = enterProg * enterProg * (3 - 2 * enterProg);
    const curScale = 1 + (scale - 1) * ease;
    const cx = (p.position?.x ?? 0.5) * W;
    const cy = (p.position?.y ?? 0.5) * H;
    ctx.translate(cx, cy);
    ctx.scale(curScale, curScale);
    ctx.translate(-cx, -cy);
  }

  const panComp = active('cameraPan');
  if (panComp) {
    const pp = panComp.params || {};
    const pr = Math.min(1, (time - panComp.start) / Math.max(0.1, panComp.end - panComp.start));
    const fp = pointOf(pp.from, 0.5, 0.5), tp = pointOf(pp.to, 0.5, 0.5);
    const st = pp.strength ?? 0.08;
    ctx.translate(-(((fp.x + (tp.x - fp.x) * pr) - 0.5) * st) * W,
                  -(((fp.y + (tp.y - fp.y) * pr) - 0.5) * st) * H);
  }

  const moveT = comps.find(c =>
    (c.componentId === 'transitionSlide' || c.componentId === 'transitionWhipPan' || c.componentId === 'transitionZoomBlur') &&
    time >= c.start && time <= c.end);
  if (moveT) {
    const mp = moveT.params || {};
    const pr = Math.min(1, (time - moveT.start) / Math.max(0.1, moveT.end - moveT.start));
    const dir = mp.direction === 'left' ? -1 : 1;
    if (moveT.componentId === 'transitionSlide') {
      const k = pr < 0.5 ? pr * 2 : (2 - 2 * pr);
      ctx.translate(-k * W * dir, 0);
    } else if (moveT.componentId === 'transitionWhipPan') {
      ctx.translate(-Math.sin(pr * Math.PI) * W * 1.15 * dir, 0);
    } else {
      const k = Math.sin(pr * Math.PI);
      ctx.translate(W / 2, H / 2); ctx.scale(1 + k * 0.18, 1 + k * 0.18); ctx.translate(-W / 2, -H / 2);
    }
  }

  /* Added with the 300-id catalog: camera-space transforms. */
  const shake = active('cameraShake');
  if (shake) {
    const q = shake.params || {};
    const amp = q.strength == null ? 12 : q.strength;
    ctx.translate(Math.sin(time * 47) * amp, Math.cos(time * 39) * amp * 0.7);
  }
  const dutch = active('dutchAngle');
  if (dutch) {
    const q = dutch.params || {};
    const pr = Math.min(1, (time - dutch.start) / Math.max(0.1, dutch.end - dutch.start));
    const angle = ((q.angle == null ? 5 : q.angle) * Math.PI / 180) * (pr < 0.5 ? pr * 2 : (2 - 2 * pr));
    ctx.translate(W / 2, H / 2); ctx.rotate(angle); ctx.translate(-W / 2, -H / 2);
  }
  const zoomEase = active('zoomEase');
  if (zoomEase) {
    const q = zoomEase.params || {};
    const pr = Math.min(1, (time - zoomEase.start) / Math.max(0.1, zoomEase.end - zoomEase.start));
    const target = q.scale == null ? 1.25 : q.scale;
    const s = q.reverse ? 1 + (target - 1) * (1 - pr) : 1 + (target - 1) * (pr * pr * (3 - 2 * pr));
    ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  }
  const sway = active('handheldSway');
  if (sway) {
    const q = sway.params || {};
    const amp = (q.strength == null ? 0.012 : q.strength) * W;
    ctx.translate(Math.sin(time * 0.7) * amp, Math.cos(time * 0.53) * amp * 0.6);
  }
  const orbit = active('orbitCamera');
  if (orbit) {
    const q = orbit.params || {};
    const amp = (q.radius == null ? 0.03 : q.radius) * W;
    ctx.translate(Math.cos(time * 1.1) * amp, Math.sin(time * 1.1) * amp);
  }
  const tilt = active('tiltShift');
  if (tilt) {
    const q = tilt.params || {};
    const v = (q.amount == null ? 0.05 : q.amount) * Math.sin(time * 1.4);
    ctx.translate(W / 2, H / 2); ctx.scale(1 + v, 1 - v * 0.5); ctx.translate(-W / 2, -H / 2);
  }

  sharedPack3Transforms(ctx, comps, W, H, time);
}

/* Phrase segmentation for caption renderers without the player's DOM layer. */
function sharedActivePhrase(words, time) {
  if (!Array.isArray(words) || !words.length) return null;
  let curr = [];
  let best = null;
  for (let i = 0; i < words.length; i++) {
    curr.push(words[i]);
    const txt = String(words[i].text || '').trim();
    const end = /[.!?:]$/.test(txt) || txt.endsWith(',') || curr.length >= 3;
    if (end) {
      if (time >= curr[0].start && time <= curr[curr.length - 1].end) best = curr.slice();
      if (best) break;
      curr = [];
    }
  }
  if (!best && curr.length && time >= curr[0].start && time <= curr[curr.length - 1].end) best = curr;
  return best;
}

/* Canvas equivalents of the six overlays the player renders in the DOM. */
function drawFallbackComponent(ctx, W, H, time, prog, c, p, GA, opts) {
  const white = '#F4F8FF';
  const theme = (typeof T !== 'undefined' && T) ? T : {};

  if (c.componentId === 'lowerThird') {
    const pos = ecXY(p, W, H, 0.5, 0.72);
    const slide = prog < 0.12 ? prog / 0.12 : prog > 0.88 ? (1 - prog) / 0.12 : 1;
    const bw = Math.min(W * 0.78, 640);
    ctx.save();
    ctx.translate((1 - slide) * -260, 0);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, pos.x - bw / 2, pos.y - 62, bw, 62, 6, p.barColor || theme.accent || '#38BDF8', null, 0);
    ecText(ctx, ecS(p.title, ''), pos.x - bw / 2 + 22, pos.y - 31, 34, p.textColor || theme.accentInk || '#04101E', 'left', 800);
    ecAlpha(ctx, GA, 0.95);
    ecPanel(ctx, pos.x - bw / 2 + 10, pos.y + 2, bw - 20, 54, 6, p.subBg || 'rgba(16,24,40,0.95)',
            p.borderColor || 'rgba(148,163,184,0.28)', 2);
    ecText(ctx, ecS(p.subtitle, ''), pos.x - bw / 2 + 32, pos.y + 29, 25, p.subColor || white, 'left', 600);
    ctx.restore();

  } else if (c.componentId === 'titleCard') {
    const pos = ecXY(p, W, H, 0.5, 0.16);
    const size = ecN(p.size, 1) * 62;
    const title = ecS(p.title, ecS(p.text, ''));
    const lines = ecWrap(ctx, title, W * 0.86, size, 900);
    ecAlpha(ctx, GA, 1);
    let y = pos.y - (lines.length - 1) * size * 0.7;
    for (const ln of lines) {
      ecText(ctx, ln, pos.x, y, size, p.titleColor || white, 'center', 900);
      y += size * 1.22;
    }
    if (p.subtitle) {
      ecText(ctx, p.subtitle, pos.x, y + size * 0.25, size * 0.42, p.subtitleColor || theme.accent || '#38BDF8', 'center', 700);
    }

  } else if (c.componentId === 'numberCounter') {
    const pos = ecXY(p, W, H, 0.5, 0.5);
    const span = Math.max(0.01, c.end - c.start);
    const q = Math.min(1, ((time - c.start) / span) * 1.15);
    const from = ecN(p.from, 0), to = ecN(p.to, 100);
    const v = Math.round(from + (to - from) * q);
    ecAlpha(ctx, GA, 1);
    ecText(ctx, ecS(p.prefix, '') + v.toLocaleString() + ecS(p.suffix, ''), pos.x, pos.y, 104,
           p.numberColor || theme.accent || '#38BDF8', 'center', 900);
    ecText(ctx, ecS(p.label, ''), pos.x, pos.y + 84, 30, p.labelColor || white, 'center', 600);

  } else if (c.componentId === 'captions' || c.componentId === 'subtitleBar' || c.componentId === 'kineticWords') {
    const words = sharedActivePhrase(opts.words, time);
    const phrase = words ? words.map(w => w.text).join(' ') : ecS(p.text, '');
    if (!phrase) return;
    const pos = ecXY(p, W, H, 0.5, c.componentId === 'kineticWords' ? 0.8 : 0.82);
    const size = c.componentId === 'kineticWords' ? ecN(p.size, 52) : ecN(p.size, 34);
    if (c.componentId === 'kineticWords' && words) {
      ecFont(ctx, size, 900);
      let total = 0;
      const widths = words.map(w => { const wd = ctx.measureText(w.text).width; total += wd; return wd; });
      total += (words.length - 1) * size * 0.28;
      let cx = pos.x - total / 2;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const now = time >= w.start && time < w.end;
        const q = w.end <= time ? 1 : now ? 1 : 0;
        ecAlpha(ctx, GA, now ? 1 : 0.62);
        ctx.font = '900 ' + Math.round(size * (now ? 1.14 : 1)) + 'px ' + EC_FONT;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = now ? (p.activeColor || theme.accent || '#38BDF8') : white;
        ctx.fillText(w.text, cx, pos.y + (1 - q) * 0);
        cx += widths[i] + size * 0.28;
      }
    } else {
      const maxW = W * 0.86;
      const lines = ecWrap(ctx, phrase, maxW, size, 800);
      const lh = size * 1.3;
      const bh = lines.length * lh + 26;
      if (c.componentId === 'subtitleBar') {
        ecAlpha(ctx, GA, 0.8);
        ecPanel(ctx, pos.x - maxW / 2 - 18, pos.y - bh / 2, maxW + 36, bh, 10, 'rgba(8,13,24,0.9)', null, 0);
      }
      ecAlpha(ctx, GA, 1);
      for (let i = 0; i < lines.length; i++) {
        ecText(ctx, lines[i], pos.x, pos.y - bh / 2 + 13 + lh * (i + 0.5), size, white, 'center', 700);
      }
    }
  }
}
