// John Parade Manager - Base Game Logic

const CANVAS_W = 360, CANVAS_H = 600;
const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = []; // Will be filled as a grid
const MUSICIAN_SIZE = 32; // pixels
const ZONE_RADIUS = 22; // pixels, tight fit
const MOVE_DURATION = 2000; // ms for each move (base)
const PREVIEW_ARROW_MS = 1000; // show arrow before move
const MAX_OUT_ZONE_MS = 5000; // 5 seconds

const colors = {
  pelouse: ["#52b06d", "#2e944b", "#b1e2b3"],
  line: "#f6f6f6",
  zone: "rgba(255,255,0,0.25)",
};

let canvas, ctx, gameState = null, assets = {};
let playerTarget = {x: 0, y: 0}; // Pour suivi fluide
let musicAudio = null; // Pour la musique

// Overlay management
function showOverlay(message, buttonText = "Continuer") {
  document.getElementById('overlay-message').textContent = message;
  document.getElementById('overlay-button').textContent = buttonText;
  document.getElementById('game-overlay').style.display = 'flex';
  gameState.running = false; // Pause the game
}

function hideOverlay() {
  document.getElementById('game-overlay').style.display = 'none';
  gameState.running = true; // Resume the game
}

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  document.getElementById('play-btn').onclick = startGame;

  // Préparer la musique
  musicAudio = new Audio('music.mp3');
  musicAudio.loop = true;

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
    playerIdx: 12, // centre
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
    playerTo: {x: 0, y: 0},
    moveDuration: MOVE_DURATION
  };
  playerTarget = {x: FORMATION[12].x, y: FORMATION[12].y};

  // Set up overlay button click handler
  document.getElementById('overlay-button').onclick = handleOverlayClick;

  // Démarrer la musique si elle n'est pas déjà en cours
  if (musicAudio && musicAudio.paused) {
    musicAudio.currentTime = 0;
    musicAudio.play().catch(()=>{});
  }

  initLevel(gameState.level);
  gameLoop();
  canvas.addEventListener('pointerdown', handlePointer, {passive: false});
  canvas.addEventListener('pointermove', handlePointer, {passive: true});
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

// Renvoie un tableau de moves pour chaque PNJ (complexifié à partir du niveau 2)
function initLevel(level) {
  // Base moves: droite, bas, gauche, haut
  const baseMoves = [
    {dx: 35, dy: 0},
    {dx: 0, dy: 35},
    {dx: -35, dy: 0},
    {dx: 0, dy: -35}
  ];
  const diagonalMoves = [
    {dx: 25, dy: 25},
    {dx: -25, dy: 25},
    {dx: 25, dy: -25},
    {dx: -25, dy: -25}
  ];

  gameState.moves = [];
  const numMoves = level + 2;

  for (let step = 0; step < numMoves; step++) {
    if (level < 2) {
      // Tous les PNJ font le même move (choré classique)
      let move;
      if (level <= 3) {
        move = baseMoves[step % baseMoves.length];
      } else if (level <= 6) {
        const allMoves = [...baseMoves];
        if (Math.random() < 0.3) {
          allMoves.push(...diagonalMoves);
        }
        move = allMoves[Math.floor(Math.random() * allMoves.length)];
      } else {
        const allMoves = [...baseMoves, ...diagonalMoves];
        move = allMoves[Math.floor(Math.random() * allMoves.length)];
      }
      gameState.moves.push(Array(FORMATION.length).fill(move));
    } else {
      // À partir du niveau 2 : chaque PNJ a sa propre direction (ex : cercle déformable)
      let movesStep = [];
      let shape = (level < 4) ? "circle" : (level < 7 ? "spiral" : "star");
      for (let i = 0; i < FORMATION.length; i++) {
        let angle = (2 * Math.PI * i) / FORMATION.length + step * 0.5;
        let dist = 28 + (level * 2);
        let dx, dy;
        if (shape === "circle") {
          dx = Math.cos(angle) * dist;
          dy = Math.sin(angle) * dist;
        } else if (shape === "spiral") {
          dx = Math.cos(angle + step * 0.25) * (dist + step * 3);
          dy = Math.sin(angle + step * 0.25) * (dist + step * 3);
        } else { // star
          let r = (i % 2 === 0) ? dist : dist * 1.9;
          dx = Math.cos(angle) * r;
          dy = Math.sin(angle) * r;
        }
        movesStep.push({dx, dy});
      }
      gameState.moves.push(movesStep);
    }
  }

  gameState.currentMove = 0;
  gameState.moveStart = performance.now() + PREVIEW_ARROW_MS;
  gameState.nextArrow = true;
  gameState.animating = false;

  // Vitesse de déplacement : accélère plus fort à chaque niveau
  // Décroissance exponentielle, mini 250ms
  const SPEEDUP = 0.68;
  gameState.moveDuration = Math.max(250, MOVE_DURATION * Math.pow(SPEEDUP, level-1));
}

