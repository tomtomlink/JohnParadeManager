// John Parade Manager - Base Game Logic

const CANVAS_W = 360, CANVAS_H = 600;
const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = []; // Will be filled as a grid
const MUSICIAN_SIZE = 32; // pixels
const ZONE_RADIUS = 22; // pixels, tight fit
const MOVE_DURATION = 2000; // ms for each move
const PREVIEW_ARROW_MS = 1000; // show arrow before move
const MAX_OUT_ZONE_MS = 5000; // 5 seconds

const colors = {
  pelouse: ["#52b06d", "#2e944b", "#b1e2b3"],
  line: "#f6f6f6",
  zone: "rgba(255,255,0,0.25)",
};

let canvas, ctx, gameState = null, assets = {};
let playerTarget = {x: 0, y: 0}; // <-- Ajout pour suivi fluide

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  document.getElementById('play-btn').onclick = startGame;

  // "Sélection du musicien" désactivé pour l'instant

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

function resizeCanvas() {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
}

function startGame() {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-container').style.display = 'flex';
  initFormation();
  gameState = {
    playerIdx: 12, // centre, pour l'instant
    player: {x: FORMATION[12].x, y: FORMATION[12].y, outZoneMs: 0},
    moveIdx: 0,
    level: 1,
    arrows: [],
    timer: 0,
    score: 0,
    running: true,
    animating: false,
    moveStartTime: 0,
    moveFrom: [],
    moveTo: [],
    playerFrom: {x: 0, y: 0},
    playerTo: {x: 0, y: 0}
  };
  playerTarget = {x: FORMATION[12].x, y: FORMATION[12].y}; // Initialisation cible
  initLevel(gameState.level);
  gameLoop();
  canvas.addEventListener('pointerdown', handlePointer, {passive: false});
  canvas.addEventListener('pointermove', handlePointer, {passive: true}); // FLUIDE : déclenché en continu
  canvas.addEventListener('pointerup', handlePointer, {passive: false});
}

// Génère la formation en losange (5x5)
function initFormation() {
  FORMATION.length = 0;
  let centerX = CANVAS_W/2, startY = 130;
  let spacing = 40;
  for (let row=0; row<ROWS; row++) {
    for (let col=0; col<COLS; col++) {
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = startY + row*spacing;
      FORMATION.push({x, y});
    }
  }
}

function initLevel(level) {
  const moves = [
    {dx: 35, dy: 0},
    {dx: 0, dy: 35},
    {dx: -35, dy: 0},
    {dx: 0, dy: -35}
  ];
  gameState.moves = [];
  for (let i = 0; i < level + 2; i++) {
    let move = moves[i % moves.length];
    gameState.moves.push(move);
  }
  gameState.currentMove = 0;
  gameState.moveStart = performance.now() + PREVIEW_ARROW_MS;
  gameState.nextArrow = true;
  gameState.animating = false;
}

