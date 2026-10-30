

/* --- Scene backgrounds: 32 procedural "background footage" themes --------
   Built for Shorts-style backdrops: continuous smooth motion, low cognitive
   load, loopable, readable behind captions. Each theme is an art-directed
   clip (neon drive, rain window, sand strata, marble run, keyboard RGB, ...)
   with its own cinematic grade; light themes get ink scrims top and bottom,
   dark themes a vignette and grain. */

function sbA(hex, a) {
  const s = String(hex || '#000000').replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) || 0;
  const g = parseInt(s.slice(2, 4), 16) || 0;
  const b = parseInt(s.slice(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
}
function sbMix(a, b, q) {
  const pa = String(a).replace('#', ''), pb = String(b).replace('#', '');
  const t = Math.max(0, Math.min(1, q));
  const c = i => Math.round(parseInt(pa.slice(i, i + 2), 16) + (parseInt(pb.slice(i, i + 2), 16) - parseInt(pa.slice(i, i + 2), 16)) * t);
  const h = n => ('0' + Math.max(0, Math.min(255, n)).toString(16)).slice(-2);
  return '#' + h(c(0)) + h(c(2)) + h(c(4));
}
function sbNorm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sbGrad(ctx, x0, y0, x1, y1, a, b) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}
function sbOrb(ctx, x, y, r, color, alpha) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, sbA(color, alpha));
  g.addColorStop(0.55, sbA(color, alpha * 0.45));
  g.addColorStop(1, sbA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function sbPass(ctx, W, H, color, alpha) {
  ctx.fillStyle = sbA(color, alpha);
  ctx.fillRect(0, 0, W, H);
}
function sbGrain(ctx, W, H, color, alpha, count) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.fillRect(ecHash(i * 1.7) * W, ecHash(i * 9.3 + 4) * H, 1.6, 1.6);
  }
  ctx.restore();
}
function sbLoop(q) { return ((q % 1) + 1) % 1; }

const SB_THEMES = {
  neonDrive: { art: 'night city drive', mode: 'dark', colors: ['#05070F', '#22D3EE', '#F472B6'] },
  rainWindow: { art: 'rain on a cafe window', mode: 'dark', colors: ['#0A0F1A', '#FBBF24', '#38BDF8'] },
  mountainRoad: { art: 'aerial mountain road', mode: 'dark', colors: ['#0B1220', '#34D399', '#FCD34D'] },
  beachSunset: { art: 'waves at sunset', mode: 'dark', colors: ['#1A0F1A', '#FB7185', '#FBBF24'] },
  cloudTimelapse: { art: 'fast clouds', mode: 'dark', colors: ['#0E1626', '#93C5FD', '#F8FAFC'] },
  subwayTunnel: { art: 'subway tunnel', mode: 'dark', colors: ['#08090E', '#FBBF24', '#EF4444'] },
  tokyoRain: { art: 'neon rain street', mode: 'dark', colors: ['#070510', '#F472B6', '#22D3EE'] },
  powderSki: { art: 'fresh powder slope', mode: 'light', colors: ['#E8F2FF', '#0EA5E9', '#0F172A'] },
  bonfireNight: { art: 'bonfire in a forest', mode: 'dark', colors: ['#0A0705', '#FB923C', '#FCD34D'] },
  driftTrack: { art: 'drift smoke and skids', mode: 'dark', colors: ['#0A0A0C', '#F97316', '#38BDF8'] },
  sandStrata: { art: 'sand strata slicing', mode: 'light', colors: ['#E8D5B5', '#C2410C', '#7C2D12'] },
  soapRibbons: { art: 'soap ribbons peeling', mode: 'light', colors: ['#FDF2F8', '#F9A8D4', '#A78BFA'] },
  pressureWash: { art: 'pressure washing a wall', mode: 'light', colors: ['#E2E8F0', '#38BDF8', '#0F172A'] },
  marbleRun: { art: 'marble on a rail', mode: 'dark', colors: ['#0B0F1A', '#FBBF24', '#22D3EE'] },
  slimeGloss: { art: 'glossy slime mixing', mode: 'dark', colors: ['#0A1A12', '#4ADE80', '#A7F3D0'] },
  resinPour: { art: 'resin pour', mode: 'dark', colors: ['#14100A', '#F59E0B', '#FDE68A'] },
  pressSquash: { art: 'hydraulic press', mode: 'dark', colors: ['#101216', '#94A3B8', '#F97316'] },
  tattooLine: { art: 'tattoo line work', mode: 'dark', colors: ['#0C0C10', '#E2E8F0', '#F472B6'] },
  vinylSpin: { art: 'spinning record', mode: 'dark', colors: ['#0A0A0C', '#E2E8F0', '#F472B6'] },
  liquidMetal: { art: 'liquid chrome', mode: 'dark', colors: ['#0A0C12', '#CBD5E1', '#60A5FA'] },
  geoLoop: { art: 'abstract geometry loop', mode: 'dark', colors: ['#0B1020', '#60A5FA', '#F9A8D4'] },
  keyboardRGB: { art: 'RGB keyboard waves', mode: 'dark', colors: ['#07080C', '#22D3EE', '#F472B6'] },
  candleScroll: { art: 'candlestick chart', mode: 'dark', colors: ['#070B0A', '#34D399', '#F87171'] },
  watchGears: { art: 'watch movement', mode: 'dark', colors: ['#0C0A06', '#FCD34D', '#E7E5E4'] },
  hudScan: { art: 'HUD data grid', mode: 'dark', colors: ['#03070C', '#22D3EE', '#34D399'] },
  archWire: { art: 'architectural wireframe', mode: 'light', colors: ['#F8FAFC', '#0F172A', '#38BDF8'] },
  penStroke: { art: 'fountain pen calligraphy', mode: 'light', colors: ['#F5EFE6', '#1C1917', '#B45309'] },
  liquidParticles: { art: 'particles in liquid', mode: 'dark', colors: ['#050A14', '#38BDF8', '#A78BFA'] },
  officeLight: { art: 'office window day to night', mode: 'light', colors: ['#E9EEF5', '#0F172A', '#F59E0B'] },
  gradientWaves: { art: 'gradient colour waves', mode: 'dark', colors: ['#0B1020', '#818CF8', '#F0ABFC'] },
  cityBokeh: { art: 'city bokeh', mode: 'dark', colors: ['#07070C', '#FBBF24', '#38BDF8'] },
  codeStream: { art: 'code streams', mode: 'dark', colors: ['#030A06', '#4ADE80', '#A7F3D0'] }
};

