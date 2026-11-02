/* ==========================================================================
   Conversations: a transcript authored with turns ({speaker, text, gap?})
   carries the speaker on every word, and from those words alone the engine
   directs the scene — no per-project choreography:

   - SWDraw.conversationPlan(words): each speaker's gestures and faces, and
     the edit (which face the camera holds when).
   - SWDraw.character({ cast, words, pose: 'auto' }) acts its own lines: a
     wave for hello and goodbye, a thumbs-up for agreement, surprise on a
     short question, and long lines change gesture sentence by sentence.
     While others talk it listens (nods, warms up) and, given seat heads,
     looks at whoever speaks (lookAt: 'speaker').
   - The `conversation` component draws the whole studio: one seat per cast
     member, the live speaker lit, close-ups on long lines and the wide shot
     for reactions.
   ========================================================================== */

/* Lines as spoken: contiguous words of one speaker. */
function swConversationLines(words) {
  const lines = [];
  for (const w of words || []) {
    if (!w || !w.speaker) continue;
    const last = lines[lines.length - 1];
    if (last && last.id === w.speaker) { last.end = Math.max(last.end, ecN(w.end, last.end)); last.words.push(w); }
    else lines.push({ id: w.speaker, start: ecN(w.start, 0), end: ecN(w.end, 0), words: [w] });
  }
  return lines;
}

/* Word lists that open or close a conversation, or agree, across the
   languages the voices speak. Lower-case, matched at word starts. */
const SW_CONV_GREET = /^(merhaba|selam|hoş ?bulduk|hello|hi|hey|welcome|hola|bonjour|hallo|ciao|olá)/i;
const SW_CONV_BYE = /(görüşmek|hoşça|bay bay|goodbye|bye|see you|adiós|au revoir|tschüss|ciao)/i;
const SW_CONV_AGREE = /^(aynen|kesinlikle|evet|tabii|exactly|absolutely|yes|yeah|right|totally|sí|oui|ja|genau)/i;
const SW_CONV_THINK = /^(bence|aslında|sanırım|bir de|i think|actually|well|honestly)/i;

const swPlanCache = new WeakMap();
function swConversationPlan(words) {
  if (!Array.isArray(words)) return null;
  const hit = swPlanCache.get(words);
  if (hit) return hit;
  const lines = swConversationLines(words);
  const poses = {}, emotions = {};
  const track = (map, id) => (map[id] = map[id] || [[0, map === poses ? 'idle' : 'happy']]);
  const reaction = l => l.end - l.start < 1.8;
  lines.forEach((l, n) => {
    const text = l.words.map(w => String(w.text || '')).join(' ').trim();
    const P = track(poses, l.id), E = track(emotions, l.id);
    const back = l.end + 0.35;
    if (reaction(l) && (SW_CONV_GREET.test(text) || SW_CONV_BYE.test(text))) {
      P.push([l.start - 0.15, 'wave'], [back + 0.4, 'idle']);
    } else if (reaction(l) && SW_CONV_AGREE.test(text)) {
      P.push([l.start - 0.1, 'thumbsUp'], [back + 0.3, 'idle']);
    } else if (reaction(l) && /\?$/.test(text)) {
      E.push([l.start - 0.2, 'surprised'], [back + 0.6, 'happy']);
    } else if (!reaction(l)) {
      /* A new gesture at each sentence or clause, like thinking aloud. */
      const cycle = /\?/.test(text) ? ['explain', 'present', 'explain', 'shrug'] : ['explain', 'present', 'explain'];
      l.words.forEach((w, k) => {
        if (k === 0 || /[.!?,:;]$/.test(String(l.words[k - 1].text || ''))) P.push([w.start - 0.15, cycle[(P.length + n) % cycle.length]]);
      });
      if (SW_CONV_BYE.test(text)) P.push([Math.max(l.start, l.end - 1.2), 'wave']);
      P.push([back, 'idle']);
      if (SW_CONV_THINK.test(text)) E.push([l.start, 'thinking'], [l.start + 1.4, 'happy']);
    }
  });
  /* The edit: a close-up for every line of 2.5 s or more; lines that follow
     each other directly cut face to face, reactions play on the wide shot. */
  const shots = [];
  lines.forEach((l, n) => {
    if (l.end - l.start >= 2.5) shots.push({ id: l.id, a: l.start + 0.05, b: l.end + 0.15, n });
  });
  for (let k = 0; k + 1 < shots.length; k++) {
    const A = shots[k], B = shots[k + 1];
    if (B.n === A.n + 1 && B.a - A.b < 0.8) {
      const mid = (A.b + B.a) / 2;
      A.b = mid; B.a = mid; A.cutOut = true; B.cutIn = true;
    }
  }
  const plan = { lines, poses, emotions, shots };
  swPlanCache.set(words, plan);
  return plan;
}
SWDraw.conversationPlan = swConversationPlan;

