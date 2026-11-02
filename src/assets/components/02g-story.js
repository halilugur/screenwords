/* ==========================================================================
   Stories: the `story` component stages the project's cast on illustrated
   sets, scene by scene, and directs them from the transcript — an agent
   writes the scenes as data, never per-scene drawing code.

   params.scenes: [{
     start | startLine | startWord   when the scene begins (seconds, the
                                     index of a spoken line, or a word id);
                                     the first scene begins at 0
     set, night?, colors?            an illustrated place (SWDraw.sets)
     cast: [{ cast, x?, enter?, exit?, seated?, prop?, facing?, scale? }]
                                     x 0..1 across the frame; enter / exit
                                     'left' | 'right' walk in / out
     moves?:   [{ line | at, cast, x }]          walk across the set
     actions?: [{ line | at, type, a, b, prop? }] handshake | give | hug
     title?                          a card shown as the scene opens
     camera?                         'auto' (eases toward whoever speaks)
                                     | 'wide'
   }]
   A speaker with no character in the scene is a narrator: heard and
   captioned, never drawn. Characters act their own lines (pose 'auto'),
   look at whoever speaks and face the person they talk to.
   ========================================================================== */

/* The time a scene or action starts: seconds, a line index or a word id. */
function swStoryTime(spec, lines, words, fallback) {
  if (!spec || typeof spec !== 'object') return fallback;
  if (typeof spec.start === 'number' && isFinite(spec.start)) return spec.start;
  if (typeof spec.at === 'number' && isFinite(spec.at)) return spec.at;
  const li = typeof spec.startLine === 'number' ? spec.startLine : typeof spec.line === 'number' ? spec.line : null;
  if (li != null && lines[Math.max(0, Math.min(lines.length - 1, Math.floor(li)))]) return lines[Math.max(0, Math.min(lines.length - 1, Math.floor(li)))].start - 0.15;
  const wid = spec.startWord || spec.word;
  if (wid != null) {
    const w = (words || []).find(x => x && x.id === wid);
    if (w) return ecN(w.start, fallback);
  }
  return fallback;
}

/* The scene timeline: [{scene, a, b}] in order, the first from 0. */
function swStoryScenes(scenes, lines, words, end) {
  const list = (Array.isArray(scenes) ? scenes : []).filter(s => s && typeof s === 'object');
  const timed = list.map((s, i) => ({ scene: s, a: i === 0 ? 0 : swStoryTime(s, lines, words, NaN), i }))
    .filter(x => isFinite(x.a)).sort((p, q) => p.a - q.a);
  timed.forEach((x, k) => { x.b = k + 1 < timed.length ? timed[k + 1].a : end; });
  return timed;
}

/* Where each cast member stands at time t (px) and whether they walk:
   entrances, moves, exits and the approaches actions need, each a walk at a
   steady pace. Returns { x, walking, vx } per cast id. */
function swStoryBlocking(sc, a, b, W, s, lines, words) {
  const pace = 260 * s;
  const people = (sc.cast || []).filter(m => m && typeof m.cast === 'string');
  const plans = {};
  people.forEach((m, i) => {
    const x0 = ecN(m.x, (i + 1) / (people.length + 1)) * W;
    const off = m.enter === 'left' ? -0.12 * W : m.enter === 'right' ? 1.12 * W : null;
    const legs = [];
    let at = a, x = off == null ? x0 : off;
    if (off != null) { legs.push({ t0: a + 0.2, x0: off, x1: x0 }); x = x0; at = a + 0.2 + Math.abs(x0 - off) / pace; }
    plans[m.cast] = { legs, home: x0, start: off == null ? x0 : off, at };
  });
  const walkTo = (id, t, x1) => {
    const P = plans[id];
    if (!P) return;
    const prev = P.legs.length ? P.legs[P.legs.length - 1].x1 : P.start;
    const t0 = Math.max(t, P.legs.length ? P.legs[P.legs.length - 1].t1 || 0 : 0);
    if (Math.abs(x1 - prev) < 2) return;
    P.legs.push({ t0, x0: prev, x1 });
  };
  for (const mv of (Array.isArray(sc.moves) ? sc.moves : [])) {
    if (!mv || typeof mv.cast !== 'string') continue;
    walkTo(mv.cast, swStoryTime(mv, lines, words, a), ecN(mv.x, 0.5) * W);
  }
  /* Actions bring the two together a moment before they happen. */
  for (const act of swStoryActions(sc, lines, words, a)) {
    const PA = plans[act.a], PB = plans[act.b];
    if (!PA || !PB) continue;
    const xa = PA.legs.length ? PA.legs[PA.legs.length - 1].x1 : PA.start;
    const xb = PB.legs.length ? PB.legs[PB.legs.length - 1].x1 : PB.start;
    const mid = (xa + xb) / 2, gap = (act.type === 'hug' ? 40 : 78) * s, side = xa <= xb ? 1 : -1;
    const lead = Math.max(Math.abs(mid - side * gap - xa), Math.abs(mid + side * gap - xb)) / pace;
    walkTo(act.a, act.t - lead - 0.1, mid - side * gap);
    walkTo(act.b, act.t - lead - 0.1, mid + side * gap);
  }
  for (const m of people) {
    if (m.exit === 'left' || m.exit === 'right') {
      const P = plans[m.cast];
      const prev = P.legs.length ? P.legs[P.legs.length - 1].x1 : P.start;
      const x1 = m.exit === 'left' ? -0.12 * W : 1.12 * W;
      walkTo(m.cast, b - 0.3 - Math.abs(x1 - prev) / pace, x1);
    }
  }
  for (const id in plans) for (const L of plans[id].legs) L.t1 = L.t0 + Math.abs(L.x1 - L.x0) / pace;
  return { plans, pace };
}
function swStoryAt(P, t) {
  let x = P.start, walking = 0, vx = 0;
  for (const L of P.legs) {
    if (t >= L.t1) { x = L.x1; continue; }
    if (t >= L.t0) {
      const q = (t - L.t0) / Math.max(1e-3, L.t1 - L.t0);
      x = L.x0 + (L.x1 - L.x0) * q;
      vx = (L.x1 - L.x0) / Math.max(1e-3, L.t1 - L.t0);
      /* ease the gait in and out over a quarter second */
      walking = Math.min(1, (t - L.t0) / 0.25, (L.t1 - t) / 0.25 + 0.2);
    }
    break;
  }
  return { x, walking: ecClamp(walking, 0, 1), vx };
}