const SB_ALIASES = {
  studio: 'gradientwaves', noir: 'citybokeh', stars: 'citybokeh', cosmic: 'liquidparticles',
  space: 'liquidparticles', grid: 'hudscan', cyber: 'hudscan', blueprint: 'archwire',
  waves: 'gradientwaves', fluid: 'gradientwaves', ocean: 'beachsunset',
  aurora: 'gradientwaves', sunset: 'beachsunset', dusk: 'beachsunset', warm: 'bonfirennight',
  mesh: 'gradientwaves', gradient: 'gradientwaves', meshgradient: 'gradientwaves',
  dots: 'citybokeh', polka: 'citybokeh', bubblegrid: 'citybokeh', stripes: 'gradientwaves',
  diagonal: 'gradientwaves', bands: 'gradientwaves', bokeh: 'citybokeh', orbs: 'citybokeh',
  blur: 'rainwindow', contours: 'hudscan', topo: 'mountainroad', terrain: 'mountainroad',
  beams: 'officelight', rays: 'officelight', godrays: 'officelight',
  night: 'neondrive', rain: 'rainwindow', fire: 'bonfirennight', candle: 'candlescroll',
  gears: 'watchgears', keyboard: 'keyboardrgb', code: 'codestream', city: 'citybokeh',
  neon: 'tokyorain', ski: 'powderski', sand: 'sandstrata', soap: 'soapribbons',
  marble: 'marblerun', slime: 'slimegloss', resin: 'resinpour', press: 'presssquash',
  tattoo: 'tattooline', vinyl: 'vinylspin', metal: 'liquidmetal', geo: 'geoloop',
  pen: 'penstroke', office: 'officelight', particles: 'liquidparticles'
};

const SB_INDEX = {};
for (const sbKey in SB_THEMES) SB_INDEX[sbNorm(sbKey)] = { theme: SB_THEMES[sbKey], name: sbKey };

function sbResolve(style) {
  const key = sbNorm(style);
  if (SB_INDEX[key]) return SB_INDEX[key];
  const alias = SB_ALIASES[key];
  if (alias && SB_INDEX[alias]) return SB_INDEX[alias];
  return SB_INDEX.gradientwaves;
}

/* ---- footage clips ----------------------------------------------------- */

function sbNeonDrive(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H * 0.56, '#05070F', sbMix(pal.bg, pal.a, 0.10));
  ctx.fillRect(0, 0, W, H * 0.56);
  ctx.fillStyle = '#090C13';
  ctx.fillRect(0, H * 0.54, W, H * 0.46);
  const vx = W * 0.5, vy = H * 0.55;
  ctx.fillStyle = '#05070C';
  ctx.beginPath(); ctx.moveTo(vx - 18, vy); ctx.lineTo(vx + 18, vy); ctx.lineTo(W * 0.86, H); ctx.lineTo(W * 0.14, H); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const q = sbLoop(t * 0.28 + i / 10);
    const y = vy + (H - vy) * q * q;
    const x = vx + side * (16 + W * 0.34 * q);
    const len = 30 + 130 * q;
    const g = ctx.createLinearGradient(x, y, x + side * len * 0.15, y + len);
    g.addColorStop(0, sbA(i % 3 === 0 ? pal.c : pal.b, 0));
    g.addColorStop(0.6, sbA(i % 3 === 0 ? pal.c : pal.b, 0.7));
    g.addColorStop(1, sbA(i % 3 === 0 ? pal.c : pal.b, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 2 + 4 * q;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * len * 0.15, y + len); ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const q = sbLoop(t * 0.12 + i / 7);
    const x = W * (0.06 + 0.88 * ecHash(i * 3.3));
    ctx.fillStyle = sbA(pal.a, 0.08 * (1 - q));
    ctx.fillRect(x, H * 0.5 - q * H * 0.18, 2, H * 0.18);
  }
  sbOrb(ctx, W * 0.5, vy, W * 0.5, pal.a, 0.16);
}

function sbRainWindow(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const x = W * ecHash(i * 4.1), y = H * ecHash(i * 7.3 + 1);
    sbOrb(ctx, x, y, W * (0.10 + 0.14 * ecHash(i * 2.7)), i % 3 === 0 ? pal.b : pal.c, 0.22);
  }
  for (let i = 0; i < 22; i++) {
    const x = W * ecHash(i * 5.7);
    const y = H * sbLoop(ecHash(i * 9.1) + t * (0.05 + 0.05 * ecHash(i)));
    const r = 4 + 10 * ecHash(i * 3.3);
    ctx.fillStyle = sbA('#DCEBFF', 0.18);
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sbA('#FFFFFF', 0.4);
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.4, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sbA('#DCEBFF', 0.10);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x, y + r + 40 + 60 * ecHash(i * 6.1)); ctx.stroke();
  }
  sbPass(ctx, W, H, '#050810', 0.18);
}

function sbMountainRoad(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, sbMix(pal.bg, pal.a, 0.16), pal.bg);
  ctx.fillRect(0, 0, W, H);
  const ridges = [
    { y: 0.42, amp: 40, col: sbMix(pal.bg, pal.a, 0.18) },
    { y: 0.55, amp: 54, col: sbMix(pal.bg, '#000000', 0.25) },
    { y: 0.7, amp: 40, col: sbMix(pal.bg, '#000000', 0.5) }
  ];
  ridges.forEach((r, ri) => {
    ctx.fillStyle = r.col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * W;
      const y = H * r.y + Math.sin(i * 0.8 + ri * 2 + t * 0.04) * r.amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  });
  ctx.strokeStyle = sbA(pal.c, 0.9);
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const x = W * (0.1 + 0.8 * (i / 24));
    const y = H * (0.72 + 0.16 * Math.sin(i * 0.55 + t * 0.1));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const q = sbLoop(t * 0.15 + i / 5);
    const x = W * (0.1 + 0.8 * q);
    const y = H * (0.72 + 0.16 * Math.sin(q * 24 * 0.55));
    sbOrb(ctx, x, y, 26, pal.b, 0.8);
  }
}

