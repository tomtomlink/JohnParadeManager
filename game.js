// John Parade Manager - Base Game Logic (mobile portrait optimized, continuous moves, final shapes)

let CANVAS_W = 360, CANVAS_H = 640; // dynamically updated on resize
const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = []; // Will be filled with current positions of PNJ targets
const PNJ_RADIUS = 12; // visual radius for spacing
const ZONE_RADIUS = 22; // yellow zone radius for the player's slot
const MOVE_DURATION_BASE = 2000; // ms per micro-step (base, scaled by level)
const MAX_OUT_ZONE_MS = 5000; // 5 seconds
const MIN_DIST = 26; // minimum distance between PNJ centers (can brush, not overlap)

// Gameplay layout: game area vs crowd area (reduced crowd => larger game zone)
let PAD_LR = 28;   // left/right margins
let PAD_TOP = 56;  // top margin
let PAD_BOTTOM = 38; // bottom margin

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
let playerTarget = {x: 0, y: 0}; // Smooth follow target
let musicAudio = null; // Background music

// Helpers for bounds and geometry
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

// Overlay management
function showOverlay(message, buttonText = "Continuer") {
  document.getElementById('overlay-message').textContent = message;
  document.getElementById('overlay-button').textContent = buttonText;
  document.getElementById('game-overlay').style.display = 'flex';
  if (gameState) gameState.running = false; // Pause
}
function hideOverlay() {
  document.getElementById('game-overlay').style.display = 'none';
  if (gameState) gameState.running = true; // Resume
}

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  document.getElementById('play-btn').onclick = startGame;

  // Prepare music
  musicAudio = new Audio('music.mp3');
  musicAudio.loop = true;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

function resizeCanvas() {
  // Portrait-first responsive sizing for smartphones
  const vw = Math.max(320, Math.min(window.innerWidth, 480));
  const vh = Math.max(560, Math.min(window.innerHeight, 920));
  CANVAS_W = vw;
  CANVAS_H = vh;

  // Scale crowd/game paddings proportionally for larger screens
  const scale = CANVAS_W / 360;
  PAD_LR = Math.round(28 * scale);
  PAD_TOP = Math.round(56 * scale);
  PAD_BOTTOM = Math.round(38 * scale);

  // High-DPI canvas
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
    playerIdx: 12, // center of 5x5
    player: {x: FORMATION[12].x, y: FORMATION[12].y, outZoneMs: 0},
    level: 1,
    score: 0,
    running: true,

    // Continuous animation timeline (no pauses between moves)
    moves: [],         // Array< Array<{dx, dy}> > steps, each an array for all 25 PNJ
    currentMove: 0,
    moveStartTime: performance.now(),
    moveDuration: MOVE_DURATION_BASE, // adjusted by level
    moveFrom: [],      // Positions at start of current step
    moveTo: [],        // Target positions for current step

    // Player tween
    playerFrom: {x: 0, y: 0},
    playerTo: {x: 0, y: 0},
  };
  // Initial target clamped
  playerTarget = clampIntoBounds({x: FORMATION[12].x, y: FORMATION[12].y}, 30);

  // Overlay button
  document.getElementById('overlay-button').onclick = handleOverlayClick;

  // Start music
  if (musicAudio && musicAudio.paused) {
    musicAudio.currentTime = 0;
    musicAudio.play().catch(()=>{});
  }

  initLevel(gameState.level);
  // Set first step "from" and "to"
  gameState.moveFrom = FORMATION.map(p => ({...p}));
  setStepTargets(0);

  gameLoop();
  canvas.addEventListener('pointerdown', handlePointer, {passive: false});
  canvas.addEventListener('pointermove', handlePointer, {passive: true});
  canvas.addEventListener('pointerup', handlePointer, {passive: false});
}

// Initial formation (diamond-like 5x5) centered in game bounds
function initFormation() {
  FORMATION.length = 0;
  const b = getBounds();
  const centerX = (b.left + b.right) / 2;
  const topY = b.top + 40;
  const spacing = Math.min(44, (b.right - b.left) / 6.0); // adapt spacing to width

  for (let row=0; row<ROWS; row++) {
    for (let col=0; col<COLS; col++) {
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = topY + row*spacing;
      let clamped = clampIntoBounds({x,y}, PNJ_RADIUS);
      FORMATION.push(clamped);
    }
  }
}

