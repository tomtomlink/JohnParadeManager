// John Parade Manager - Base Game Logic

const CANVAS_W = 360, CANVAS_H = 600;
const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = []; // Will be filled as a grid
const MUSICIAN_SIZE = 32; // pixels (sprite design scale)
const PNJ_RADIUS = 12; // rayon de "sécurité" visuel pour PNJ
const ZONE_RADIUS = 22; // pixels, zone jaune du joueur
const MOVE_DURATION = 2000; // ms for each move (base)
const PREVIEW_ARROW_MS = 800; // show arrow before move
const MAX_OUT_ZONE_MS = 5000; // 5 seconds
const MIN_DIST = 26; // distance min entre PNJ (peuvent se frôler mais pas se toucher)

// Délimitation de la zone de jeu (rectangle central sur la pelouse)
const PAD_LR = 50;   // marges gauche/droite
const PAD_TOP = 90;  // marge haute
const PAD_BOTTOM = 60; // marge basse

const colors = {
  pelouse: ["#52b06d", "#2e944b", "#b1e2b3"],
  pelouseDark: "#3c8b55",
  line: "#f6f6f6",
  zone: "rgba(255,255,0,0.28)",
  crowd: ["#c57b57","#e0b089","#a06c49","#8aa4c8","#d7a1a7","#9b9b9b"],
};

let canvas, ctx, gameState = null, assets = {};
let playerTarget = {x: 0, y: 0}; // Pour suivi fluide
let musicAudio = null; // Pour la musique