function sbBeachSunset(ctx, W, H, t, pal) {
  const hy = H * 0.58;
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, hy, sbMix(pal.bg, pal.b, 0.10), sbMix('#2A1520', pal.b, 0.45));
  ctx.fillRect(0, 0, W, hy);
  sbOrb(ctx, W * 0.62, hy - H * 0.06, W * 0.5, pal.c, 0.55);
  ctx.fillStyle = pal.c;
  ctx.beginPath(); ctx.arc(W * 0.62, hy - H * 0.06, W * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sbGrad(ctx, 0, hy, 0, H, sbMix(pal.bg, pal.a, 0.12), '#07060C');
  ctx.fillRect(0, hy, W, H - hy);
  for (let i = 0; i < 5; i++) {
    const y = hy + H * (0.04 + i * 0.06);
    ctx.strokeStyle = sbA(i % 2 ? pal.b : pal.c, 0.35 - i * 0.04);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const yy = y + Math.sin(x * 0.02 + t * 0.7 + i) * (5 + i * 2);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const q = sbLoop(t * 0.1 + i / 18);
    ctx.fillStyle = sbA('#FFFFFF', 0.12 * (1 - q));
    ctx.beginPath(); ctx.arc(W * ecHash(i * 3.9), hy + H * 0.2 * q, 2 + 4 * ecHash(i), 0, Math.PI * 2); ctx.fill();
  }
}

function sbCloudTimelapse(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, sbMix(pal.bg, pal.a, 0.14), sbMix(pal.bg, pal.c, 0.10));
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const layer = i % 3;
    const q = sbLoop(t * (0.04 + layer * 0.03) + ecHash(i * 3.1));
    const x = (q * 1.4 - 0.2) * W;
    const y = H * (0.16 + 0.24 * layer + 0.05 * ecHash(i * 7.7));
    const rx = W * (0.22 + 0.16 * ecHash(i * 5.3));
    const ry = rx * (0.22 + 0.1 * ecHash(i + 2));
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = sbA(k === 1 ? pal.b : pal.c, 0.10 - layer * 0.02);
      ctx.beginPath();
      ctx.ellipse(x + (k - 1) * rx * 0.45, y + (k % 2) * ry * 0.4, rx * (0.8 - k * 0.12), ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  sbPass(ctx, W, H, pal.bg, 0.10);
}

function sbSubwayTunnel(ctx, W, H, t, pal) {
  ctx.fillStyle = '#05060A'; ctx.fillRect(0, 0, W, H);
  const cx = W * 0.5, cy = H * 0.46;
  for (let i = 10; i >= 0; i--) {
    const q = sbLoop(i / 11 + t * 0.06);
    const s = 0.06 + q * 0.9;
    const rw = W * 0.46 * s, rh = H * 0.4 * s;
    ctx.strokeStyle = sbA(i % 2 ? pal.a : pal.b, 0.12 + 0.25 * q);
    ctx.lineWidth = 2 + 4 * q;
    ctx.beginPath();
    ctx.roundRect(cx - rw, cy - rh, rw * 2, rh * 2, 18 + 40 * s);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const q = sbLoop(t * 0.25 + i / 8);
    const x = cx + side * (W * 0.06 + W * 0.4 * q);
    const y = cy + H * 0.1 * q;
    sbOrb(ctx, x, y, 20 + 50 * q, i % 3 === 0 ? pal.c : pal.a, 0.5 * (1 - q));
  }
  sbPass(ctx, W, H, '#020306', 0.25);
}

function sbTokyoRain(ctx, W, H, t, pal) {
  ctx.fillStyle = '#070510'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    const x = W * (0.06 + 0.12 * i);
    const h = H * (0.18 + 0.26 * ecHash(i * 3.3));
    const col = i % 2 ? pal.b : pal.c;
    ctx.fillStyle = sbA(col, 0.20);
    ctx.fillRect(x, H * 0.22, W * 0.05, h);
    ctx.fillStyle = sbA(col, 0.55);
    ctx.fillRect(x + W * 0.012, H * 0.24, W * 0.008, h * 0.7);
    ctx.fillStyle = sbA(col, 0.10);
    ctx.fillRect(x, H * 0.8, W * 0.05, H * 0.2);
  }
  for (let i = 0; i < 90; i++) {
    const q = sbLoop(t * 1.6 + ecHash(i * 4.7));
    const x = ecHash(i * 7.9) * W, y = q * H;
    ctx.strokeStyle = sbA(i % 5 === 0 ? pal.b : '#DCEBFF', 0.16);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 26); ctx.stroke();
  }
  sbPass(ctx, W, H, '#05030C', 0.2);
}

function sbPowderSki(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, pal.bg, sbMix(pal.bg, pal.a, 0.18));
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = sbA('#FFFFFF', 0.75);
  ctx.beginPath();
  ctx.moveTo(0, H * 0.36);
  for (let i = 0; i <= 12; i++) ctx.lineTo((i / 12) * W, H * (0.30 + 0.16 * Math.sin(i * 0.7)));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = sbA(pal.a, 0.7); ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = W * (0.12 + 0.76 * (i / 20));
    const y = H * (0.62 + 0.1 * Math.sin(i * 0.5 + t * 0.4));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 70; i++) {
    const q = sbLoop(t * 0.5 + ecHash(i * 3.1));
    ctx.fillStyle = sbA('#FFFFFF', 0.5 * (1 - q));
    ctx.beginPath();
    ctx.arc(W * (0.1 + 0.8 * ecHash(i * 5.7)) + q * 30, H * 0.6 - q * H * 0.2, 2 + 4 * ecHash(i), 0, Math.PI * 2);
    ctx.fill();
  }
}

function sbBonfireNight(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, '#050409', '#0B0806');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#04060A';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * W;
    const h = H * (0.12 + 0.12 * ecHash(i * 4.1));
    ctx.lineTo(x, H * 0.72 - h * Math.sin(i * 0.9));
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const flick = 1 + 0.15 * Math.sin(t * 6 + i * 1.7);
    sbOrb(ctx, W * 0.5 + (i - 1.5) * W * 0.03, H * 0.68 - i * H * 0.02, W * (0.16 - i * 0.02) * flick, i % 2 ? pal.c : pal.b, 0.28);
  }
  ctx.fillStyle = sbA(pal.c, 0.9);
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.44);
  ctx.quadraticCurveTo(W * 0.56, H * 0.6, W * 0.5, H * 0.7);
  ctx.quadraticCurveTo(W * 0.44, H * 0.6, W * 0.5, H * 0.44);
  ctx.fill();
  for (let i = 0; i < 40; i++) {
    const q = sbLoop(t * 0.22 + ecHash(i * 3.9));
    ctx.fillStyle = sbA(i % 3 === 0 ? pal.c : pal.b, 0.7 * (1 - q));
    ctx.beginPath();
    ctx.arc(W * 0.5 + (ecHash(i * 7.1) - 0.5) * W * 0.3 * (1 + q), H * 0.66 - q * H * 0.45, 1.5 + 3 * ecHash(i), 0, Math.PI * 2);
    ctx.fill();
  }
}

