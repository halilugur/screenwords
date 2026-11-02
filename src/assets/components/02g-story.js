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
    const gap = (act.type === 'hug' ? 24 : act.type === 'give' ? 56 : 60) * s, side = xa <= xb ? 1 : -1;
    /* A seated person stays put and the other comes to them — except for a
       hug, where the one sitting gets up and goes to the other. */
    const hug = act.type === 'hug';
    const seatA = !hug && people.find(m => m.cast === act.a && m.seated), seatB = !hug && people.find(m => m.cast === act.b && m.seated);
    const upA = hug && people.find(m => m.cast === act.a && m.seated), upB = hug && people.find(m => m.cast === act.b && m.seated);
    const mid = seatB && !seatA ? xb - side * gap : seatA && !seatB ? xa + side * gap
      : upB && !upA ? xa + side * gap : upA && !upB ? xb - side * gap : (xa + xb) / 2;
    const ta = seatA ? xa : mid - side * gap, tb = seatB ? xb : mid + side * gap;
    const lead = Math.max(Math.abs(ta - xa), Math.abs(tb - xb)) / pace;
    walkTo(act.a, act.t - lead - 0.1, ta);
    walkTo(act.b, act.t - lead - 0.1, tb);
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

/* A small round café table with a cup, standing on the floor at x. */
function swStoryTable(ctx, x, floorY, s, night) {
  const top = floorY - 128 * s;
  ctx.save();
  ctx.fillStyle = night ? '#2B1B14' : '#4E342E';
  ctx.fillRect(x - 5 * s, top, 10 * s, floorY - top - 6 * s);
  ctx.beginPath(); ctx.ellipse(x, floorY - 4 * s, 34 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = night ? '#4A3328' : '#8D6E63';
  ctx.beginPath(); ctx.roundRect(x - 62 * s, top - 7 * s, 124 * s, 14 * s, 7 * s); ctx.fill();
  ctx.fillStyle = night ? '#5D4037' : '#A1887F';
  ctx.beginPath(); ctx.roundRect(x - 62 * s, top - 7 * s, 124 * s, 5 * s, 3 * s); ctx.fill();
  /* a cup and saucer */
  ctx.fillStyle = '#F5F5F4';
  ctx.beginPath(); ctx.ellipse(x + 18 * s, top - 8 * s, 14 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x + 10 * s, top - 22 * s, 16 * s, 14 * s, 3 * s); ctx.fill();
  ctx.strokeStyle = '#F5F5F4'; ctx.lineWidth = 2.4 * s;
  ctx.beginPath(); ctx.arc(x + 28 * s, top - 15 * s, 4 * s, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.restore();
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

  /* Camera: shots with a purpose. Wide while the scene opens, while
     anyone walks, for the narrator and for short reactions; a close shot
     on the face of a character speaking a line of 3 s or more; a two-shot
     framing both people through an action. Moves ease between shots and
     the frame never leaves the set. */
  const ease = q => { q = ecClamp(q, 0, 1); return q * q * (3 - 2 * q); };
  const wide = { z: 1, x: W / 2, y: H / 2 };
  /* A face's height at time t: lower while its owner sits at home. */
  const headY = (m, k, cid, t) => {
    const P = swStoryAt(plans[cid], t);
    return floorY - 268 * k + (m.seated && Math.abs(P.x - plans[cid].home) < 2 && P.walking < 0.05 ? SWDraw.seatDrop('flat') * k : 0);
  };
  const shotAt = t => {
    if ((sc.camera || opts.camera) === 'wide' || t < a + 2.2 || t > b - 0.6) return wide;
    for (const id in plans) if (swStoryAt(plans[id], t).walking > 0.05) return wide;
    for (const act of actions) {
      if (t < act.t - 0.6 || t > act.t + 2.4 || !plans[act.a] || !plans[act.b]) continue;
      const xa = swStoryAt(plans[act.a], act.t).x, xb = swStoryAt(plans[act.b], act.t).x;
      return { z: portrait ? 1.22 : 1.32, x: (xa + xb) / 2, y: floorY - 190 * s };
    }
    const line = lines.find(l => t >= l.start + 0.35 && t <= l.end + 0.25);
    if (!line || line.end - line.start < 3 || !plans[line.id]) return wide;
    const m = people.find(x => x.cast === line.id) || {}, k = s * ecN(m.scale, 1);
    return { z: portrait ? 1.25 : 1.38, x: swStoryAt(plans[line.id], t).x, y: headY(m, k, line.id, t) + 40 * k };
  };
  const smoothCam = key => SWDraw.follow(t => shotAt(t)[key], time, { freq: 0.9, damping: 1, window: 2.4, steps: 48 });
  const zoom = Math.max(1, smoothCam('z'));
  let fx = smoothCam('x'), fy = smoothCam('y');
  ctx.save();
  if (zoom > 1.001) {
    fx = ecClamp(fx, W / (2 * zoom), W - W / (2 * zoom));
    fy = ecClamp(fy, H / (2 * zoom), H - H / (2 * zoom));
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
  }
  const camX = 0;
  SWDraw.set(ctx, sc.set, { W, H, time, night: !!sc.night, colors: sc.colors, layer: 'back', camX });

  /* Which way someone sitting faces: toward the others. */
  const facingHome = id => {
    const others = people.filter(o => o.cast !== id);
    const cx = others.length ? others.reduce((acc, o) => acc + plans[o.cast].home, 0) / others.length : W / 2;
    return cx >= plans[id].home ? 1 : -1;
  };
  /* People, back to front by x so overlaps read left to right. */
  const order = people.slice().sort((p, q) => pos[p.cast].x - pos[q.cast].x);
  /* A table whose sitter has got up stands behind everyone. */
  for (const m of people) {
    const ms = s * ecN(m.scale, 1), P = pos[m.cast];
    if (m.seated && (m.table === true || (m.table !== false && sc.set === 'cafe')) && !(Math.abs(P.x - plans[m.cast].home) < 2 && P.walking < 0.05)) {
      swStoryTable(ctx, plans[m.cast].home + (m.facing ? m.facing : facingHome(m.cast)) * 34 * ms, floorY, ms, sc.night);
    }
  }
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
      walkAmount: p.walking, vx: p.vx, seated: !!m.seated && Math.abs(p.x - plans[id].home) < 2 && p.walking < 0.05,
      prop: m.prop, pose: p.walking > 0.05 ? 'walk' : 'auto', lookAt: 'speaker', seatHeads: heads
    };
    let hugging = false;
    /* Interactions in progress, as two-person poses. Heights are in the
       figure's frame: the hip at floor - 140·s, the waist at floor - 166·s,
       the shoulders at floor - 227·s. */
    for (const act of actions) {
      const dt = time - act.t;
      if (dt < -0.5 || dt > 2.4) continue;
      const partner = act.a === id ? act.b : act.b === id ? act.a : null;
      if (!partner || !pos[partner]) continue;
      const q = ease((dt + 0.5) / 0.5) * ease((2.4 - dt) / 0.45);
      const px = pos[partner].x, toward = px >= p.x ? 1 : -1;
      const pm = people.find(x => x.cast === partner) || {}, pk = s * ecN(pm.scale, 1);
      const sitDrop = (mm, k, cid) => (mm.seated && pos[cid].walking < 0.05 ? SWDraw.seatDrop('flat') * k : 0);
      const myDrop = sitDrop(m, ms, id), theirDrop = sitDrop(pm, pk, partner);
      o.facing = toward;
      o.pose = 'idle';
      o.lookAt = { x: px, y: floorY - 275 * pk + theirDrop };
      const lerp = (u, v) => u + (v - u) * q;
      if (act.type === 'handshake') {
        /* Right hands clasp between them at the waist and pump twice. */
        const meetX = (p.x + px) / 2, meetY = (floorY - 160 * ms + myDrop + floorY - 160 * pk + theirDrop) / 2;
        const pump = dt > 0 && dt < 1.3 ? Math.sin(dt * Math.PI * 2 / 0.65) * 5 * ms : 0;
        const rest = { x: p.x + toward * 20 * ms, y: floorY - 120 * ms + myDrop };
        o.rightHand = { x: lerp(rest.x, meetX - toward * 12 * ms), y: lerp(rest.y, meetY + pump) };
        o.rightHandPose = 'hold';
        o.emotion = 'happy';
      } else if (act.type === 'give') {
        /* The giver holds the thing out; the receiver opens a palm under it. */
        const meetX = (p.x + px) / 2, meetY = (floorY - 175 * ms + myDrop + floorY - 175 * pk + theirDrop) / 2;
        const rest = { x: p.x + toward * 20 * ms, y: floorY - 120 * ms + myDrop };
        const giver = act.a === id;
        o.rightHand = { x: lerp(rest.x, meetX - toward * (giver ? 16 : 6) * ms), y: lerp(rest.y, meetY + (giver ? 0 : 8 * ms)) };
        o.rightHandPose = giver ? 'hold' : 'open';
      } else if (act.type === 'hug') {
        /* An embrace: whoever is drawn behind wraps both arms round the
           other's back (hands showing at their far side); the one in front
           puts an arm over the other's shoulder. Heads lean in, eyes close. */
        const behind = pos[id].x < pos[partner].x || (pos[id].x === pos[partner].x && id < partner);
        const shoulderY = floorY - 215 * pk + theirDrop, waistY = floorY - 170 * pk + theirDrop;
        if (behind) {
          o.rightHand = { x: lerp(p.x + toward * 20 * ms, px + toward * 30 * pk), y: lerp(floorY - 120 * ms, shoulderY + 6 * pk) };
          o.leftHand = { x: lerp(p.x - toward * 20 * ms, px + toward * 24 * pk), y: lerp(floorY - 120 * ms, waistY) };
          o.rightHandPose = o.leftHandPose = 'relaxed';
        } else {
          o.rightHand = { x: lerp(p.x + toward * 20 * ms, px - toward * 26 * pk), y: lerp(floorY - 120 * ms, shoulderY + 4 * pk) };
          o.rightHandPose = 'relaxed';
        }
        o.headTilt = 0.55 * q;
        /* Nobody hugs from a chair, or with a phone in hand. */
        o.seated = false;
        o.prop = null;
        hugging = true;
        o.emotion = q > 0.5 ? 'content' : 'happy';
        o.lookAt = undefined;
        o.headTurn = 0.6;
      }
    }
    /* A given thing is in the giver's hand until the hand-over, then in the
       receiver's. */
    for (const act of actions) {
      if (hugging || act.type !== 'give' || (act.a !== id && act.b !== id)) continue;
      const has = act.a === id ? time < act.t + 0.9 : time >= act.t + 0.9;
      o.prop = has ? act.prop : (o.prop === act.prop ? null : o.prop);
    }
    SWDraw.character(ctx, o);
    /* Someone seated sits at a small table, which says "sitting" from the
       front far better than legs do. */
    if (o.seated && (m.table === true || (m.table !== false && sc.set === 'cafe'))) swStoryTable(ctx, plans[id].home + (m.facing ? m.facing : facingHome(id)) * 34 * ms, floorY, ms, sc.night);
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
