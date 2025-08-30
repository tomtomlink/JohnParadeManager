// John Parade Manager - Portrait optimized, character selection, continuous levels, no auto-follow

let CANVAS_W = 360, CANVAS_H = 640; // dynamically set on resize

const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = [];
const PNJ_RADIUS = 12;
const ZONE_RADIUS = 22;
const FOOT_OFFSET = 18;            // base local Y offset of feet from origin
const SCALE_PLAYER = 1.35;         // used in render and feet computations
const SCALE_PNJ = 1.25;

const MOVE_DURATION_BASE = 2000;
const MAX_OUT_ZONE_MS = 5000;
const MIN_DIST = 26;

// Layout (larger game area, smaller crowd)
let PAD_LR = 22;
let PAD_TOP = 40;
let PAD_BOTTOM = 32;

const colors = {
  pelouse: ["#52b06d", "#2e944b", "#b1e2b3"],
  pelouseDark: "#3c8b55",
  line: "#f6f6f6",
  zone: "rgba(255,255,0,0.28)",
  crowd: ["#c57b57","#e0b089","#a06c49","#8aa4c8","#d7a1a7","#9b9b9b"],
  trumpetBrass: "#D4AF37",
  trumpetShadow: "#b08f2d"
};

let canvas, ctx, gameState = null;
let playerTarget = {x: 0, y: 0}; // will be set on pointer events only
let musicAudio = null;

let selectedCharacter = 'john';  // 'john' | 'minik' | 'amelie'
let isDragging = false;

function getBounds() {
  return {
    left: PAD_LR,
    right: CANVAS_W - PAD_LR,
    top: PAD_TOP,
    bottom: CANVAS_H - PAD_BOTTOM
  };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampIntoBounds(pos, margin) {
  const b = getBounds();
  return {
    x: clamp(pos.x, b.left + margin, b.right - margin),
    y: clamp(pos.y, b.top + margin, b.bottom - margin)
  };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpPt(p, q, t) { return { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) }; }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }

// Overlay (kept only for endGame)
function showOverlay(message, buttonText = "Recommencer") {
  const overlay = document.getElementById('game-overlay');
  document.getElementById('overlay-message').textContent = message;
  document.getElementById('overlay-button').textContent = buttonText;
  overlay.style.display = 'grid';
  if (gameState) gameState.running = false;
}
function hideOverlay() {
  document.getElementById('game-overlay').style.display = 'none';
  if (gameState) gameState.running = true;
}