function sbDriftTrack(ctx, W, H, t, pal) {
  ctx.fillStyle = '#0A0A0C'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, '#121216', '#08080A');
  ctx.fillRect(0, H * 0.35, W, H * 0.65);
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = sbA(i % 2 ? pal.b : pal.c, 0.5);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-W * 0.1, H * (0.55 + i * 0.12));
    ctx.bezierCurveTo(W * 0.3, H * (0.4 + i * 0.1), W * 0.7, H * (0.8 + i * 0.05), W * 1.05, H * (0.5 + i * 0.1));
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const q = sbLoop(t * 0.18 + i / 12);
    const x = W * q;
    const y = H * (0.62 + 0.1 * Math.sin(q * 4 + i));
    sbOrb(ctx, x, y, 60 + 80 * q, '#9CA3AF', 0.10 * (1 - q));
  }
  sbOrb(ctx, W * 0.5, H * 0.55, W * 0.5, pal.b, 0.10);
}

function sbSandStrata(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  const cols = [pal.bg, sbMix(pal.bg, pal.b, 0.18), sbMix(pal.bg, pal.b, 0.30), sbMix(pal.bg, pal.c, 0.22), sbMix(pal.bg, pal.c, 0.12)];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.moveTo(0, H * (0.2 + i * 0.12));
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * (0.2 + i * 0.12) + Math.sin(x * 0.01 + i + t * 0.2) * 8);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  }
  const bx = W * (0.2 + 0.6 * sbLoop(t * 0.08));
  ctx.strokeStyle = sbA('#FFFFFF', 0.85); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx - W * 0.03, H); ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const q = sbLoop(t * 0.4 + ecHash(i * 3.7));
    ctx.fillStyle = sbA(pal.c, 0.5 * (1 - q));
    ctx.fillRect(bx + (ecHash(i * 5.3) - 0.5) * 50, q * H, 2, 8);
  }
}

function sbSoapRibbons(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const y = H * (0.25 + i * 0.12);
    const off = Math.sin(t * 0.3 + i) * 20;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const yy = y + off + Math.sin(x * 0.015 + i * 2 + t * 0.2) * 16;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    for (let x = W; x >= 0; x -= 12) {
      const yy = y + off + 34 + Math.sin(x * 0.015 + i * 2 + t * 0.2) * 16;
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fillStyle = sbA(i % 2 ? pal.b : pal.c, 0.30);
    ctx.fill();
    ctx.strokeStyle = sbA('#FFFFFF', 0.5); ctx.lineWidth = 2; ctx.stroke();
  }
}

function sbPressureWash(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = pal.c;
  for (let i = 0; i < 500; i++) ctx.fillRect(ecHash(i * 3.1) * W, ecHash(i * 7.7) * H, 3, 3);
  ctx.restore();
  const clean = sbLoop(t * 0.12);
  ctx.fillStyle = sbMix(pal.bg, '#FFFFFF', 0.65);
  ctx.fillRect(0, 0, W * clean, H);
  const edge = W * clean;
  ctx.strokeStyle = sbA(pal.a, 0.9); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(edge, 0); ctx.lineTo(edge, H); ctx.stroke();
  for (let i = 0; i < 30; i++) {
    const q = ecHash(i * 4.3);
    ctx.fillStyle = sbA('#FFFFFF', 0.35 * (1 - q));
    ctx.beginPath(); ctx.arc(edge - 10 - 40 * q, H * ecHash(i * 8.1), 2 + 4 * q, 0, Math.PI * 2); ctx.fill();
  }
}

function sbMarbleRun(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, sbMix(pal.bg, pal.a, 0.10), pal.bg);
  ctx.fillRect(0, 0, W, H);
  const railY = q => H * (0.5 + 0.22 * Math.sin(q * 6.0 + t * 0.25));
  for (const off of [-12, 12]) {
    ctx.strokeStyle = sbA(off < 0 ? pal.a : pal.b, 0.75);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const q = i / 80;
      const x = W * (0.06 + 0.88 * q);
      const y = railY(q) + off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const q = i / 8;
    const x = W * (0.06 + 0.88 * q);
    ctx.strokeStyle = sbA(pal.b, 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, railY(q) - 12); ctx.lineTo(x, H * 0.82); ctx.stroke();
  }
  const q0 = sbLoop(t * 0.12);
  const mx = W * (0.06 + 0.88 * q0), my = railY(q0);
  sbOrb(ctx, mx, my, 55, pal.b, 0.6);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(mx, my, 14, 0, Math.PI * 2); ctx.fill();
}

function sbSlimeGloss(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, sbMix(pal.bg, pal.b, 0.10), pal.bg);
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const cx = W * (0.3 + 0.4 * ecHash(i * 3.3)) + Math.sin(t * 0.25 + i) * W * 0.05;
    const cy = H * (0.35 + 0.3 * ecHash(i * 5.9)) + Math.cos(t * 0.2 + i) * H * 0.04;
    const r = W * (0.16 + 0.1 * ecHash(i * 7.1));
    sbOrb(ctx, cx, cy, r, i % 2 ? pal.b : pal.c, 0.45);
    sbOrb(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.28, '#FFFFFF', 0.18);
  }
}

function sbResinPour(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, pal.bg, sbMix(pal.bg, pal.b, 0.12));
  ctx.fillRect(0, 0, W, H);
  const x = W * 0.5 + Math.sin(t * 0.4) * W * 0.03;
  ctx.fillStyle = sbGrad(ctx, x - 24, 0, x + 24, 0, sbA(pal.c, 0.1), sbA(pal.b, 0.75));
  ctx.fillRect(x - 22, 0, 44, H * 0.72);
  ctx.fillStyle = sbA(pal.b, 0.6);
  ctx.beginPath(); ctx.ellipse(x, H * 0.78, W * 0.3, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const q = sbLoop(t * 0.5 + i / 3);
    ctx.strokeStyle = sbA(pal.c, 0.35 * (1 - q));
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, H * 0.78, W * 0.08 + q * W * 0.24, H * 0.03 + q * H * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const q = sbLoop(t * 0.18 + ecHash(i * 3.7));
    ctx.fillStyle = sbA('#FFFFFF', 0.4 * (1 - q));
    ctx.beginPath(); ctx.arc(x + (ecHash(i * 5.1) - 0.5) * 40, H * 0.74 - q * H * 0.5, 2 + 3 * ecHash(i), 0, Math.PI * 2); ctx.fill();
  }
}