// Helpers bounds
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
  // Canvas haute résolution (retina) pour des sprites plus nets
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
    moveDuration: MOVE_DURATION,
    currentMove: 0,
    nextArrow: true,
    moveStart: performance.now() + PREVIEW_ARROW_MS,
    moves: []
  };
  // Cible initiale clamped dans la zone de jeu
  playerTarget = clampIntoBounds({x: FORMATION[12].x, y: FORMATION[12].y}, 30);

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
  let centerX = (getBounds().left + getBounds().right) / 2;
  let startY = clamp(PAD_TOP + 40, PAD_TOP + 40, CANVAS_H - PAD_BOTTOM - 40);
  let spacing = 40;
  for (let row=0; row<ROWS; row++) {
    for (let col=0; col<COLS; col++) {
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = startY + row*spacing;
      let clamped = clampIntoBounds({x,y}, PNJ_RADIUS);
      FORMATION.push(clamped);
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
      // À partir du niveau 2 : chorégraphies individuelles (cercle, spirale, étoile)
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

  // Vitesse de déplacement : accélère plus fort à chaque niveau (expo), mini 250ms
  const SPEEDUP = 0.68;
  gameState.moveDuration = Math.max(250, MOVE_DURATION * Math.pow(SPEEDUP, level-1));
}

// Ajuste les cibles pour éviter les collisions et rester dans les limites
function resolveTargets(fromPositions, targetPositions) {
  const N = targetPositions.length;
  let newPos = targetPositions.map(p => ({x: p.x, y: p.y}));

  // 1) Clamp initial vers les bords (avec marge variable)
  for (let i = 0; i < N; i++) {
    const margin = (i === gameState.playerIdx) ? ZONE_RADIUS : PNJ_RADIUS;
    newPos[i] = clampIntoBounds(newPos[i], margin);
  }

  // 2) Itérations de séparation des PNJ trop proches + re-clamp
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
          // Déplace équitablement
          newPos[i].x -= nx * push; newPos[i].y -= ny * push;
          newPos[j].x += nx * push; newPos[j].y += ny * push;
          // Re-clamp après déplacement
          newPos[i] = clampIntoBounds(newPos[i], (i===gameState.playerIdx)? ZONE_RADIUS : PNJ_RADIUS);
          newPos[j] = clampIntoBounds(newPos[j], (j===gameState.playerIdx)? ZONE_RADIUS : PNJ_RADIUS);
        }
      }
    }
    iter++;
  }

  // 3) Retour
  return newPos;
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

      const movesStep = gameState.moves[gameState.currentMove];

      // Cibles brutes
      const rawTargets = FORMATION.map((m, i) => ({
        x: m.x + movesStep[i].dx,
        y: m.y + movesStep[i].dy
      }));

      // Ajustement collisions + limites
      const adjustedTargets = resolveTargets(gameState.moveFrom, rawTargets);
      gameState.moveTo = adjustedTargets;

      gameState.playerFrom = {x: gameState.player.x, y: gameState.player.y};
      // Delta réel appliqué au slot du joueur (après ajustement)
      const iP = gameState.playerIdx;
      const dpx = adjustedTargets[iP].x - gameState.moveFrom[iP].x;
      const dpy = adjustedTargets[iP].y - gameState.moveFrom[iP].y;
      gameState.playerTo = {
        x: gameState.player.x + dpx,
        y: gameState.player.y + dpy
      };

      // Déplace aussi la cible, clamp dans la zone
      const newTarget = { x: playerTarget.x + dpx, y: playerTarget.y + dpy };
      Object.assign(playerTarget, clampIntoBounds(newTarget, 30));
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

      // Verrouille positions finales (déjà dans la zone)
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
  const FOLLOW_SPEED = 0.2; // un peu plus réactif
  // Clamp target avant d'aller vers lui
  Object.assign(playerTarget, clampIntoBounds(playerTarget, 30));
  gameState.player.x += (playerTarget.x - gameState.player.x) * FOLLOW_SPEED;
  gameState.player.y += (playerTarget.y - gameState.player.y) * FOLLOW_SPEED;
  // Clamp position joueur au cas où
  const clampedPlayer = clampIntoBounds({x: gameState.player.x, y: gameState.player.y}, 30);
  gameState.player.x = clampedPlayer.x;
  gameState.player.y = clampedPlayer.y;

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
  // Fond pelouse
  ctx.fillStyle = colors.pelouse[0];
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Zone de jeu (rectangulaire) bien délimitée
  const b = getBounds();

  // Pelouse plus sombre en dehors de la zone de jeu
  ctx.fillStyle = colors.pelouseDark;
  // Haut
  ctx.fillRect(0, 0, CANVAS_W, b.top);
  // Bas
  ctx.fillRect(0, b.bottom, CANVAS_W, CANVAS_H - b.bottom);
  // Gauche
  ctx.fillRect(0, b.top, b.left, b.bottom - b.top);
  // Droite
  ctx.fillRect(b.right, b.top, CANVAS_W - b.right, b.bottom - b.top);

  // Lignes blanches du terrain
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

  // Public autour de la zone de jeu
  drawCrowd();

  // Zone jaune du slot du joueur (ne sort jamais car FORMATION est clampé)
  const playerIdx = gameState.playerIdx;
  ctx.beginPath();
  ctx.arc(FORMATION[playerIdx].x, FORMATION[playerIdx].y, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone;
  ctx.fill();

  // Dessin des musiciens (sprites plus "grands" => meilleur rendu visuel)
  for (let i=0; i<FORMATION.length; i++) {
    if (i === playerIdx) {
      drawMusician(ctx, gameState.player.x, gameState.player.y, 1.3, true);
    } else {
      drawMusician(ctx, FORMATION[i].x, FORMATION[i].y, 1.2, false);
    }
  }

  document.getElementById('timer').textContent = `Niveau ${gameState.level} - Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  document.getElementById('score').textContent = `Score: ${gameState.score}`;
}

function drawMusician(ctx, x, y, scale = 1.2, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre
  ctx.beginPath();
  ctx.ellipse(0, 18, 8, 4, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  // Corps
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 18);
  ctx.closePath();
  ctx.fillStyle = "#222";
  ctx.fill();

  // Pieds
  ctx.beginPath();
  ctx.ellipse(-2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.ellipse(2, 18, 2, 1, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#111";
  ctx.fill();

  // Veste
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo(-3, 8);
  ctx.lineTo(3, 8);
  ctx.lineTo(7, -8);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#d00";
  ctx.fill();

  // Revers
  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.lineTo(2, -9);
  ctx.lineTo(0, -12);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Épaules
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

  // Chapeau
  ctx.beginPath();
  ctx.ellipse(0, -18, 6, 3, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-4, -28, 8, 10);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Details chapeau
  ctx.fillStyle = "#111";
  ctx.fillRect(-4, -22, 8, 2);
  ctx.fillStyle = "#d00";
  ctx.fillRect(-4, -28, 8, 2);

  // Instrument (détail)
  ctx.fillStyle = "#fff";
  ctx.fillRect(-1, -5, 2, 9);

  ctx.restore();
}

// Dessine le public autour de la zone de jeu
function drawCrowd() {
  const b = getBounds();
  // Définir 4 bandes: haut, bas, gauche, droite
  drawCrowdRegion(0, 0, CANVAS_W, b.top, 12, 10); // haut
  drawCrowdRegion(0, b.bottom, CANVAS_W, CANVAS_H, 12, 10); // bas
  drawCrowdRegion(0, b.top, b.left, b.bottom, 10, 12); // gauche
  drawCrowdRegion(b.right, b.top, CANVAS_W, b.bottom, 10, 12); // droite
}

function drawCrowdRegion(x0, y0, x1, y1, stepX = 12, stepY = 12) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const colorsCrowd = colors.crowd;

  for (let y = y0 + 6; y < y1 - 4; y += stepY) {
    // Décalage pour effet de foule
    const offset = ((y / stepY) % 2) * (stepX / 2);
    for (let x = x0 + 6 + offset; x < x1 - 4; x += stepX) {
      const c = colorsCrowd[(Math.random() * colorsCrowd.length) | 0];
      // Tête
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = c;
      ctx.fill();
      // Épaules
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(x - 2.8, y + 2.2, 5.6, 1.5);
    }
  }
}

// --- SUIVI FLUIDE DU CURSEUR/DOIGT ---
function handlePointer(e) {
  e.preventDefault?.();
  let rect = canvas.getBoundingClientRect();
  let x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  let y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  const clamped = clampIntoBounds({x, y}, 30);
  playerTarget.x = clamped.x;
  playerTarget.y = clamped.y;
}

function isPlayerInZone() {
  let idx = gameState.playerIdx;
  let px = FORMATION[idx].x, py = FORMATION[idx].y;
  let dx = gameState.player.x - px, dy = gameState.player.y - py;
  return (dx*dx + dy*dy) < (ZONE_RADIUS*ZONE_RADIUS);
}

function showArrow(move) {
  // (optionnel) affichage d'une flèche directionnelle sur le canvas
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
    const center = FORMATION[gameState.playerIdx];
    gameState.player.x = center.x;
    gameState.player.y = center.y;
    playerTarget.x = center.x;
    playerTarget.y = center.y;
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