// Banner message (levels chaining)
function showBanner(text, ms = 1400) {
  const b = document.getElementById('level-banner');
  b.textContent = text;
  b.classList.add('show');
  setTimeout(() => {
    b.classList.remove('show');
  }, ms);
}

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d', { alpha: false });
  document.getElementById('play-btn').onclick = startGame;
  document.getElementById('overlay-button').onclick = () => location.reload();

  // Music
  musicAudio = new Audio('music.mp3');
  musicAudio.loop = true;

  // Character selection UI
  const openSelect = document.getElementById('select-btn');
  const closeSelect = document.getElementById('close-select');
  const modal = document.getElementById('select-modal');

  openSelect.addEventListener('click', () => {
    modal.setAttribute('aria-hidden', 'false');
    drawCharacterPreviews();
  });
  closeSelect.addEventListener('click', () => {
    modal.setAttribute('aria-hidden', 'true');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.char-card').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCharacter = btn.dataset.char || 'john';
      modal.setAttribute('aria-hidden', 'true');
      // Visually update button text with selection
      openSelect.textContent = `Musicien: ${capitalize(selectedCharacter)}`;
    });
  });

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function resizeCanvas() {
  // Portrait-first
  const vw = Math.max(320, Math.min(window.innerWidth, 480));
  const vh = Math.max(560, Math.min(window.innerHeight, 940));
  CANVAS_W = vw;
  CANVAS_H = vh;

  // Bigger game area (smaller paddings)
  const scale = CANVAS_W / 360;
  PAD_LR = Math.round(22 * scale);
  PAD_TOP = Math.round(36 * scale);
  PAD_BOTTOM = Math.round(28 * scale);

  // High DPI
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';
  canvas.width = Math.round(CANVAS_W * dpr);
  canvas.height = Math.round(CANVAS_H * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function startGame() {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-container').style.display = 'flex';
  initFormation();

  gameState = {
    playerIdx: 12,
    player: {x: FORMATION[12].x, y: FORMATION[12].y, outZoneMs: 0},
    level: 1,
    score: 0,
    running: true,

    // Motion
    moves: [],
    currentMove: 0,
    moveStartTime: performance.now(),
    moveDuration: MOVE_DURATION_BASE,
    moveFrom: [],
    moveTo: [],
    playerFrom: {x: 0, y: 0},
    playerTo: {x: 0, y: 0},
  };

  // Music
  if (musicAudio && musicAudio.paused) {
    musicAudio.currentTime = 0;
    musicAudio.play().catch(()=>{});
  }

  initLevel(gameState.level);
  gameState.moveFrom = FORMATION.map(p => ({...p}));
  setStepTargets(0);

  // Input
  canvas.addEventListener('pointerdown', onPointerDown, {passive: false});
  canvas.addEventListener('pointermove', onPointerMove, {passive: true});
  canvas.addEventListener('pointerup', onPointerUp, {passive: false});
  canvas.addEventListener('pointercancel', onPointerUp, {passive: false});
  canvas.addEventListener('pointerleave', onPointerUp, {passive: false});

  requestAnimationFrame(gameLoop);
}

// Initial formation (diamond within bounds)
function initFormation() {
  FORMATION.length = 0;
  const b = getBounds();
  const centerX = (b.left + b.right) / 2;
  const topY = b.top + 40;
  const spacing = Math.min(44, (b.right - b.left) / 6.0);
  for (let row=0; row<ROWS; row++) {
    for (let col=0; col<COLS; col++) {
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = topY + row*spacing;
      let clamped = clampIntoBounds({x,y}, PNJ_RADIUS);
      FORMATION.push(clamped);
    }
  }
}

// Level setup
function initLevel(level) {
  const endPositions = getLevelFinalShapePositions(level);
  const steps = Math.max(16, 10 + level * 4);
  const SPEEDUP = 0.68;
  gameState.moveDuration = Math.max(220, MOVE_DURATION_BASE * Math.pow(SPEEDUP, level-1));
  gameState.moves = buildSmoothPathMoves(FORMATION.map(p=>({...p})), endPositions, steps, level);
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function buildSmoothPathMoves(startPositions, endPositions, steps, level) {
  const path = [];
  const baseAmp = Math.min(12, 6 + level * 1.2);
  const angOffset = Math.PI / 7;
  let prevPositions = startPositions.map(p => ({...p}));

  for (let s = 1; s <= steps; s++) {
    const t = easeInOutCubic(s / steps);
    const amp = baseAmp * (1 - t);
    const stepTargets = [];

    for (let i = 0; i < MUSICIANS; i++) {
      const start = startPositions[i];
      const end = endPositions[i];
      let target = lerpPt(start, end, t);
      // swirl
      const vx = end.x - start.x;
      const vy = end.y - start.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = -vy / len, ny = vx / len;
      const swirl = Math.sin(t * Math.PI * 2 + i * 0.33 + angOffset) * amp;
      target.x += nx * swirl;
      target.y += ny * swirl;
      stepTargets.push(target);
    }

    const adjusted = resolveTargets(prevPositions, stepTargets);
    const deltas = adjusted.map((p, i) => ({ dx: p.x - prevPositions[i].x, dy: p.y - prevPositions[i].y }));
    path.push(deltas);
    prevPositions = adjusted;
  }

  // Snap last step to exact end
  const lastStep = path[path.length - 1];
  for (let i = 0; i < MUSICIANS; i++) {
    const before = { x: prevPositions[i].x - lastStep[i].dx, y: prevPositions[i].y - lastStep[i].dy };
    lastStep[i].dx = endPositions[i].x - before.x;
    lastStep[i].dy = endPositions[i].y - before.y;
  }
  return path;
}

function resolveTargets(fromPositions, targetPositions) {
  const N = targetPositions.length;
  let newPos = targetPositions.map(p => ({x: p.x, y: p.y}));
  // clamp
  for (let i = 0; i < N; i++) {
    const margin = (i === 12) ? ZONE_RADIUS : PNJ_RADIUS;
    newPos[i] = clampIntoBounds(newPos[i], margin);
  }
  // separate
  let changed = true, iter = 0;
  while (changed && iter < 12) {
    changed = false;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = newPos[j].x - newPos[i].x;
        let dy = newPos[j].y - newPos[i].y;
        let d = Math.hypot(dx, dy);
        if (d < MIN_DIST) {
          changed = true;
          let nx = dx / (d || 1), ny = dy / (d || 1);
          let push = (MIN_DIST - d) / 2;
          newPos[i].x -= nx * push; newPos[i].y -= ny * push;
          newPos[j].x += nx * push; newPos[j].y += ny * push;
          newPos[i] = clampIntoBounds(newPos[i], (i===12)? ZONE_RADIUS : PNJ_RADIUS);
          newPos[j] = clampIntoBounds(newPos[j], (j===12)? ZONE_RADIUS : PNJ_RADIUS);
        }
      }
    }
    iter++;
  }
  return newPos;
}

// Final shapes per level
function getLevelFinalShapePositions(level) {
  const b = getBounds();
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const w = (b.right - b.left);
  const h = (b.bottom - b.top);
  const radius = Math.min(w, h) * 0.36;

  switch(level) {
    case 1:  return distributeAlongPolyline(diamondVertices(cx, cy, radius), MUSICIANS);
    case 2:  return pointsOnCircle(cx, cy, radius, MUSICIANS);
    case 3:  return grid5x5(cx, cy, Math.min(w, h) * 0.58);
    case 4:  return distributeAlongPolyline(starVertices(cx, cy, radius*0.55, radius, -Math.PI/2), MUSICIANS);
    case 5:  return distributeAlongPolyline(polygonVertices(cx, cy, 3, radius, -Math.PI/2), MUSICIANS);
    case 6:  return distributeAlongPolyline(polygonVertices(cx, cy, 6, radius, -Math.PI/2), MUSICIANS);
    case 7:  return plusShape(cx, cy, radius);
    case 8:  return distributeAlongPolyline(polygonVertices(cx, cy, 5, radius, -Math.PI/2), MUSICIANS);
    case 9:  return xShape(cx, cy, radius);
    case 10: return distributeAlongPolyline(polygonVertices(cx, cy, 8, radius, -Math.PI/2), MUSICIANS);
    default: return pointsOnCircle(cx, cy, radius, MUSICIANS);
  }
}
function polygonVertices(cx, cy, sides, r, rot=0) {
  const verts = [];
  for (let i=0; i<sides; i++) {
    const a = rot + i * 2*Math.PI/sides;
    verts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
  }
  verts.push(verts[0]);
  return verts;
}
function starVertices(cx, cy, innerR, outerR, rot=0, points=5) {
  const verts = [];
  for (let i=0; i<points*2; i++) {
    const r = (i%2===0) ? outerR : innerR;
    const a = rot + i * Math.PI/points;
    verts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
  }
  verts.push(verts[0]);
  return verts;
}
function diamondVertices(cx, cy, r) {
  return [
    {x: cx, y: cy - r},
    {x: cx + r, y: cy},
    {x: cx, y: cy + r},
    {x: cx - r, y: cy},
    {x: cx, y: cy - r}
  ];
}
function distributeAlongPolyline(verts, count) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < verts.length-1; i++) {
    const p = verts[i], q = verts[i+1];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    segs.push({p, q, len});
    total += len;
  }
  const step = total / count;
  const pts = [];
  let segIdx = 0, segPos = 0;
  for (let k = 0; k < count; k++) {
    const targetDist = k * step;
    while (segIdx < segs.length && targetDist > segPos + segs[segIdx].len) {
      segPos += segs[segIdx].len;
      segIdx++;
    }
    if (segIdx >= segs.length) pts.push({...segs[segs.length-1].q});
    else {
      const seg = segs[segIdx];
      const t = (targetDist - segPos) / (seg.len || 1);
      pts.push(lerpPt(seg.p, seg.q, t));
    }
  }
  return pts.map(p => clampIntoBounds(p, PNJ_RADIUS));
}
function pointsOnCircle(cx, cy, r, count) {
  const pts = [];
  for (let i=0; i<count; i++) {
    const a = -Math.PI/2 + i * 2*Math.PI / count;
    pts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
  }
  return pts.map(p => clampIntoBounds(p, PNJ_RADIUS));
}
function grid5x5(cx, cy, size) {
  const pts = [];
  const step = size / 4;
  const startX = cx - size/2;
  const startY = cy - size/2;
  for (let r=0; r<5; r++) {
    for (let c=0; c<5; c++) {
      pts.push({ x: startX + c*step, y: startY + r*step });
    }
  }
  return pts.map(p => clampIntoBounds(p, PNJ_RADIUS));
}
function plusShape(cx, cy, r) {
  const pts = [];
  const step = r / 4;
  for (let i=-2; i<=2; i++) pts.push({ x: cx, y: cy + i*step });
  for (let i=-2; i<=2; i++) if (i!==0) pts.push({ x: cx + i*step, y: cy });
  while (pts.length < MUSICIANS) {
    const k = pts.length;
    const off = 0.6 + 0.2*((k%4)-1.5);
    pts.push({ x: cx + off*step, y: cy + off*step });
  }
  return pts.slice(0, MUSICIANS).map(p => clampIntoBounds(p, PNJ_RADIUS));
}
function xShape(cx, cy, r) {
  const pts = [];
  const step = r / 4;
  for (let i=-2; i<=2; i++) pts.push({ x: cx + i*step, y: cy + i*step });
  for (let i=-2; i<=2; i++) if (i!==0) pts.push({ x: cx + i*step, y: cy - i*step });
  while (pts.length < MUSICIANS) {
    pts.push({ x: cx + (Math.random()*0.5-0.25)*step, y: cy + (Math.random()*0.5-0.25)*step });
  }
  return pts.slice(0, MUSICIANS).map(p => clampIntoBounds(p, PNJ_RADIUS));
}