function sbPressSquash(ctx, W, H, t, pal) {
  ctx.fillStyle = '#101216'; ctx.fillRect(0, 0, W, H);
  const squeeze = 0.5 + 0.5 * Math.sin(t * 0.9);
  ctx.fillStyle = '#1B1F27';
  ctx.fillRect(W * 0.2, H * 0.18, W * 0.6, H * 0.08);
  ctx.fillStyle = pal.b;
  ctx.fillRect(W * 0.2, H * 0.82, W * 0.6, H * 0.08);
  const bh = H * (0.24 - 0.12 * squeeze);
  ctx.fillStyle = pal.b;
  ctx.fillRect(W * 0.3, H * 0.5 - bh / 2, W * 0.4, bh);
  ctx.fillStyle = sbA(pal.c, 0.8);
  ctx.fillRect(W * 0.3, H * 0.5 + bh / 2 - 10, W * 0.4, 10);
  for (let i = 0; i < 24; i++) {
    const q = ecHash(i * 4.7);
    ctx.fillStyle = sbA('#CBD5E1', 0.2 * (1 - squeeze));
    ctx.beginPath(); ctx.arc(W * (0.2 + 0.6 * ecHash(i * 7.3)), H * (0.6 + 0.2 * q), 2 + 4 * q, 0, Math.PI * 2); ctx.fill();
  }
  sbOrb(ctx, W * 0.5, H * 0.5, W * 0.5, pal.c, 0.05);
}

function sbTattooLine(ctx, W, H, t, pal) {
  ctx.fillStyle = '#0C0C10'; ctx.fillRect(0, 0, W, H);
  const prog = sbLoop(t * 0.08);
  ctx.strokeStyle = sbA(pal.c, 0.9); ctx.lineWidth = 3; ctx.lineCap = 'round';
  const segs = 2;
  for (let s = 0; s < segs; s++) {
    ctx.beginPath();
    for (let i = 0; i <= 60 * prog; i++) {
      const q = i / 60;
      const a = q * Math.PI * 2 + s * Math.PI;
      const r = W * (0.14 + 0.06 * Math.sin(q * 9 + s));
      const x = W * 0.5 + Math.cos(a) * r;
      const y = H * 0.5 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tip = 60 * prog / 60;
  const a2 = tip * Math.PI * 2;
  const tx = W * 0.5 + Math.cos(a2) * W * 0.14, ty = H * 0.5 + Math.sin(a2) * W * 0.14;
  sbOrb(ctx, tx, ty, 26, pal.c, 0.5);
}

function sbVinylSpin(ctx, W, H, t, pal) {
  ctx.fillStyle = '#09090B'; ctx.fillRect(0, 0, W, H);
  const cx = W * 0.5, cy = H * 0.5, r = W * 0.34;
  ctx.fillStyle = '#111114';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = sbA(i % 2 ? '#E2E8F0' : '#64748B', 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * (0.35 + i * 0.025), 0, Math.PI * 2); ctx.stroke();
  }
  const ang = t * 1.4;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(ang);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = pal.c;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#09090B';
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
}

function sbLiquidMetal(ctx, W, H, t, pal) {
  ctx.fillStyle = '#0A0C12'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const cx = W * (0.3 + 0.4 * ecHash(i * 3.1)) + Math.sin(t * 0.2 + i) * 30;
    const cy = H * (0.3 + 0.4 * ecHash(i * 5.7));
    const r = W * (0.18 + 0.1 * ecHash(i * 7.9));
    sbOrb(ctx, cx, cy, r, i % 2 ? pal.b : pal.c, 0.35);
    ctx.strokeStyle = sbA('#FFFFFF', 0.35); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.7, r * 0.4, -0.4, 0, Math.PI * 2); ctx.stroke();
  }
  sbPass(ctx, W, H, '#02040A', 0.25);
}

function sbGeoLoop(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, sbMix(pal.bg, pal.a, 0.12), pal.bg);
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.5, cy = H * 0.5;
  const a = t * 0.5, b = t * 0.33;
  const r = W * 0.26;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + i * 1.1);
    ctx.strokeStyle = sbA(i === 1 ? pal.c : pal.b, 0.7);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (0.4 + 0.18 * Math.sin(b + i)), b + i, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
}

function sbKeyboardRGB(ctx, W, H, t, pal) {
  ctx.fillStyle = '#07080C'; ctx.fillRect(0, 0, W, H);
  const cols = 6, rows = 10;
  const kw = W * 0.13, kh = H * 0.075, gap = W * 0.015;
  const ox = (W - cols * (kw + gap)) / 2, oy = (H - rows * (kh + gap)) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 1.6 - (r + c) * 0.55);
      const x = ox + c * (kw + gap), y = oy + r * (kh + gap);
      ctx.fillStyle = sbA('#1A1D24', 1);
      ctx.beginPath(); ctx.roundRect(x, y, kw, kh, 6); ctx.fill();
      ctx.fillStyle = sbA(sbMix(pal.b, pal.c, wave), 0.18 + 0.5 * wave);
      ctx.beginPath(); ctx.roundRect(x + 3, y + 3, kw - 6, kh - 6, 4); ctx.fill();
    }
  }
  sbOrb(ctx, W * 0.5, H * 0.5, W * 0.6, pal.b, 0.06);
}

function sbCandleScroll(ctx, W, H, t, pal) {
  ctx.fillStyle = '#070B0A'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(148,163,184,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, H * (0.2 + i * 0.12)); ctx.lineTo(W, H * (0.2 + i * 0.12)); ctx.stroke(); }
  const n = 12, cw = W * 0.055, gap = W * 0.02;
  const shift = (t * 30) % (cw + gap);
  for (let i = 0; i < n + 1; i++) {
    const idx = Math.floor(t * 0.5) + i;
    const x = W * 0.08 + i * (cw + gap) - shift;
    const base = 0.5 + 0.18 * Math.sin(idx * 1.7);
    const open = 0.5 + 0.18 * Math.sin(idx * 1.7 + 1.2);
    const top = Math.min(base, open), bot = Math.max(base, open);
    const up = open >= base;
    const col = up ? pal.b : pal.c;
    ctx.strokeStyle = sbA(col, 0.8); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + cw / 2, H * (top - 0.06)); ctx.lineTo(x + cw / 2, H * top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + cw / 2, H * bot); ctx.lineTo(x + cw / 2, H * (bot + 0.05)); ctx.stroke();
    ctx.fillStyle = sbA(col, 0.85);
    ctx.fillRect(x, H * top, cw, Math.max(4, (bot - top) * H));
  }
  sbPass(ctx, W, H, '#030706', 0.2);
}

