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

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  document.getElementById('play-btn').onclick = startGame;
  // "Sélection du musicien" désactivé pour l'instant

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

function resizeCanvas() {
  // portrait, width = 360, height = 600 (scalable)
  // (future: adapt to devicePixelRatio for sharper rendering)
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
}

function startGame() {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-container').style.display = 'flex';
  initFormation();
  gameState = {
    playerIdx: 12, // centre, pour l'instant
    player: {x: 0, y: 0, outZoneMs: 0},
    moveIdx: 0,
    level: 1,
    arrows: [],
    timer: 0,
    score: 0,
    running: true
  };
  initLevel(gameState.level);
  gameLoop();
  canvas.addEventListener('pointerdown', handlePointer, {passive: false});
  canvas.addEventListener('pointermove', handlePointer, {passive: false});
  canvas.addEventListener('pointerup', handlePointer, {passive: false});
}

// Génère la formation en losange (5x5)
function initFormation() {
  FORMATION.length = 0;
  let centerX = CANVAS_W/2, startY = 130;
  let spacing = 40;
  for (let row=0; row<ROWS; row++) {
    for (let col=0; col<COLS; col++) {
      // losange centré
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = startY + row*spacing;
      FORMATION.push({x, y});
    }
  }
}

// Génère les déplacements (pour le niveau)
function initLevel(level) {
  // Ex : droite, bas, gauche, haut...
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
}

function gameLoop() {
  if (!gameState.running) return;

  update();
  render();

  requestAnimationFrame(gameLoop);
}

function update() {
  // Gestion du mouvement de formation
  let now = performance.now();
  if (gameState.currentMove < gameState.moves.length) {
    if (gameState.nextArrow && now > gameState.moveStart - PREVIEW_ARROW_MS) {
      // Affiche la flèche de direction
      showArrow(gameState.moves[gameState.currentMove]);
      gameState.nextArrow = false;
    }
    if (now > gameState.moveStart) {
      // Déplacement de la formation
      for (let i = 0; i < FORMATION.length; i++) {
        FORMATION[i].x += gameState.moves[gameState.currentMove].dx;
        FORMATION[i].y += gameState.moves[gameState.currentMove].dy;
      }
      // Maj du joueur aussi
      gameState.player.x += gameState.moves[gameState.currentMove].dx;
      gameState.player.y += gameState.moves[gameState.currentMove].dy;
      gameState.currentMove++;
      gameState.moveStart = now + MOVE_DURATION;
      gameState.nextArrow = true;
    }
  }
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
  // Pelouse
  ctx.fillStyle = colors.pelouse[0];
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // Lignes
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50,0); ctx.lineTo(50,canvas.height);
  ctx.moveTo(canvas.width-50,0); ctx.lineTo(canvas.width-50,canvas.height);
  ctx.stroke();

  // Zone à suivre
  let playerIdx = gameState.playerIdx;
  ctx.beginPath();
  ctx.arc(FORMATION[playerIdx].x, FORMATION[playerIdx].y, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone;
  ctx.fill();

  // Musiciens (25)
  for (let i=0; i<FORMATION.length; i++) {
    drawMusician(ctx, FORMATION[i].x, FORMATION[i].y, 1.1, i === playerIdx);
  }

  // Score/timer
  document.getElementById('timer').textContent = `Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
}

// Nouveau rendu : Musicien style fidèle à l'image PNG
function drawMusician(ctx, x, y, scale = 1, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre
  ctx.beginPath();
  ctx.ellipse(0, 18, 8, 4, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  // Pantalon noir (triangle)
  ctx.beginPath();
  ctx.moveTo(-5, 0); // gauche
  ctx.lineTo(5, 0);  // droite
  ctx.lineTo(0, 18); // bas
  ctx.closePath();
  ctx.fillStyle = "#222";
  ctx.fill();

  // Chaussures
  ctx.beginPath();
  ctx.ellipse(-2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.ellipse(2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#111";
  ctx.fill();

  // Veste rouge
  ctx.beginPath();
  ctx.moveTo(-7, -8); // épaule gauche
  ctx.lineTo(-3, 8);  // taille gauche
  ctx.lineTo(3, 8);   // taille droite
  ctx.lineTo(7, -8);  // épaule droite
  ctx.lineTo(0, -12); // col
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#d00";
  ctx.fill();

  // Col blanc
  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.lineTo(2, -9);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Manches blanches
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

  // Tête
  ctx.beginPath();
  ctx.arc(0, -14, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#fbe2b6";
  ctx.fill();

  // Chapeau haut de forme (blanc)
  ctx.beginPath();
  ctx.ellipse(0, -18, 6, 3, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-4, -28, 8, 10);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Bandeau noir du chapeau
  ctx.fillStyle = "#111";
  ctx.fillRect(-4, -22, 8, 2);

  // Liseré rouge haut chapeau
  ctx.fillStyle = "#d00";
  ctx.fillRect(-4, -28, 8, 2);

  // Détail bouton veste
  ctx.fillStyle = "#fff";
  ctx.fillRect(-1, -5, 2, 9);

  ctx.restore();
}

// Contrôle du musicien (touch/mouse)
function handlePointer(e) {
  e.preventDefault();
  let rect = canvas.getBoundingClientRect();
  let x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  let y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  gameState.player.x = x;
  gameState.player.y = y;
  // On n'autorise pas de sortir de la pelouse
  gameState.player.x = Math.max(30, Math.min(CANVAS_W-30, gameState.player.x));
  gameState.player.y = Math.max(30, Math.min(CANVAS_H-30, gameState.player.y));
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