// Step targets
function setStepTargets(stepIdx) {
  const deltas = gameState.moves[stepIdx];
  const rawTargets = gameState.moveFrom.map((p, i) => ({ x: p.x + deltas[i].dx, y: p.y + deltas[i].dy }));
  const adjusted = resolveTargets(gameState.moveFrom, rawTargets);
  gameState.moveTo = adjusted;

  const iP = gameState.playerIdx;
  const dpx = adjusted[iP].x - gameState.moveFrom[iP].x;
  const dpy = adjusted[iP].y - gameState.moveFrom[iP].y;
  gameState.playerFrom = { x: gameState.player.x, y: gameState.player.y };
  gameState.playerTo = { x: gameState.player.x + dpx, y: gameState.player.y + dpy };

  // IMPORTANT: ne pas déplacer playerTarget automatiquement (pas d'auto-follow)
}

// Game loop
function gameLoop() {
  if (!gameState || !gameState.running) return;
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function update() {
  const now = performance.now();

  // Continuous tween
  let elapsed = now - gameState.moveStartTime;
  while (elapsed >= gameState.moveDuration) {
    // finalize step
    for (let i=0; i<FORMATION.length; i++) {
      FORMATION[i].x = gameState.moveTo[i].x;
      FORMATION[i].y = gameState.moveTo[i].y;
    }
    gameState.player.x = gameState.playerTo.x;
    gameState.player.y = gameState.playerTo.y;

    // next step or next level
    gameState.currentMove++;
    if (gameState.currentMove >= gameState.moves.length) {
      // complete level without pause
      const prevLevel = gameState.level;
      completeLevel();
      if (!gameState.running) return;
      // After initLevel, we must prepare next step references
      gameState.moveFrom = FORMATION.map(p => ({...p}));
      setStepTargets(0);
    } else {
      gameState.moveFrom = FORMATION.map(p => ({...p}));
      setStepTargets(gameState.currentMove);
    }

    gameState.moveStartTime += gameState.moveDuration;
    elapsed = now - gameState.moveStartTime;
  }

  // Interpolate current step
  const t = clamp(elapsed / gameState.moveDuration, 0, 1);
  for (let i=0; i<FORMATION.length; i++) {
    FORMATION[i].x = lerp(gameState.moveFrom[i].x, gameState.moveTo[i].x, t);
    FORMATION[i].y = lerp(gameState.moveFrom[i].y, gameState.moveTo[i].y, t);
  }
  gameState.player.x = lerp(gameState.playerFrom.x, gameState.playerTo.x, t);
  gameState.player.y = lerp(gameState.playerFrom.y, gameState.playerTo.y, t);

  // Smooth control only if dragging
  if (isDragging) {
    const FOLLOW_SPEED = 0.25;
    const clampedTarget = clampIntoBounds(playerTarget, 30);
    gameState.player.x += (clampedTarget.x - gameState.player.x) * FOLLOW_SPEED;
    gameState.player.y += (clampedTarget.y - gameState.player.y) * FOLLOW_SPEED;
    // Clamp player position
    const clampedPlayer = clampIntoBounds({x: gameState.player.x, y: gameState.player.y}, 30);
    gameState.player.x = clampedPlayer.x;
    gameState.player.y = clampedPlayer.y;
  }

  // Zone timer uses feet positions
  if (!isPlayerInZone()) {
    gameState.player.outZoneMs += 16;
    if (gameState.player.outZoneMs > MAX_OUT_ZONE_MS) endGame();
  } else {
    gameState.player.outZoneMs = 0;
    gameState.score++;
  }
}

// Input (no auto-follow when idle)
function onPointerDown(e) {
  e.preventDefault?.();
  isDragging = true;
  updateTargetFromEvent(e);
}
function onPointerMove(e) {
  if (!isDragging) return;
  updateTargetFromEvent(e);
}
function onPointerUp(e) {
  isDragging = false;
}
function updateTargetFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  const clamped = clampIntoBounds({x, y}, 30);
  playerTarget.x = clamped.x;
  playerTarget.y = clamped.y;
}