function sbWatchGears(ctx, W, H, t, pal) {
  ctx.fillStyle = '#0C0A06'; ctx.fillRect(0, 0, W, H);
  const gears = [[0.38, 0.42, 0.22, 1, 12], [0.62, 0.56, 0.15, -1.4, 9], [0.55, 0.28, 0.1, 1.9, 7]];
  gears.forEach(([gx, gy, gr, speed, teeth]) => {
    const cx = W * gx, cy = H * gy, r = W * gr, ang = t * speed;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = sbA(pal.b, 0.25);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const rr = i % 2 ? r * 0.86 : r;
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = sbA(pal.c, 0.8); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#0C0A06';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sbA(pal.c, 0.5); ctx.stroke();
    ctx.restore();
  });
}

function sbHudScan(ctx, W, H, t, pal) {
  ctx.fillStyle = '#03070C'; ctx.fillRect(0, 0, W, H);
  const vx = W * 0.5, vy = H * 0.42;
  ctx.strokeStyle = sbA(pal.b, 0.28); ctx.lineWidth = 1.4;
  for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(vx + i * W * 0.09, H); ctx.lineTo(vx, vy); ctx.stroke(); }
  for (let i = 1; i < 10; i++) {
    const y = vy + (H - vy) * Math.pow(i / 10, 1.8);
    ctx.strokeStyle = sbA(i % 3 === 0 ? pal.c : pal.b, 0.22 + 0.1 * (i / 10));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = sbA(pal.b, 0.3); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(vx, vy, W * (0.14 + i * 0.12), H * (0.06 + i * 0.05), 0, 0, Math.PI * 2); ctx.stroke();
  }
  const sy = vy + sbLoop(t * 0.18) * (H - vy);
  ctx.fillStyle = sbA(pal.b, 0.18); ctx.fillRect(0, sy - 26, W, 52);
  ctx.strokeStyle = sbA(pal.c, 1); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = sbA(pal.c, 0.7);
    ctx.fillRect(W * (0.08 + i * 0.11), H * 0.1, 26, 4);
  }
}

function sbArchWire(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  const prog = 0.35 + 0.65 * sbLoop(t * 0.06);
  ctx.strokeStyle = sbA(pal.c, 0.9); ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 20 * prog; i++) {
    const x = W * (0.1 + 0.8 * (i / 20));
    const y = H - Math.sin((i / 20) * Math.PI) * H * 0.6;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = sbA(pal.c, 0.35); ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const x = W * (0.12 + i * 0.15);
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, H - Math.sin(((x - W * 0.1) / (W * 0.8)) * Math.PI) * H * 0.6); ctx.stroke();
  }
  ctx.strokeStyle = sbA(pal.b, 0.5); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, H * 0.9); ctx.lineTo(W, H * 0.9); ctx.stroke();
}

function sbPenStroke(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  const prog = sbLoop(t * 0.1);
  ctx.strokeStyle = sbA(pal.c, 0.95); ctx.lineCap = 'round';
  let px = W * 0.12, py = H * 0.5;
  for (let i = 1; i <= 40 * prog; i++) {
    const q = i / 40;
    const x = W * (0.12 + 0.76 * q);
    const y = H * (0.5 + 0.22 * Math.sin(q * 5.2));
    ctx.lineWidth = 8 + 20 * Math.sin(q * Math.PI);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    px = x; py = y;
  }
  sbGrain(ctx, W, H, pal.c, 0.05, 500);
}

function sbLiquidParticles(ctx, W, H, t, pal) {
  ctx.fillStyle = sbGrad(ctx, 0, 0, 0, H, '#071124', '#040812');
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const y = H * (0.2 + i * 0.18);
    ctx.strokeStyle = sbA(pal.b, 0.12); ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 14) {
      const yy = y + Math.sin(x * 0.012 + t * 0.4 + i) * 18;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const q = sbLoop(t * 0.08 + ecHash(i * 3.7));
    const x = ecHash(i * 5.1) * W;
    const y = H - q * H;
    sbOrb(ctx, x, y, 8 + 20 * ecHash(i * 7.9), i % 3 === 0 ? pal.c : pal.b, 0.35);
  }
}