// Level setup: generate continuous path to a final shape specific to the level
function initLevel(level) {
  // Compute end positions as a geometric shape for this level
  const endPositions = getLevelFinalShapePositions(level);

  // Number of micro-steps to ensure very smooth motion
  const steps = Math.max(16, 10 + level * 4);

  // Continuous motion speed scaling per level (faster on higher levels)
  const SPEEDUP = 0.68;
  gameState.moveDuration = Math.max(220, MOVE_DURATION_BASE * Math.pow(SPEEDUP, level-1));

  // Build moves so that the sum of deltas reaches the end positions
  gameState.moves = buildSmoothPathMoves(FORMATION.map(p=>({...p})), endPositions, steps, level);

  // Reset timeline
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function buildSmoothPathMoves(startPositions, endPositions, steps, level) {
  // Create an array of steps, each step contains 25 deltas
  const path = [];

  // Slight swirl amplitude to avoid straight-line overlap, decays to 0
  const baseAmp = Math.min(12, 6 + level * 1.2);
  const angOffset = Math.PI / 7;

  let prevPositions = startPositions.map(p => ({...p}));
  for (let s = 1; s <= steps; s++) {
    const t = easeInOutCubic(s / steps);
    const amp = baseAmp * (1 - t); // decay
    const stepTargets = [];

    for (let i = 0; i < MUSICIANS; i++) {
      const start = startPositions[i];
      const end = endPositions[i];
      // Base interpolation
      let target = lerpPt(start, end, t);

      // Add a small orthogonal swirl to avoid collision lines
      const vx = end.x - start.x;
      const vy = end.y - start.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = -vy / len, ny = vx / len; // perpendicular
      const swirl = Math.sin(t * Math.PI * 2 + i * 0.33 + angOffset) * amp;
      target.x += nx * swirl;
      target.y += ny * swirl;

      stepTargets.push(target);
    }

    // Adjust for collisions and bounds
    const adjusted = resolveTargets(prevPositions, stepTargets);
    // Construct deltas
    const deltas = adjusted.map((p, i) => ({ dx: p.x - prevPositions[i].x, dy: p.y - prevPositions[i].y }));
    path.push(deltas);
    // Next prev = adjusted
    prevPositions = adjusted;
  }

  // Force the very last adjusted positions to exact end positions (snaps exactly into shape)
  const lastStep = path[path.length - 1];
  for (let i = 0; i < MUSICIANS; i++) {
    const before = { x: prevPositions[i].x - lastStep[i].dx, y: prevPositions[i].y - lastStep[i].dy };
    lastStep[i].dx = endPositions[i].x - before.x;
    lastStep[i].dy = endPositions[i].y - before.y;
  }

  return path;
}

// Adjust target positions to avoid overlap and keep inside bounds
function resolveTargets(fromPositions, targetPositions) {
  const N = targetPositions.length;
  let newPos = targetPositions.map(p => ({x: p.x, y: p.y}));

  // Initial clamp to bounds
  for (let i = 0; i < N; i++) {
    const margin = (i === 12) ? ZONE_RADIUS : PNJ_RADIUS; // player's slot index = 12
    newPos[i] = clampIntoBounds(newPos[i], margin);
  }

  // Iteratively separate close PNJ and re-clamp
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
          // Re-clamp
          newPos[i] = clampIntoBounds(newPos[i], (i===12)? ZONE_RADIUS : PNJ_RADIUS);
          newPos[j] = clampIntoBounds(newPos[j], (j===12)? ZONE_RADIUS : PNJ_RADIUS);
        }
      }
    }
    iter++;
  }

  return newPos;
}