function swStoryActions(sc, lines, words, a) {
  return (Array.isArray(sc.actions) ? sc.actions : [])
    .filter(x => x && typeof x.a === 'string' && typeof x.b === 'string' && /^(handshake|give|hug)$/.test(String(x.type)))
    .map(x => ({ type: x.type, a: x.a, b: x.b, prop: x.prop || 'phone', t: swStoryTime(x, lines, words, a + 1) }));
}

/* Draw the story at time t. opts: W, H, time, words, castTable, scenes,
   theme, fontFamily, camera. */
function swStory(ctx, opts) {
  const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920), time = ecN(opts.time, 0);
  const words = Array.isArray(opts.words) ? opts.words : [];
  const castTable = opts.castTable || {};
  const plan = swConversationPlan(words) || { lines: [] };
  const lines = plan.lines;
  const end = Math.max(ecN(opts.duration, 0), words.reduce((m, w) => Math.max(m, ecN(w && w.end, 0)), 0) + 1.5);
  const timeline = swStoryScenes(opts.scenes, lines, words, end);
  const cur = timeline.find(x => time >= x.a && time < x.b) || timeline[timeline.length - 1];
  if (!cur) return;
  const sc = cur.scene, a = cur.a, b = cur.b;
  const U = Math.min(W, H), portrait = H >= W;
  const s = (portrait ? U / 520 : U / 640) * ecN(sc.scale, 1);
  const font = opts.fontFamily || '"Space Grotesk", sans-serif';
  const floorY = SWDraw.setFloor(sc.set, H);
  const { plans } = swStoryBlocking(sc, a, b, W, s, lines, words);
  const actions = swStoryActions(sc, lines, words, a);
  const people = (sc.cast || []).filter(m => m && typeof m.cast === 'string');
  const pos = {};
  for (const m of people) pos[m.cast] = swStoryAt(plans[m.cast], time);
  const speaking = SWDraw.speakerAt(words, time);
  const heads = {};
  for (const m of people) heads[m.cast] = { x: pos[m.cast].x, y: floorY - (170 + 140) * s * ecN(m.scale, 1) };

  /* Camera: ease toward whoever speaks (never past the set's edges). */
  const ease = q => { q = ecClamp(q, 0, 1); return q * q * (3 - 2 * q); };
  let zoom = 1, cx = W / 2;
  if ((sc.camera || opts.camera) !== 'wide' && speaking && pos[speaking]) {
    const held = SWDraw.follow(tm => (SWDraw.speakerAt(words, tm) === speaking ? 1 : 0), time, { freq: 1.2, damping: 1, window: 2, steps: 40 });
    zoom = 1 + 0.14 * ease(held);
    cx = W / 2 + (pos[speaking].x - W / 2) * 0.6 * ease(held);
  }
  ctx.save();
  if (zoom > 1.001) {
    const fx = ecClamp(cx, W / (2 * zoom), W - W / (2 * zoom)), fy = floorY - H * 0.25;
    ctx.translate(W / 2, fy);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
  }
  const camX = (cx - W / 2) * 0.15;
  SWDraw.set(ctx, sc.set, { W, H, time, night: !!sc.night, colors: sc.colors, layer: 'back', camX });

  /* People, back to front by x so overlaps read left to right. */
  const order = people.slice().sort((p, q) => pos[p.cast].x - pos[q.cast].x);
  for (const m of order) {
    const p = pos[m.cast], id = m.cast, ms = s * ecN(m.scale, 1);
    const others = people.filter(o => o.cast !== id);
    let facing = ecN(m.facing, 0);
    if (Math.abs(p.vx) > 20) facing = Math.sign(p.vx);
    else if (!facing) {
      const target = speaking && speaking !== id && pos[speaking] ? pos[speaking].x
        : others.length ? others.reduce((acc, o) => acc + pos[o.cast].x, 0) / others.length : W / 2;
      facing = target >= p.x ? 1 : -1;
    }
    const o = {
      cast: id, castTable, words, W, H, time, localTime: time,
      x: p.x, y: floorY - 170 * ms, scale: ms, facing,
      walkAmount: p.walking, vx: p.vx, seated: !!m.seated && p.walking < 0.05,
      prop: m.prop, pose: p.walking > 0.05 ? 'walk' : 'auto', lookAt: 'speaker', seatHeads: heads
    };
    /* Interactions in progress */
    for (const act of actions) {
      const dt = time - act.t;
      if (dt < -0.4 || dt > 2.2) continue;
      const partner = act.a === id ? act.b : act.b === id ? act.a : null;
      if (!partner || !pos[partner]) continue;
      const q = ease((dt + 0.4) / 0.5) * ease((2.2 - dt) / 0.4);
      const px = pos[partner].x, chestY = floorY - (170 + 50) * ms;
      const meet = (p.x + px) / 2;
      o.facing = px >= p.x ? 1 : -1;
      if (act.type === 'handshake') {
        o.rightHand = { x: p.x + (meet - p.x) * q + (1 - q) * o.facing * 30 * ms, y: chestY + 30 * ms + Math.sin(time * 12) * 4 * ms * q };
        o.rightHandPose = 'open';
        o.emotion = 'happy';
      } else if (act.type === 'give') {
        o.rightHand = { x: p.x + (meet - p.x) * q, y: chestY + 20 * ms };
        o.rightHandPose = 'hold';
      } else if (act.type === 'hug') {
        o.rightHand = { x: px + o.facing * 14 * ms, y: chestY - 8 * ms };
        o.leftHand = { x: px - o.facing * 4 * ms, y: chestY + 18 * ms };
        o.rightHandPose = o.leftHandPose = 'relaxed';
        o.emotion = 'happy';
        o.lookAt = undefined;
      }
    }
    /* A given thing is in the giver's hand until the hand-over, then in the
       receiver's. */
    for (const act of actions) {
      if (act.type !== 'give' || (act.a !== id && act.b !== id)) continue;
      const has = act.a === id ? time < act.t + 0.9 : time >= act.t + 0.9;
      o.prop = has ? act.prop : (o.prop === act.prop ? null : o.prop);
    }
    SWDraw.character(ctx, o);
  }
  SWDraw.set(ctx, sc.set, { W, H, time, night: !!sc.night, colors: sc.colors, layer: 'front', camX });
  ctx.restore();

  /* Scene card */
  if (sc.title) {
    const q = Math.min(ease((time - a - 0.3) / 0.4), ease((a + 3 - time) / 0.4));
    if (q > 0.001) {
      ctx.save();
      ctx.globalAlpha *= q;
      ctx.font = '700 ' + Math.round(U * 0.032) + 'px ' + font;
      const tw = ctx.measureText(String(sc.title)).width + U * 0.08;
      const ty = H * (portrait ? 0.1 : 0.08) - (1 - q) * 20;
      ctx.fillStyle = 'rgba(2,6,23,0.72)';
      ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, ty, tw, U * 0.07, U * 0.035); ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(String(sc.title), W / 2, ty + U * 0.047);
      ctx.restore();
    }
  }
  /* Between scenes: a short dip to black. */
  const edge = Math.min(time - a, b - time);
  if (timeline.length > 1 && edge < 0.3) {
    const first = cur === timeline[0], last = cur === timeline[timeline.length - 1];
    const fadeIn = time - a < 0.3 && !first, fadeOut = b - time < 0.3 && !last;
    if (fadeIn || fadeOut) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.globalAlpha *= 1 - ecClamp(edge / 0.3, 0, 1);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}
SWDraw.story = swStory;
SWDraw.storyScenes = swStoryScenes;