function sbOfficeLight(ctx, W, H, t, pal) {
  const day = 0.5 + 0.5 * Math.sin(t * 0.12 - Math.PI / 2);
  const sky = sbMix('#0B1220', '#BFDBFE', day);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = sbA('#0F172A', 0.85);
  ctx.fillRect(0, 0, W * 0.08, H);
  ctx.fillRect(W * 0.92, 0, W * 0.08, H);
  ctx.fillRect(0, 0, W, H * 0.06);
  ctx.fillRect(0, H * 0.94, W, H * 0.06);
  ctx.fillRect(W * 0.49, 0, W * 0.02, H);
  ctx.fillRect(0, H * 0.46, W, H * 0.02);
  const g = ctx.createLinearGradient(W * 0.2, H * 0.2, W * 0.8, H);
  g.addColorStop(0, sbA(pal.c, 0.20 * day));
  g.addColorStop(1, sbA(pal.c, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = sbA('#0F172A', 0.25);
  ctx.fillRect(W * 0.18, H * 0.7, W * 0.3, H * 0.24);
}

function sbGradientWaves(ctx, W, H, t, pal) {
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const y = H * (0.2 + i * 0.2);
    const g = ctx.createLinearGradient(0, y - H * 0.2, 0, y + H * 0.25);
    g.addColorStop(0, sbA(i % 2 ? pal.c : pal.b, 0));
    g.addColorStop(0.5, sbA(i % 2 ? pal.c : pal.b, 0.30));
    g.addColorStop(1, sbA(i % 2 ? pal.b : pal.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const yy = y + Math.sin(x * 0.008 + t * 0.25 + i) * H * 0.06;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 3; i++) sbOrb(ctx, W * (0.25 + i * 0.25), H * (0.3 + 0.2 * i), W * 0.4, i % 2 ? pal.c : pal.b, 0.12);
}

function sbCityBokeh(ctx, W, H, t, pal) {
  ctx.fillStyle = '#07070C'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = W * ecHash(i * 3.3) + Math.sin(t * 0.06 + i) * 18;
    const y = H * ecHash(i * 7.1) + Math.cos(t * 0.05 + i) * 12;
    const r = 20 + 70 * ecHash(i * 5.9);
    sbOrb(ctx, x, y, r, i % 4 === 0 ? pal.b : i % 4 === 1 ? pal.c : '#93C5FD', 0.16);
    ctx.strokeStyle = sbA(i % 3 ? pal.b : pal.c, 0.10);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
  }
  sbPass(ctx, W, H, '#05050A', 0.25);
}

function sbCodeStream(ctx, W, H, t, pal) {
  ctx.fillStyle = '#030A06'; ctx.fillRect(0, 0, W, H);
  const cols = 22;
  for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * (W / cols);
    const speed = 0.15 + 0.25 * ecHash(c * 3.7);
    for (let j = 0; j < 10; j++) {
      const q = sbLoop(ecHash(c * 7.1 + j) + t * speed);
      const y = q * H;
      const a = 0.18 + 0.55 * (1 - q);
      ctx.fillStyle = sbA(j === 0 ? '#D9F99D' : pal.b, a);
      ctx.fillRect(x - 6, y, 12, 14 + 14 * ecHash(c + j));
    }
  }
  sbPass(ctx, W, H, '#020604', 0.2);
}

const SB_PAINTS = {
  neondrive: sbNeonDrive, rainwindow: sbRainWindow, mountainroad: sbMountainRoad,
  beachsunset: sbBeachSunset, cloudtimelapse: sbCloudTimelapse, subwaytunnel: sbSubwayTunnel,
  tokyorain: sbTokyoRain, powderski: sbPowderSki, bonfirennight: sbBonfireNight,
  drifttrack: sbDriftTrack, sandstrata: sbSandStrata, soapribbons: sbSoapRibbons,
  pressurewash: sbPressureWash, marblerun: sbMarbleRun, slimegloss: sbSlimeGloss,
  resinpour: sbResinPour, presssquash: sbPressSquash, tattooline: sbTattooLine,
  vinylspin: sbVinylSpin, liquidmetal: sbLiquidMetal, geoloop: sbGeoLoop,
  keyboardrgb: sbKeyboardRGB, candlescroll: sbCandleScroll, watchgears: sbWatchGears,
  hudscan: sbHudScan, archwire: sbArchWire, penstroke: sbPenStroke,
  liquidparticles: sbLiquidParticles, officelight: sbOfficeLight,
  gradientwaves: sbGradientWaves, citybokeh: sbCityBokeh, codestream: sbCodeStream
};

function sbFrame(ctx, W, H, pal, mode) {
  if (mode === 'light') {
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    top.addColorStop(0, sbA(pal.c, 0.14));
    top.addColorStop(1, sbA(pal.c, 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.3);
    const bottom = ctx.createLinearGradient(0, H * 0.68, 0, H);
    bottom.addColorStop(0, sbA(pal.c, 0));
    bottom.addColorStop(1, sbA(pal.c, 0.24));
    ctx.fillStyle = bottom; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    sbGrain(ctx, W, H, pal.c, 0.035, 700);
  } else {
    const bottom = ctx.createLinearGradient(0, H * 0.55, 0, H);
    bottom.addColorStop(0, sbA('#000000', 0));
    bottom.addColorStop(1, sbA('#000000', 0.45));
    ctx.fillStyle = bottom; ctx.fillRect(0, H * 0.55, W, H * 0.45);
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.28, W * 0.5, H * 0.46, Math.max(W, H) * 0.76);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, sbA('#000000', 0.14));
    vg.addColorStop(1, sbA('#000000', 0.48));
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    sbGrain(ctx, W, H, '#FFFFFF', 0.04, 800);
  }
}

/* Moving atmosphere over a photo: the part that makes a still read as footage.
   Kinds: sheen, rain, snow, dust, embers, bokeh, rays, fog. */