function gameLoop() {
  if (!gameState.running) return;
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function update() {
  let now = performance.now();

  // Animation formation
  if (!gameState.animating && gameState.currentMove < gameState.moves.length) {
    if (gameState.nextArrow && now > gameState.moveStart - PREVIEW_ARROW_MS) {
      showArrow(gameState.moves[gameState.currentMove]);
      gameState.nextArrow = false;
    }
    if (now > gameState.moveStart) {
      gameState.animating = true;
      gameState.moveStartTime = now;
      gameState.moveFrom = FORMATION.map(m => ({x: m.x, y: m.y}));

      let movesStep = gameState.moves[gameState.currentMove];
      // Mouvement individuel ou collectif
      gameState.moveTo = FORMATION.map((m, i) => ({
        x: m.x + movesStep[i].dx,
        y: m.y + movesStep[i].dy
      }));
      gameState.playerFrom = {x: gameState.player.x, y: gameState.player.y};
      // Player suit le move du slot central
      gameState.playerTo = {
        x: gameState.player.x + movesStep[gameState.playerIdx].dx,
        y: gameState.player.y + movesStep[gameState.playerIdx].dy
      };
      // On déplace aussi la cible pour que le joueur reste "au même endroit relatif"
      playerTarget.x += movesStep[gameState.playerIdx].dx;
      playerTarget.y += movesStep[gameState.playerIdx].dy;
    }
  }

  if (gameState.animating) {
    let p = Math.min(1, (now - gameState.moveStartTime) / gameState.moveDuration);
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

      // Fin du niveau
      if (gameState.currentMove >= gameState.moves.length) {
        completeLevel();
        return;
      }
    }
  }

  // --- SUIVI FLUIDE DU CURSEUR/DOIGT ---
  const FOLLOW_SPEED = 0.18;
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

  document.getElementById('timer').textContent = `Niveau ${gameState.level} - Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
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
  // À compléter : affichage d'une flèche directionnelle sur le canvas si besoin
}

function completeLevel() {
  gameState.running = false;
  if (gameState.level >= 10) {
    showOverlay("Bravo ! Tu as terminé les 10 parades. Clique pour rejouer", "Rejouer");
  } else {
    showOverlay("Bravo! On passe à la prochaine parade", "Continuer");
  }
}

function handleOverlayClick() {
  const overlayMessage = document.getElementById('overlay-message').textContent;
  if (overlayMessage.includes("rejouer") || overlayMessage.includes("terrine")) {
    if (musicAudio) musicAudio.pause();
    hideOverlay();
    location.reload();
  } else {
    gameState.level++;
    hideOverlay();
    // Reset player position to formation center
    gameState.player.x = FORMATION[gameState.playerIdx].x;
    gameState.player.y = FORMATION[gameState.playerIdx].y;
    playerTarget.x = gameState.player.x;
    playerTarget.y = gameState.player.y;
    gameState.player.outZoneMs = 0;
    // Initialize new level
    initLevel(gameState.level);
    // Ensure game loop is running
    if (gameState.running) {
      requestAnimationFrame(gameLoop);
    }
  }
}

function endGame() {
  gameState.running = false;
  showOverlay("T'es une terrine!", "Recommencer");
  if (musicAudio) musicAudio.pause();
}