// Rendering
let grassPattern = null;
function getGrassPattern() {
  if (grassPattern) return grassPattern;
  const off = document.createElement('canvas');
  off.width = 96; off.height = 96;
  const c = off.getContext('2d');
  // base
  c.fillStyle = '#3a7950';
  c.fillRect(0,0,off.width,off.height);
  // lines
  c.strokeStyle = 'rgba(255,255,255,0.05)';
  c.lineWidth = 1;
  for (let y=8; y<off.height; y+=12) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(off.width, y-2);
    c.stroke();
  }
  // noise dots
  for (let i=0; i<450; i++) {
    const x = Math.random()*off.width;
    const y = Math.random()*off.height;
    const a = 0.06 + Math.random()*0.06;
    c.fillStyle = `rgba(255,255,255,${a})`;
    c.fillRect(x, y, 1, 1);
  }
  grassPattern = ctx.createPattern(off, 'repeat');
  return grassPattern;
}

function render() {
  // Grass textured background
  ctx.fillStyle = getGrassPattern();
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  const b = getBounds();

  // Darker outside of game area
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  // Top
  ctx.fillRect(0, 0, CANVAS_W, b.top);
  // Bottom
  ctx.fillRect(0, b.bottom, CANVAS_W, CANVAS_H - b.bottom);
  // Left
  ctx.fillRect(0, b.top, b.left, b.bottom - b.top);
  // Right
  ctx.fillRect(b.right, b.top, CANVAS_W - b.right, b.bottom - b.top);

  // Field lines
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

  // Crowd (reduced)
  drawCrowd();

  // Yellow zone centered at FEET of the player's slot (PNJ scale reference)
  const playerIdx = gameState.playerIdx;
  const zoneX = FORMATION[playerIdx].x;
  const zoneY = FORMATION[playerIdx].y + FOOT_OFFSET * SCALE_PNJ;
  ctx.beginPath();
  ctx.arc(zoneX, zoneY, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone;
  ctx.fill();

  // Draw musicians
  for (let i=0; i<FORMATION.length; i++) {
    const isPlayer = (i === playerIdx);
    const x = isPlayer ? gameState.player.x : FORMATION[i].x;
    const y = isPlayer ? gameState.player.y : FORMATION[i].y;
    const scale = isPlayer ? SCALE_PLAYER : SCALE_PNJ;
    const variant = isPlayer ? selectedCharacter : 'john';
    drawMusician(ctx, x, y, scale, isPlayer, variant);
  }

  // HUD
  document.getElementById('timer').textContent = `Niveau ${gameState.level} - Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
}

// Crowd drawing
function drawCrowd() {
  const b = getBounds();
  drawCrowdRegion(0, 0, CANVAS_W, b.top, 22, 20);
  drawCrowdRegion(0, b.bottom, CANVAS_W, CANVAS_H, 22, 20);
  drawCrowdRegion(0, b.top, b.left, b.bottom, 20, 22);
  drawCrowdRegion(b.right, b.top, CANVAS_W, b.bottom, 20, 22);
}
function drawCrowdRegion(x0, y0, x1, y1, stepX = 18, stepY = 18) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const palette = colors.crowd;
  for (let y = y0 + 8; y < y1 - 6; y += stepY) {
    const offset = ((y / stepY) % 2) * (stepX / 2);
    for (let x = x0 + 8 + offset; x < x1 - 6; x += stepX) {
      const c = palette[(Math.random() * palette.length) | 0];
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, 2 * Math.PI);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x - 3.2, y + 2, 6.4, 1.5);
    }
  }
}

// Character drawing with variants
function drawMusician(ctx, x, y, scale = 1.2, isPlayer = false, variant = 'john') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow
  ctx.beginPath();
  ctx.ellipse(0, 18, 9, 5, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();

  if (variant === 'minik') {
    drawMinik(ctx, isPlayer);
  } else if (variant === 'amelie') {
    drawAmelie(ctx, isPlayer);
  } else {
    drawJohn(ctx, isPlayer);
  }

  ctx.restore();
}

function drawTrumpet(ctx){
  ctx.save();
  const angle = -Math.PI * 0.06;
  ctx.translate(4, -12);
  ctx.rotate(angle);
  ctx.fillStyle = colors.trumpetShadow;
  ctx.fillRect(0, -1, 18, 2);
  ctx.fillStyle = colors.trumpetBrass;
  ctx.fillRect(6, -2, 3, 4);
  const grd = ctx.createRadialGradient(22, 0, 1, 22, 0, 6);
  grd.addColorStop(0, "#fff2a8");
  grd.addColorStop(0.6, colors.trumpetBrass);
  grd.addColorStop(1, colors.trumpetShadow);
  ctx.beginPath();
  ctx.ellipse(22, 0, 6, 4, 0, 0, 2*Math.PI);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.restore();
}

function baseFeetAndLegs(ctx){
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 18);
  ctx.closePath();
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-2, 18, 2.1, 1.2, 0, 0, 2 * Math.PI);
  ctx.ellipse(2, 18, 2.1, 1.2, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#111";
  ctx.fill();
}

function drawJohn(ctx, isPlayer){
  baseFeetAndLegs(ctx);

  // Jacket
  ctx.beginPath();
  ctx.moveTo(-7.5, -8);
  ctx.lineTo(-3.2, 8);
  ctx.lineTo(3.2, 8);
  ctx.lineTo(7.5, -8);
  ctx.lineTo(0, -12.5);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#d00";
  ctx.fill();

  // Lapel
  ctx.beginPath();
  ctx.moveTo(-2.2, -9.5);
  ctx.lineTo(2.2, -9.5);
  ctx.lineTo(0, -12.5);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Shoulders
  ctx.beginPath();
  ctx.moveTo(-7.5, -8);
  ctx.lineTo(-10.5, -3);
  ctx.lineTo(-7.5, 3);
  ctx.lineTo(-5.5, -6);
  ctx.closePath();
  ctx.moveTo(7.5, -8);
  ctx.lineTo(10.5, -3);
  ctx.lineTo(7.5, 3);
  ctx.lineTo(5.5, -6);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(0, -14, 5.2, 0, 2 * Math.PI);
  ctx.fillStyle = "#fbe2b6";
  ctx.fill();

  // Hat
  ctx.beginPath();
  ctx.ellipse(0, -18.5, 6.4, 3.2, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-4.2, -28.5, 8.4, 10.5);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-4.2, -22.4, 8.4, 2.2);
  ctx.fillStyle = "#d00";
  ctx.fillRect(-4.2, -28.5, 8.4, 2.2);

  // Instrument detail
  ctx.fillStyle = "#fff";
  ctx.fillRect(-1.2, -5, 2.4, 9.5);

  // Trumpet with bell
  drawTrumpet(ctx);
}

function drawMinik(ctx, isPlayer){
  // Heavier body
  baseFeetAndLegs(ctx);

  // Big belly jacket (blue)
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.quadraticCurveTo(-14, 4, -6, 10);
  ctx.lineTo(6, 10);
  ctx.quadraticCurveTo(14, 4, 10, -6);
  ctx.lineTo(0, -14);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#2a63d4";
  ctx.fill();

  // Head larger
  ctx.beginPath();
  ctx.arc(0, -15, 6.2, 0, 2 * Math.PI);
  ctx.fillStyle = "#f2d2a9";
  ctx.fill();

  // Helmet-like hat
  ctx.beginPath();
  ctx.ellipse(0, -19.5, 7.5, 3.6, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#eaeaea";
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(-5, -24, 10, 2);

  // Trumpet
  drawTrumpet(ctx);
}

function drawAmelie(ctx, isPlayer){
  baseFeetAndLegs(ctx);

  // Orange dress
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-12, 8);
  ctx.lineTo(12, 8);
  ctx.lineTo(8, -6);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#ff7f1f";
  ctx.fill();

  // Collar
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.lineTo(3, -9);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(0, -14, 5.0, 0, 2 * Math.PI);
  ctx.fillStyle = "#f7d8b8";
  ctx.fill();

  // Witch hat
  ctx.beginPath(); // brim
  ctx.ellipse(0, -18, 8.5, 3.2, 0, 0, 2*Math.PI);
  ctx.fillStyle = "#252525";
  ctx.fill();
  ctx.beginPath(); // cone
  ctx.moveTo(0, -30);
  ctx.lineTo(-4.5, -18);
  ctx.lineTo(4.5, -18);
  ctx.closePath();
  ctx.fillStyle = "#1d1d1d";
  ctx.fill();

  // Trumpet
  drawTrumpet(ctx);
}

// Selection preview canvases
function drawCharacterPreviews(){
  const canvases = document.querySelectorAll('.char-canvas');
  canvases.forEach(cv => {
    const c = cv.getContext('2d');
    c.clearRect(0,0,cv.width,cv.height);
    c.save();
    c.translate(cv.width/2, cv.height/2);
    c.scale(1.25, 1.25);
    const who = cv.dataset.char || 'john';
    if (who === 'minik') drawMinik(c, false);
    else if (who === 'amelie') drawAmelie(c, false);
    else drawJohn(c, false);
    c.restore();
  });
}

// Zone check by FEET
function isPlayerInZone() {
  const idx = gameState.playerIdx;
  const zoneX = FORMATION[idx].x;
  const zoneY = FORMATION[idx].y + FOOT_OFFSET * SCALE_PNJ; // slot feet (PNJ scale)
  const playerFootX = gameState.player.x;
  const playerFootY = gameState.player.y + FOOT_OFFSET * SCALE_PLAYER;
  const dx = playerFootX - zoneX;
  const dy = playerFootY - zoneY;
  return (dx*dx + dy*dy) < (ZONE_RADIUS*ZONE_RADIUS);
}

// Level chaining (no pause)
function completeLevel() {
  gameState.level++;
  showBanner("Bravo, on continue la cohésion jusqu'au bout!");
  // reset timer
  gameState.player.outZoneMs = 0;
  // re-center player to its slot origin (does not auto-follow)
  const center = FORMATION[gameState.playerIdx];
  gameState.player.x = center.x;
  gameState.player.y = center.y;

  initLevel(gameState.level);
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function endGame() {
  gameState.running = false;
  showOverlay("T'es une terrine!", "Recommencer");
}