function sbAtmosphere(ctx, W, H, time, kind, strength, grade) {
  const k = Math.max(0, Math.min(1, strength));
  if (!k || kind === 'none') return;
  const warm = grade === 'warm' || grade === 'violet';
  if (kind === 'rain') {
    for (let i = 0; i < 130; i++) {
      const speed = 0.5 + ecHash(i * 3.7);
      const x = (ecHash(i * 5.1) * W + time * 30 * speed) % (W + 60);
      const y = (ecHash(i * 8.7) * H + time * 320 * speed) % (H + 80);
      const len = 20 + 50 * ecHash(i * 4.9);
      ctx.strokeStyle = sbA(i % 8 === 0 ? '#DCEBFF' : '#BAE6FD', 0.10 + 0.14 * ecHash(i * 6.3));
      ctx.lineWidth = 1 + 1.2 * ecHash(i);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + len); ctx.stroke();
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 100; i++) {
      const speed = 0.3 + ecHash(i * 2.9);
      const x = (ecHash(i * 5.3) * W + Math.sin(time * 0.4 + i) * 22) % W;
      const y = (ecHash(i * 7.1) * H + time * 70 * speed) % H;
      ctx.fillStyle = sbA('#FFFFFF', 0.25 + 0.45 * ecHash(i * 4.1));
      ctx.beginPath(); ctx.arc(x, y, 1.5 + 3.5 * ecHash(i * 3.3), 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'dust') {
    for (let i = 0; i < 60; i++) {
      const q = sbLoop(time * 0.03 + ecHash(i * 5.9));
      const x = (ecHash(i * 2.3) * W + Math.sin(time * 0.3 + i) * 30 + W) % W;
      const y = H - q * H;
      ctx.fillStyle = sbA(warm ? '#FDE68A' : '#E2E8F0', 0.10 + 0.22 * ecHash(i * 8.1));
      ctx.beginPath(); ctx.arc(x, y, 1 + 2.5 * ecHash(i * 6.7), 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'embers') {
    for (let i = 0; i < 55; i++) {
      const q = sbLoop(time * 0.12 + ecHash(i * 3.9));
      const x = (ecHash(i * 7.1) * W + Math.sin(q * 6 + i) * 20 + W) % W;
      const y = H * 0.9 - q * H * 0.8;
      ctx.fillStyle = sbA(i % 3 === 0 ? '#FCD34D' : '#FB923C', 0.9 * (1 - q) * k);
      ctx.beginPath(); ctx.arc(x, y, 1.5 + 3 * ecHash(i * 2.1), 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'bokeh') {
    for (let i = 0; i < 14; i++) {
      const x = (ecHash(i * 3.3) * W + Math.sin(time * 0.05 + i) * 18 + W) % W;
      const y = (ecHash(i * 7.7) * H + Math.cos(time * 0.04 + i) * 12 + H) % H;
      sbOrb(ctx, x, y, 20 + 60 * ecHash(i * 5.1), i % 3 === 0 ? '#FDE68A' : '#93C5FD', 0.10 + 0.10 * ecHash(i * 9.3));
    }
  } else if (kind === 'rays') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ox = W * 0.3;
    for (let i = 0; i < 6; i++) {
      const ang = -0.4 + i * 0.16 + Math.sin(time * 0.06 + i) * 0.02;
      const ex = ox + Math.cos(ang) * W * 1.2;
      const ey = Math.sin(ang) * W * 1.2 + H * 0.7;
      const g = ctx.createLinearGradient(ox, -H * 0.1, ex, ey);
      g.addColorStop(0, sbA(warm ? '#FCD34D' : '#E0F2FE', 0.13 * k));
      g.addColorStop(1, sbA(warm ? '#FCD34D' : '#E0F2FE', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox - 14, -H * 0.1); ctx.lineTo(ex - 70, ey); ctx.lineTo(ex + 70, ey); ctx.lineTo(ox + 14, -H * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  } else if (kind === 'fog') {
    for (let i = 0; i < 5; i++) {
      const y = H * (0.3 + i * 0.13) + Math.sin(time * 0.2 + i) * 10;
      const g = ctx.createLinearGradient(0, y - 70, 0, y + 70);
      g.addColorStop(0, 'rgba(226,232,240,0)');
      g.addColorStop(0.5, sbA('#E2E8F0', 0.10 * k));
      g.addColorStop(1, 'rgba(226,232,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 70, W, 140);
    }
  } else {
    /* sheen: a diagonal light band sweeping every seven seconds */
    const q = sbLoop(time / 7);
    const cx = -W * 0.5 + q * W * 2;
    const g = ctx.createLinearGradient(cx - W * 0.22, 0, cx + W * 0.22, H * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, sbA('#FFFFFF', 0.12 * k));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(cx - W * 0.24, 0, W * 0.48, H);
    ctx.restore();
  }
}

/* The empty stage: the theme's base colour, flat. */
function sbFlatStage(ctx, W, H) {
  const base = (typeof T !== 'undefined' && T && T.paper) ? T.paper : '#0B1020';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
}

function sharedBackground(ctx, W, H, time, scene, particles) {
  const params = (scene && scene.params) || {};

  /* A real photograph wins over the procedural theme: cover-fit, a slow
     Ken Burns drift, an optional grade, then the same caption frame. The
     procedural theme covers the first frames while the image decodes. */
  const imageSrc = params.image || params.photo;
  if (imageSrc) {
    const img = (typeof getImage === 'function') ? getImage(imageSrc) : null;
    if (img && (img.naturalWidth || img.width)) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const grade = String(params.grade || 'dark').toLowerCase();
      const motion = String(params.motion || 'kenburns').toLowerCase();
      const atmo = String(params.atmosphere || 'sheen').toLowerCase();
      const amount = Math.max(0, Math.min(1.5, ecN(params.intensity, 0.7)));
      const loop = sbLoop(time / 26);

      /* Camera: cover fit plus a visible, loopable move. */
      let zoom = 1.06, ox = 0, oy = 0;
      if (motion === 'zoomin') {
        zoom = 1.04 + 0.16 * loop;
      } else if (motion === 'zoomout') {
        zoom = 1.20 - 0.16 * loop;
      } else if (motion === 'panleft') {
        zoom = 1.10; ox = (0.5 - loop) * W * 0.09 * amount;
      } else if (motion === 'panright') {
        zoom = 1.10; ox = (loop - 0.5) * W * 0.09 * amount;
      } else if (motion === 'drift') {
        zoom = 1.10;
        ox = Math.sin(time * 0.12) * W * 0.028 * amount;
        oy = Math.cos(time * 0.09) * H * 0.022 * amount;
      } else if (motion === 'pulse') {
        zoom = 1.06 + 0.05 * Math.sin(time * 0.7) * amount;
      } else if (motion === 'ripple') {
        zoom = 1.12;
      } else if (motion === 'parallax') {
        zoom = 1.08;
        ox = Math.sin(time * 0.1) * W * 0.03 * amount;
        oy = Math.cos(time * 0.08) * H * 0.02 * amount;
      } else {
        zoom = 1.05 + 0.07 * loop * amount;
        ox = (loop - 0.5) * W * 0.04 * amount;
        oy = -(loop - 0.5) * H * 0.025 * amount;
      }
      const base = Math.max(W / iw, H / ih);
      const dw = iw * base * zoom, dh = ih * base * zoom;
      const dx = (W - dw) / 2 + ox, dy = (H - dh) / 2 + oy;

      if (motion === 'parallax') {
        const bz = 1.26;
        const bw = iw * base * bz, bh = ih * base * bz;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, (W - bw) / 2 - ox * 1.8, (H - bh) / 2 - oy * 1.8, bw, bh);
        ctx.restore();
      }
      if (motion === 'ripple') {
        const strips = 30, sw = iw / strips, dws = dw / strips;
        for (let i = 0; i < strips; i++) {
          const edge = i / strips;
          const amp = (2 + 12 * edge) * amount;
          const off = Math.sin(i * 0.7 + time * 1.8) * amp;
          ctx.drawImage(img, i * sw, 0, sw, ih, dx + i * dws, dy + off, dws + 1.2, dh);
        }
      } else {
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      if (grade !== 'none') {
        const tint = grade === 'warm' ? '#F59E0B'
          : grade === 'cool' ? '#38BDF8'
          : grade === 'violet' ? '#8B5CF6'
          : grade === 'green' ? '#34D399' : null;
        ctx.fillStyle = 'rgba(0,0,0,' + (grade === 'light' ? 0.05 : 0.30) + ')';
        ctx.fillRect(0, 0, W, H);
        if (tint) { ctx.fillStyle = sbA(tint, 0.15); ctx.fillRect(0, 0, W, H); }
      }
      sbAtmosphere(ctx, W, H, time, atmo, amount, grade);
      sbFrame(ctx, W, H, { bg: '#000000', a: '#FFFFFF', b: '#FFFFFF', c: '#0F172A' },
        params.mode === 'light' || grade === 'light' ? 'light' : 'dark');
      return;
    }
  }

  /* No photo and no explicit style: a flat, quiet stage. A project does not
     come with a default background clip — dress the frame with a background
     component (style or photo) or a scene style; until then the stage is the
     theme's own base colour and nothing else. */
  if (!params.style) {
    sbFlatStage(ctx, W, H);
    return;
  }

  const resolved = sbResolve(params.style);
  const theme = resolved.theme;
  const pal = {
    bg: theme.colors[0], a: theme.colors[1], b: theme.colors[1], c: theme.colors[2]
  };
  const override = params.colors || params.palette || null;
  if (Array.isArray(override) && override.length >= 2) {
    const ok = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    if (ok(override[0])) pal.bg = override[0];
    if (ok(override[1])) pal.a = override[1];
    if (ok(override[2])) { pal.b = override[1]; pal.c = override[2]; }
  }
  const paint = SB_PAINTS[sbNorm(resolved.name)] || SB_PAINTS.gradientwaves;
  paint(ctx, W, H, time, pal);
  sbFrame(ctx, W, H, pal, theme.mode);
}