// Define final shape positions for each level (1..10)
function getLevelFinalShapePositions(level) {
  const b = getBounds();
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const w = (b.right - b.left);
  const h = (b.bottom - b.top);
  const radius = Math.min(w, h) * 0.35;

  switch(level) {
    case 1:  // Diamond
      return distributeAlongPolyline(diamondVertices(cx, cy, radius), MUSICIANS);
    case 2:  // Circle
      return pointsOnCircle(cx, cy, radius, MUSICIANS);
    case 3:  // Square (grid 5x5)
      return grid5x5(cx, cy, Math.min(w, h) * 0.55);
    case 4:  // 5-point Star
      return distributeAlongPolyline(starVertices(cx, cy, radius*0.55, radius, -Math.PI/2), MUSICIANS);
    case 5:  // Triangle
      return distributeAlongPolyline(polygonVertices(cx, cy, 3, radius, -Math.PI/2), MUSICIANS);
    case 6:  // Hexagon
      return distributeAlongPolyline(polygonVertices(cx, cy, 6, radius, -Math.PI/2), MUSICIANS);
    case 7:  // Plus (+)
      return plusShape(cx, cy, radius);
    case 8:  // Pentagon
      return distributeAlongPolyline(polygonVertices(cx, cy, 5, radius, -Math.PI/2), MUSICIANS);
    case 9:  // X
      return xShape(cx, cy, radius);
    case 10: // Octagon
      return distributeAlongPolyline(polygonVertices(cx, cy, 8, radius, -Math.PI/2), MUSICIANS);
    default:
      return pointsOnCircle(cx, cy, radius, MUSICIANS);
  }
}