/* Pose 'auto' and lookAt 'speaker' for a cast member in a conversation. */
function swAutoDirect(opts) {
  if (!opts || !Array.isArray(opts.words)) return opts;
  const who = opts.speaker || (typeof opts.cast === 'string' ? opts.cast : null);
  const auto = opts.pose === 'auto' || (opts.pose == null && who && opts.words.some(w => w && w.speaker));
  const lookSpeaker = opts.lookAt === 'speaker';
  if (!auto && !lookSpeaker) return opts;
  const out = Object.assign({}, opts);
  if (auto) {
    const plan = swConversationPlan(opts.words);
    out.pose = (plan && plan.poses[who]) || 'idle';
    if (out.emotion == null && plan && plan.emotions[who]) out.emotion = plan.emotions[who];
  }
  if (lookSpeaker) {
    const now = SWDraw.speakerAt(opts.words, ecN(opts.time, 0));
    const heads = opts.seatHeads || {};
    out.lookAt = now && now !== who && heads[now] ? heads[now] : now === who ? 'viewer' : undefined;
  }
  return out;
}

/* Seats in a grid that suits the frame: two across in portrait, a row in
   landscape (up to four), centred under the title band. */
function swConversationLayout(n, W, H, top) {
  const portrait = H >= W;
  const cols = n <= 1 ? 1 : portrait ? 2 : Math.min(n, n === 4 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const M = W * 0.037, GAP = W * 0.026;
  const bottom = portrait ? H * 0.2 : H * 0.17;
  const availH = H - top - bottom - (rows - 1) * GAP;
  let tw = (W - 2 * M - (cols - 1) * GAP) / cols;
  let th = Math.min(availH / rows, tw * 1.15);
  tw = Math.min(tw, th * (portrait ? 0.9 : 1.6));
  const gridW = cols * tw + (cols - 1) * GAP, gridH = rows * th + (rows - 1) * GAP;
  const x0 = (W - gridW) / 2, y0 = top + (H - top - bottom - gridH) / 2;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    /* A short last row is centred. */
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const off = (cols - inRow) * (tw + GAP) / 2;
    const x = x0 + off + col * (tw + GAP), y = y0 + row * (th + GAP);
    tiles.push({ x, y, w: tw, h: th, cx: x + tw / 2 });
  }
  return { tiles, grid: { x: x0, y: y0, w: gridW, h: gridH } };
}

/* The studio. opts: W, H, time, words, castTable, seats [{cast, role?,
   color?, name?}], title?, subtitle?, liveLabel?, camera ('auto' | 'wide').
   A seat's colour defaults to the member's seatColor, then a palette. */