function gameLoop() {
  if (!gameState.running) return;
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function update() {
  let now = performance.now();

  // Gestion animation formation
  if (!gameState.animating && gameState.currentMove < gameState.moves.length) {
    if (gameState.nextArrow && now > gameState.moveStart - PREVIEW_ARROW_MS) {
      showArrow(gameState.moves[gameState.currentMove]);
      gameState.nextArrow = false;
    }
    if (now > gameState.moveStart) {
      gameState.animating = true;
      gameState.moveStartTime = now;
      gameState.moveFrom = FORMATION.map(m => ({x: m.x, y: m.y}));
      let move = gameState.moves[gameState.currentMove];
      gameState.moveTo = FORMATION.map(m => ({
        x: m.x + move.dx,
        y: m.y + move.dy
      }));
      gameState.playerFrom = {x: gameState.player.x, y: gameState.player.y};
      gameState.playerTo = {
        x: gameState.player.x + move.dx,
        y: gameState.player.y + move.dy
      };
      // On déplace aussi la cible pour que le joueur reste "au même endroit relatif"
      playerTarget.x += move.dx;
      playerTarget.y += move.dy;
    }
  }

  if (gameState.animating) {
    let p = Math.min(1, (now - gameState.moveStartTime) / MOVE_DURATION);
    for (let i = 0; i < FORMATION.length; i++) {
      FORMATION[i].x = gameState.moveFrom[i].x + (gameState.moveTo[i].x - gameState.moveFrom[i].x) * p;
      FORMATION[i].y = gameState.moveFrom[i].y + (gameState.moveTo[i].y - gameState.moveFrom[i].y) * p;
    }
    gameState.player.x = gameState.playerFrom.x + (gameState.playerTo.x - gameState.playerFrom.x) * p;
    gameState.player.y = gameState.playerFrom.y + (gameState.playerTo.y - gameState.playerFrom.y) * p;
    if (p >= 1) {
      gameState.animating = false;
      gameState.currentMove++;
      gameState.moveStart = now + PREVIEW_ARROW_MS;
      gameState.nextArrow = true;
      for (let i = 0; i < FORMATION.length; i++) {
        FORMATION[i].x = gameState.moveTo[i].x;
        FORMATION[i].y = gameState.moveTo[i].y;
      }
      gameState.player.x = gameState.playerTo.x;
      gameState.player.y = gameState.playerTo.y;
    }
  }

  // --- SUIVI FLUIDE DU CURSEUR/DOIGT ---
  const FOLLOW_SPEED = 0.18; // 0.15~0.2 = feeling naturel, 1 = instantané
  gameState.player.x += (playerTarget.x - gameState.player.x) * FOLLOW_SPEED;
  gameState.player.y += (playerTarget.y - gameState.player.y) * FOLLOW_SPEED;

  // Timer hors zone
  if (!isPlayerInZone()) {
    gameState.player.outZoneMs += 16;
    if (gameState.player.outZoneMs > MAX_OUT_ZONE_MS) {
      endGame();
    }
  } else {
    gameState.player.outZoneMs = 0;
    gameState.score++;
  }
}

function render() {
  ctx.fillStyle = colors.pelouse[0];
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50,0); ctx.lineTo(50,canvas.height);
  ctx.moveTo(canvas.width-50,0); ctx.lineTo(canvas.width-50,canvas.height);
  ctx.stroke();

  let playerIdx = gameState.playerIdx;
  ctx.beginPath();
  ctx.arc(FORMATION[playerIdx].x, FORMATION[playerIdx].y, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone;
  ctx.fill();

  for (let i=0; i<FORMATION.length; i++) {
    // Pour que le "player" suive le curseur, on dessine sa position réelle
    if (i === playerIdx) {
      drawMusician(ctx, gameState.player.x, gameState.player.y, 1.1, true);
    } else {
      drawMusician(ctx, FORMATION[i].x, FORMATION[i].y, 1.1, false);
    }
  }

  document.getElementById('timer').textContent = `Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
}

function drawMusician(ctx, x, y, scale = 1, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(0, 18, 8, 4, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 18);
  ctx.closePath();
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.ellipse(2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#111";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo(-3, 8);
  ctx.lineTo(3, 8);
  ctx.lineTo(7, -8);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#d00";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.lineTo(2, -9);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo(-10, -3);
  ctx.lineTo(-7, 3);
  ctx.lineTo(-5, -6);
  ctx.closePath();
  ctx.moveTo(7, -8);
  ctx.lineTo(10, -3);
  ctx.lineTo(7, 3);
  ctx.lineTo(5, -6);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -14, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#fbe2b6";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -18, 6, 3, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-4, -28, 8, 10);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.fillRect(-4, -22, 8, 2);

  ctx.fillStyle = "#d00";
  ctx.fillRect(-4, -28, 8, 2);

  ctx.fillStyle = "#fff";
  ctx.fillRect(-1, -5, 2, 9);

  ctx.restore();
}

// --- SUIVI FLUIDE DU CURSEUR/DOIGT ---
function handlePointer(e) {
  e.preventDefault?.();
  let rect = canvas.getBoundingClientRect();
  let x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  let y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  playerTarget.x = Math.max(30, Math.min(CANVAS_W-30, x));
  playerTarget.y = Math.max(30, Math.min(CANVAS_H-30, y));
}

function isPlayerInZone() {
  let idx = gameState.playerIdx;
  let px = FORMATION[idx].x, py = FORMATION[idx].y;
  let dx = gameState.player.x - px, dy = gameState.player.y - py;
  return (dx*dx + dy*dy) < (ZONE_RADIUS*ZONE_RADIUS);
}

function showArrow(move) {
  // À compléter : affichage d'une flèche directionnelle sur le canvas
}

function endGame() {
  gameState.running = false;
  alert("Perdu ! Vous avez quitté votre place trop longtemps.");
  location.reload();
}