// Geometry helpers to create shape target points
function polygonVertices(cx, cy, sides, r, rot=0) {
  const verts = [];
  for (let i=0; i<sides; i++) {
    const a = rot + i * 2*Math.PI/sides;
    verts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
  }
  verts.push(verts[0]); // close
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
  const verts = [
    {x: cx, y: cy - r},
    {x: cx + r, y: cy},
    {x: cx, y: cy + r},
    {x: cx - r, y: cy},
    {x: cx, y: cy - r}
  ];
  return verts;
}
function distributeAlongPolyline(verts, count) {
  // Compute cumulative length
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
  let distAcc = 0, segIdx = 0, segPos = 0;
  for (let k = 0; k < count; k++) {
    const targetDist = k * step;
    while (segIdx < segs.length && targetDist > segPos + segs[segIdx].len) {
      segPos += segs[segIdx].len;
      segIdx++;
    }
    if (segIdx >= segs.length) {
      pts.push({...segs[segs.length-1].q});
    } else {
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
  const step = size / 4; // 5 points => 4 intervals
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
  // Build 25 points shaped like a plus
  const pts = [];
  const arm = Math.round(MUSICIANS / 5); // distribute on arms
  const step = r / 4;
  // Vertical arm (center column)
  for (let i=-2; i<=2; i++) pts.push({ x: cx, y: cy + i*step });
  // Horizontal arm (center row), skip center already used
  for (let i=-2; i<=2; i++) if (i!==0) pts.push({ x: cx + i*step, y: cy });
  // Fill remaining by adding near-center dots symmetrically
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
  // Diagonal TL->BR
  for (let i=-2; i<=2; i++) pts.push({ x: cx + i*step, y: cy + i*step });
  // Diagonal BL->TR (skip center to avoid duplicate)
  for (let i=-2; i<=2; i++) if (i!==0) pts.push({ x: cx + i*step, y: cy - i*step });
  // Fill remaining near arms
  while (pts.length < MUSICIANS) {
    const i = pts.length;
    pts.push({ x: cx + (Math.random()*0.5-0.25)*step, y: cy + (Math.random()*0.5-0.25)*step });
  }
  return pts.slice(0, MUSICIANS).map(p => clampIntoBounds(p, PNJ_RADIUS));
}

// Prepare targets for a given step index based on gameState.moves
function setStepTargets(stepIdx) {
  const deltas = gameState.moves[stepIdx];
  // Compute moveTo from current moveFrom
  const rawTargets = gameState.moveFrom.map((p, i) => ({ x: p.x + deltas[i].dx, y: p.y + deltas[i].dy }));
  const adjusted = resolveTargets(gameState.moveFrom, rawTargets);
  gameState.moveTo = adjusted;

  // Player tween based on player's slot (index 12)
  const iP = gameState.playerIdx;
  const dpx = adjusted[iP].x - gameState.moveFrom[iP].x;
  const dpy = adjusted[iP].y - gameState.moveFrom[iP].y;
  gameState.playerFrom = { x: gameState.player.x, y: gameState.player.y };
  gameState.playerTo = { x: gameState.player.x + dpx, y: gameState.player.y + dpy };

  // Also shift the smooth target and clamp
  const newTarget = { x: playerTarget.x + dpx, y: playerTarget.y + dpy };
  Object.assign(playerTarget, clampIntoBounds(newTarget, 30));
}

function gameLoop() {
  if (!gameState || !gameState.running) return;
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function update() {
  const now = performance.now();

  // Continuous step tweening without any pauses
  let elapsed = now - gameState.moveStartTime;
  while (elapsed >= gameState.moveDuration) {
    // Finish this step immediately
    for (let i=0; i<FORMATION.length; i++) {
      FORMATION[i].x = gameState.moveTo[i].x;
      FORMATION[i].y = gameState.moveTo[i].y;
    }
    gameState.player.x = gameState.playerTo.x;
    gameState.player.y = gameState.playerTo.y;

    // Advance to next step or complete the level
    gameState.currentMove++;
    if (gameState.currentMove >= gameState.moves.length) {
      completeLevel();
      return;
    }

    // Prepare next step
    gameState.moveFrom = FORMATION.map(p => ({...p}));
    setStepTargets(gameState.currentMove);

    // Consume one duration and continue (to catch up if frame was late)
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

  // Smooth follow for manual control
  const FOLLOW_SPEED = 0.22;
  Object.assign(playerTarget, clampIntoBounds(playerTarget, 30));
  gameState.player.x += (playerTarget.x - gameState.player.x) * FOLLOW_SPEED;
  gameState.player.y += (playerTarget.y - gameState.player.y) * FOLLOW_SPEED;
  // Clamp player hard to bounds
  const clampedPlayer = clampIntoBounds({x: gameState.player.x, y: gameState.player.y}, 30);
  gameState.player.x = clampedPlayer.x;
  gameState.player.y = clampedPlayer.y;

  // Out-of-zone timer/score
  if (!isPlayerInZone()) {
    gameState.player.outZoneMs += 16;
    if (gameState.player.outZoneMs > MAX_OUT_ZONE_MS) endGame();
  } else {
    gameState.player.outZoneMs = 0;
    gameState.score++;
  }
}

function render() {
  // Background grass
  ctx.fillStyle = colors.pelouse[0];
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  // Game area and darker outer grass (crowd area reduced)
  const b = getBounds();

  ctx.fillStyle = colors.pelouseDark;
  // Top
  ctx.fillRect(0, 0, CANVAS_W, b.top);
  // Bottom
  ctx.fillRect(0, b.bottom, CANVAS_W, CANVAS_H - b.bottom);
  // Left
  ctx.fillRect(0, b.top, b.left, b.bottom - b.top);
  // Right
  ctx.fillRect(b.right, b.top, CANVAS_W - b.right, b.bottom - b.top);

  // Outer field lines
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

  // Crowd around (half density vs before)
  drawCrowd();

  // Yellow zone at player's slot position (never leaves bounds)
  const playerIdx = gameState.playerIdx;
  ctx.beginPath();
  ctx.arc(FORMATION[playerIdx].x, FORMATION[playerIdx].y, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone;
  ctx.fill();

  // Draw musicians (higher visual resolution, with trumpets)
  for (let i=0; i<FORMATION.length; i++) {
    if (i === playerIdx) {
      drawMusician(ctx, gameState.player.x, gameState.player.y, 1.35, true);
    } else {
      drawMusician(ctx, FORMATION[i].x, FORMATION[i].y, 1.25, false);
    }
  }

  // HUD
  document.getElementById('timer').textContent = `Niveau ${gameState.level} - Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
}

// Trumpet band character with visible bell ("pavillon")
function drawMusician(ctx, x, y, scale = 1.2, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow
  ctx.beginPath();
  ctx.ellipse(0, 18, 9, 5, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();

  // Legs base
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 18);
  ctx.closePath();
  ctx.fillStyle = "#222";
  ctx.fill();

  // Feet
  ctx.beginPath();
  ctx.ellipse(-2, 18, 2.1, 1.2, 0, 0, 2 * Math.PI);
  ctx.ellipse(2, 18, 2.1, 1.2, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#111";
  ctx.fill();

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
  // Hat stripes
  ctx.fillStyle = "#111";
  ctx.fillRect(-4.2, -22.4, 8.4, 2.2);
  ctx.fillStyle = "#d00";
  ctx.fillRect(-4.2, -28.5, 8.4, 2.2);

  // Trumpet (held to the right, slight upward angle)
  ctx.save();
  const angle = -Math.PI * 0.06; // slight up
  ctx.translate(4, -12); // near mouth
  ctx.rotate(angle);
  // Tube
  ctx.fillStyle = colors.trumpetShadow;
  ctx.fillRect(0, -1, 18, 2);
  // Valve block
  ctx.fillStyle = colors.trumpetBrass;
  ctx.fillRect(6, -2, 3, 4);
  // Bell (pavillon) with gradient
  const grd = ctx.createRadialGradient(22, 0, 1, 22, 0, 6);
  grd.addColorStop(0, "#fff2a8");
  grd.addColorStop(0.6, colors.trumpetBrass);
  grd.addColorStop(1, colors.trumpetShadow);
  ctx.beginPath();
  ctx.ellipse(22, 0, 6, 4, 0, 0, 2*Math.PI);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.restore();

  // Small instrument detail on chest
  ctx.fillStyle = "#fff";
  ctx.fillRect(-1.2, -5, 2.4, 9.5);

  ctx.restore();
}

// Crowd around the game area (reduced thickness/density => "half crowd")
function drawCrowd() {
  const b = getBounds();
  // Regions: top, bottom, left, right
  drawCrowdRegion(0, 0, CANVAS_W, b.top, 20, 18); // top (sparser)
  drawCrowdRegion(0, b.bottom, CANVAS_W, CANVAS_H, 20, 18); // bottom
  drawCrowdRegion(0, b.top, b.left, b.bottom, 18, 20); // left
  drawCrowdRegion(b.right, b.top, CANVAS_W, b.bottom, 18, 20); // right
}
function drawCrowdRegion(x0, y0, x1, y1, stepX = 18, stepY = 18) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const colorsCrowd = colors.crowd;

  for (let y = y0 + 8; y < y1 - 6; y += stepY) {
    const offset = ((y / stepY) % 2) * (stepX / 2);
    for (let x = x0 + 8 + offset; x < x1 - 6; x += stepX) {
      const c = colorsCrowd[(Math.random() * colorsCrowd.length) | 0];
      // Head
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = c;
      ctx.fill();
      // Shoulders
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(x - 3.2, y + 2.2, 6.4, 1.6);
    }
  }
}

// Pointer handling (always allow reaching yellow zone)
function handlePointer(e) {
  e.preventDefault?.();
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  const clamped = clampIntoBounds({x, y}, 30);
  playerTarget.x = clamped.x;
  playerTarget.y = clamped.y;
}

function isPlayerInZone() {
  const idx = gameState.playerIdx;
  const px = FORMATION[idx].x, py = FORMATION[idx].y;
  const dx = gameState.player.x - px, dy = gameState.player.y - py;
  return (dx*dx + dy*dy) < (ZONE_RADIUS*ZONE_RADIUS);
}

function completeLevel() {
  // Snap exactly to final shape (already ensured by last step), then overlay
  gameState.running = false;
  if (gameState.level >= 10) {
    showOverlay("Bravo ! Tu as terminé les 10 parades. Clique pour rejouer", "Rejouer");
  } else {
    showOverlay("Bravo ! Formation atteinte. On passe à la prochaine parade.", "Continuer");
  }
}

function handleOverlayClick() {
  const overlayMessage = document.getElementById('overlay-message').textContent.toLowerCase();
  if (overlayMessage.includes("rejouer") || overlayMessage.includes("terrine")) {
    if (musicAudio) musicAudio.pause();
    hideOverlay();
    location.reload();
  } else {
    // Next level
    gameState.level++;
    hideOverlay();

    // Reset player to center slot
    const center = FORMATION[gameState.playerIdx];
    gameState.player.x = center.x;
    gameState.player.y = center.y;
    playerTarget.x = center.x;
    playerTarget.y = center.y;
    gameState.player.outZoneMs = 0;

    initLevel(gameState.level);
    // Prepare first step
    gameState.moveFrom = FORMATION.map(p => ({...p}));
    setStepTargets(0);
    gameState.moveStartTime = performance.now();
    gameState.running = true;
    requestAnimationFrame(gameLoop);
  }
}

function endGame() {
  gameState.running = false;
  showOverlay("T'es une terrine!", "Recommencer");
  if (musicAudio) musicAudio.pause();
}