function swConversation(ctx, opts) {
  const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920), time = ecN(opts.time, 0);
  const words = Array.isArray(opts.words) ? opts.words : [];
  const castTable = opts.castTable || {};
  const seats = (Array.isArray(opts.seats) ? opts.seats : []).filter(s => s && typeof s.cast === 'string').slice(0, 6);
  if (!seats.length) return;
  const T = opts.theme || {};
  const font = opts.fontFamily || '"Space Grotesk", sans-serif';
  const ink = T.ink || '#F8FAFC';
  const palette = ['#38BDF8', '#10B981', '#EC4899', '#A78BFA', '#F59E0B', '#F97316'];
  const plan = swConversationPlan(words) || { shots: [] };
  const speaking = SWDraw.speakerAt(words, time);
  const portrait = H >= W;
  const hasHead = opts.title || opts.subtitle || opts.liveLabel;
  const top = hasHead ? (portrait ? H * 0.135 : H * 0.17) : H * 0.05;

  /* Title band */
  ctx.save();
  ctx.textAlign = 'center';
  if (opts.liveLabel) {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(time * 2.4));
    ctx.font = '700 ' + Math.round(W * 0.02) + 'px ' + font;
    const lw = ctx.measureText(String(opts.liveLabel)).width + W * 0.07;
    const ly = top * 0.2;
    ctx.fillStyle = 'rgba(239,68,68,0.16)';
    ctx.beginPath(); ctx.roundRect(W / 2 - lw / 2, ly, lw, W * 0.041, W * 0.02); ctx.fill();
    ctx.fillStyle = 'rgba(239,68,68,' + pulse.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(W / 2 - lw / 2 + W * 0.026, ly + W * 0.0205, W * 0.0075, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FCA5A5';
    ctx.textAlign = 'left';
    ctx.fillText(String(opts.liveLabel), W / 2 - lw / 2 + W * 0.045, ly + W * 0.028);
    ctx.textAlign = 'center';
  }
  if (opts.title) {
    ctx.fillStyle = ink;
    ctx.font = '700 ' + Math.round(W * (portrait ? 0.059 : 0.034)) + 'px ' + font;
    ctx.fillText(String(opts.title), W / 2, top * 0.62);
  }
  if (opts.subtitle) {
    ctx.fillStyle = swMix(ink, '#0B1224', 0.3);
    ctx.font = '500 ' + Math.round(W * (portrait ? 0.028 : 0.016)) + 'px ' + font;
    ctx.fillText(String(opts.subtitle), W / 2, top * 0.83);
  }
  ctx.restore();

  const { tiles, grid } = swConversationLayout(seats.length, W, H, top);
  seats.forEach((s, i) => {
    const member = castTable[s.cast] || {};
    Object.assign(tiles[i], {
      id: s.cast, name: s.name || member.name || s.cast, role: s.role || '',
      color: s.color || member.seatColor || palette[i % palette.length],
      facing: tiles.length > 1 ? (tiles[i].cx < W / 2 ? 1 : tiles[i].cx > W / 2 + 1 ? -1 : 1) : 1
    });
  });
  /* The figure fills the tile from the hair to the desk. */
  const fig = t => {
    const k = t.h / 560;
    return { scale: 1.95 * k, x: t.cx, y: t.y + t.h * 0.68, deskY: t.y + t.h * 0.7, k };
  };
  const heads = {};
  for (const t of tiles) { const f = fig(t); heads[t.id] = { x: t.cx + t.facing * 4 * f.k, y: f.y - 104 * f.scale }; }

  /* Camera */
  const ease = q => { q = ecClamp(q, 0, 1); return q * q * (3 - 2 * q); };
  let focus = null, zoom = 0;
  if (opts.camera !== 'wide' && tiles.length > 1) {
    for (const sh of plan.shots) {
      if (time < sh.a || time >= sh.b) continue;
      focus = tiles.find(t => t.id === sh.id) || null;
      zoom = Math.min(sh.cutIn ? 1 : ease((time - sh.a) / 0.35), sh.cutOut ? 1 : ease((sh.b - time) / 0.35));
    }
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(0, grid.y - 12, W, grid.h + 24); ctx.clip();
  if (focus && zoom > 0) {
    const k = Math.min(grid.w / focus.w, grid.h / focus.h);
    const s = 1 + (k - 1) * zoom;
    const fcy = focus.y + focus.h / 2;
    ctx.translate(focus.cx + (grid.x + grid.w / 2 - focus.cx) * zoom, fcy + (grid.y + grid.h / 2 - fcy) * zoom);
    ctx.scale(s, s);
    ctx.translate(-focus.cx, -fcy);
  }
  const order = focus && zoom > 0 ? tiles.filter(t => t !== focus).concat([focus]) : tiles;
  for (const t of order) {
    const f = fig(t), k = f.k;
    const live = speaking === t.id;
    const glow = SWDraw.follow(tm => (SWDraw.speakerAt(words, tm) === t.id ? 1 : 0), time, { freq: 3, damping: 0.9, window: 0.8, steps: 24 });
    ctx.save();
    ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 28 * k);
    const wall = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
    wall.addColorStop(0, swMix('#0B1224', t.color, 0.16));
    wall.addColorStop(1, '#070B17');
    ctx.fillStyle = wall;
    ctx.fill();
    ctx.clip();
    const lamp = ctx.createRadialGradient(t.cx, t.y + t.h * 0.36, 10 * k, t.cx, t.y + t.h * 0.36, t.h * 0.46);
    lamp.addColorStop(0, swMix('#0B1224', t.color, 0.35 + 0.25 * glow));
    lamp.addColorStop(1, 'rgba(11,18,36,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let q = 0; q < 4; q++) {
      const px = t.facing > 0 ? t.x + 26 * k + q * 34 * k : t.x + t.w - 26 * k - 24 * k - q * 34 * k;
      ctx.beginPath(); ctx.roundRect(px, t.y + 40 * k, 24 * k, 150 * k, 8 * k); ctx.fill();
    }
    SWDraw.character(ctx, {
      cast: t.id, castTable, words, W, H, time, localTime: opts.localTime,
      x: f.x, y: f.y, scale: f.scale, facing: t.facing,
      pose: 'auto', lookAt: 'speaker', seatHeads: heads,
      headTurn: speaking ? undefined : 0.15
    });
    /* Desk, microphone, name plate */
    const desk = ctx.createLinearGradient(0, f.deskY, 0, t.y + t.h);
    desk.addColorStop(0, '#2A3346');
    desk.addColorStop(1, '#151B2A');
    ctx.fillStyle = desk;
    ctx.fillRect(t.x, f.deskY, t.w, t.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(t.x, f.deskY, t.w, 3 * k);
    const mx = t.cx + t.facing * 92 * k, my = t.y + t.h * 0.41;
    ctx.strokeStyle = '#0F141F'; ctx.lineWidth = 7 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(t.cx + t.facing * 120 * k, f.deskY + 4 * k); ctx.lineTo(mx + t.facing * 18 * k, my + 52 * k); ctx.stroke();
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(t.facing * -0.42);
    ctx.scale(k, k);
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.roundRect(-17, -36, 34, 76, 17); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
    for (let q = -24; q <= 6; q += 6) { ctx.beginPath(); ctx.moveTo(-12, q); ctx.lineTo(12, q); ctx.stroke(); }
    ctx.fillStyle = live ? t.color : '#374151';
    ctx.fillRect(-17, 14, 34, 5);
    ctx.restore();
    const plateY = t.y + t.h - 110 * k;
    ctx.fillStyle = 'rgba(2,6,23,0.55)';
    ctx.beginPath(); ctx.roundRect(t.cx - 120 * k, plateY, 240 * k, (t.role ? 74 : 56) * k, 16 * k); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = '700 ' + Math.round(32 * k) + 'px ' + font;
    ctx.fillText(String(t.name), t.cx, plateY + 42 * k);
    if (t.role) {
      ctx.fillStyle = t.color;
      ctx.font = '700 ' + Math.round(17 * k) + 'px ' + font;
      ctx.fillText(String(t.role), t.cx, plateY + 66 * k);
    }
    if (glow > 0.02) {
      const v = SWDraw.viseme(words.filter(w => w && w.speaker === t.id), time);
      ctx.globalAlpha *= glow;
      for (let q = 0; q < 5; q++) {
        const hgt = (8 + (v.open * 0.8 + 0.2 * Math.abs(Math.sin(time * 9 + q * 1.7))) * 34 * (1 - Math.abs(q - 2) * 0.18)) * k;
        ctx.fillStyle = t.color;
        ctx.beginPath(); ctx.roundRect(t.x + t.w - 92 * k + q * 13 * k, t.y + 54 * k - hgt / 2, 8 * k, hgt, 4 * k); ctx.fill();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.lineWidth = (3 + 3 * glow) * k;
    ctx.strokeStyle = swMix('#1E293B', t.color, glow);
    if (glow > 0.05) { ctx.shadowColor = t.color; ctx.shadowBlur = 28 * glow * k; }
    ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 28 * k); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
SWDraw.conversation = swConversation;
