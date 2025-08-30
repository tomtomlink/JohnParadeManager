// John Parade Manager – gestion menus: sélection musicien masque le menu principal, retour auto avec logo choisi

let CANVAS_W = 360, CANVAS_H = 640;

const MUSICIANS = 25;
const ROWS = 5, COLS = 5;
const FORMATION = [];
const PNJ_RADIUS = 12;
const ZONE_RADIUS = 22;
const FOOT_OFFSET = 18;
const SCALE_PLAYER = 1.35;
const SCALE_PNJ = 1.25;

const MOVE_DURATION_BASE = 2000;
const MAX_OUT_ZONE_MS = 5000;
const MIN_DIST = 26;

let PAD_LR = 22;
let PAD_TOP = 40;
let PAD_BOTTOM = 32;

const colors = {
  pelouse: ["#52b06d", "#2e944b", "#b1e2b3"],
  pelouseDark: "#3c8b55",
  line: "rgba(255,255,255,0.8)",
  zone: "rgba(255,255,0,0.28)",
  crowd: ["#c57b57","#e0b089","#a06c49","#8aa4c8","#d7a1a7","#9b9b9b"],
  trumpetBrass: "#D4AF37",
  trumpetShadow: "#b08f2d"
};

let canvas, ctx, gameState = null;
let musicAudio = null;
let selectedCharacter = 'john';
let isDragging = false;

window.onload = () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d', { alpha: false });

  const playBtn = document.getElementById('play-btn');
  const selectBtn = document.getElementById('select-btn');
  const closeSelect = document.getElementById('close-select');
  const modal = document.getElementById('select-modal');
  const mainMenu = document.getElementById('main-menu');

  // Ajoute un canvas logo dans le bouton sélection si pas déjà présent
  let charLogo = document.createElement('canvas');
  charLogo.width = 28; charLogo.height = 28;
  charLogo.style.verticalAlign = 'middle';
  charLogo.style.marginRight = '8px';
  charLogo.style.borderRadius = '7px';
  charLogo.className = 'char-btn-logo';
  if (!selectBtn.querySelector('.char-btn-logo')) {
    selectBtn.prepend(charLogo);
  }

  function updateCharLogo() {
    const c = charLogo.getContext('2d');
    c.clearRect(0,0,28,28);
    // fond pelouse
    const pat = makeGrassPattern(c);
    c.save(); c.fillStyle = pat; c.fillRect(0,0,28,28); c.restore();
    c.save();
    c.translate(14, 15);
    c.scale(0.28, 0.28);
    if (selectedCharacter==='minik') drawMinik(c,false);
    else if (selectedCharacter==='amelie') drawAmelie(c,false);
    else drawJohn(c,false);
    c.restore();
  }
  updateCharLogo();

  modal.setAttribute('aria-hidden','true');
  modal.style.display = 'none';
  drawCharacterPreviews();

  playBtn.onclick = startGame;

  // Quand on clique sur sélection, cache le main-menu et montre la modale
  selectBtn.addEventListener('click', () => {
    mainMenu.style.display = 'none';
    modal.setAttribute('aria-hidden','false');
    modal.style.display = 'flex';
    drawCharacterPreviews();
  });

  // Fermer la modale = retour au menu principal
  closeSelect.addEventListener('click', () => {
    modal.setAttribute('aria-hidden','true');
    modal.style.display = 'none';
    mainMenu.style.display = '';
  });

  modal.addEventListener('click', (e) => { 
    if (e.target === modal) {
      modal.setAttribute('aria-hidden','true');
      modal.style.display='none';
      mainMenu.style.display = '';
    }
  });

  // Quand on clique sur un musicien
  document.querySelectorAll('.char-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedCharacter = btn.dataset.char || 'john';
      // Mets à jour le bouton sélection avec le logo
      updateCharLogo();
      selectBtn.querySelector('.char-btn-logo').style.display = '';
      selectBtn.childNodes[selectBtn.childNodes.length-1].nodeValue = `Musicien: ${selectedCharacter.charAt(0).toUpperCase()+selectedCharacter.slice(1)}`;
      // Ferme la modale et retourne au menu principal
      modal.setAttribute('aria-hidden','true');
      modal.style.display='none';
      mainMenu.style.display = '';
    });
  });

  musicAudio = new Audio('music.mp3'); musicAudio.loop = true;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
};

function getBounds(){ return { left: PAD_LR, right: CANVAS_W - PAD_LR, top: PAD_TOP, bottom: CANVAS_H - PAD_BOTTOM }; }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function clampIntoBounds(pos, m){ const b=getBounds(); return { x: clamp(pos.x, b.left+m, b.right-m), y: clamp(pos.y, b.top+m, b.bottom-m) }; }
function lerp(a,b,t){ return a + (b-a)*t; }
function lerpPt(p,q,t){ return {x:lerp(p.x,q.x,t), y:lerp(p.y,q.y,t)}; }
function easeInOutCubic(t){ return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }

function showBanner(text, ms=1400){
  const b = document.getElementById('level-banner');
  b.textContent = text;
  b.classList.add('show');
  setTimeout(()=>b.classList.remove('show'), ms);
}

function resizeCanvas(){
  const vw = Math.max(320, Math.min(window.innerWidth, 480));
  const vh = Math.max(560, Math.min(window.innerHeight, 940));
  CANVAS_W = vw; CANVAS_H = vh;

  const scale = CANVAS_W / 360;
  PAD_LR = Math.round(22 * scale);
  PAD_TOP = Math.round(36 * scale);
  PAD_BOTTOM = Math.round(28 * scale);

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';
  canvas.width = Math.round(CANVAS_W * dpr);
  canvas.height = Math.round(CANVAS_H * dpr);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr,dpr);
}

function startGame(){
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-container').style.display = 'flex';

  initFormation();

  gameState = {
    playerIdx: 12,
    player: {x: FORMATION[12].x, y: FORMATION[12].y, outZoneMs: 0},
    level: 1,
    score: 0,
    running: true,

    moves: [],
    currentMove: 0,
    moveStartTime: performance.now(),
    moveDuration: MOVE_DURATION_BASE,
    moveFrom: [],
    moveTo: [],

    graceUntil: performance.now() + 3000, // 3s
    loseActive: false,
    loseBtnRect: {x:0,y:0,w:0,h:0}
  };

  if (musicAudio && musicAudio.paused) { musicAudio.currentTime = 0; musicAudio.play().catch(()=>{}); }

  initLevel(gameState.level);
  gameState.moveFrom = FORMATION.map(p=>({...p}));
  setStepTargets(0);

  // Inputs
  canvas.addEventListener('pointerdown', onPointerDown, {passive:false});
  canvas.addEventListener('pointermove', onPointerMove, {passive:true});
  canvas.addEventListener('pointerup', onPointerUp, {passive:false});
  canvas.addEventListener('pointercancel', onPointerUp, {passive:false});
  canvas.addEventListener('pointerleave', onPointerUp, {passive:false});

  requestAnimationFrame(gameLoop);
}

function initFormation(){
  FORMATION.length = 0;
  const b = getBounds();
  const centerX = (b.left + b.right)/2;
  const topY = b.top + 40;
  const spacing = Math.min(44, (b.right - b.left) / 6.0);
  for (let row=0; row<ROWS; row++){
    for (let col=0; col<COLS; col++){
      let x = centerX + (col-2)*spacing + (Math.abs(row-2)*spacing/2)*(col-2>0?1:-1);
      let y = topY + row*spacing;
      FORMATION.push(clampIntoBounds({x,y}, PNJ_RADIUS));
    }
  }
}

function initLevel(level){
  const endPositions = getLevelFinalShapePositions(level);
  const steps = Math.max(16, 10 + level * 4);
  const SPEEDUP = 0.68;
  gameState.moveDuration = Math.max(220, MOVE_DURATION_BASE * Math.pow(SPEEDUP, level-1));
  gameState.moves = buildSmoothPathMoves(FORMATION.map(p=>({...p})), endPositions, steps, level);
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function buildSmoothPathMoves(startPositions, endPositions, steps, level){
  const path = [];
  const baseAmp = Math.min(12, 6 + level * 1.2);
  const angOffset = Math.PI / 7;
  let prev = startPositions.map(p=>({...p}));

  for (let s=1; s<=steps; s++){
    const t = easeInOutCubic(s/steps);
    const amp = baseAmp * (1 - t);
    const stepTargets = [];

    for (let i=0; i<MUSICIANS; i++){
      const start = startPositions[i], end = endPositions[i];
      let target = lerpPt(start, end, t);
      const vx=end.x-start.x, vy=end.y-start.y, len=Math.hypot(vx,vy)||1;
      const nx=-vy/len, ny=vx/len;
      const swirl = Math.sin(t*Math.PI*2 + i*.33 + angOffset) * amp;
      target.x += nx * swirl; target.y += ny * swirl;
      stepTargets.push(target);
    }

    const adjusted = resolveTargets(prev, stepTargets);
    path.push(adjusted.map((p,i)=>({dx:p.x-prev[i].x, dy:p.y-prev[i].y})));
    prev = adjusted;
  }

  // Snap exact end
  const last = path[path.length-1];
  for (let i=0; i<MUSICIANS; i++){
    const before = {x: prev[i].x - last[i].dx, y: prev[i].y - last[i].dy};
    last[i].dx = endPositions[i].x - before.x;
    last[i].dy = endPositions[i].y - before.y;
  }
  return path;
}

function resolveTargets(fromPositions, targetPositions){
  const N = targetPositions.length;
  let newPos = targetPositions.map(p=>({x:p.x,y:p.y}));
  for (let i=0;i<N;i++){
    newPos[i] = clampIntoBounds(newPos[i], (i===12)? ZONE_RADIUS : PNJ_RADIUS);
  }
  let changed=true, iter=0;
  while(changed && iter<12){
    changed=false;
    for (let i=0;i<N;i++){
      for (let j=i+1;j<N;j++){
        const dx=newPos[j].x-newPos[i].x, dy=newPos[j].y-newPos[i].y;
        const d=Math.hypot(dx,dy);
        if (d<MIN_DIST){
          changed=true;
          const nx=dx/(d||1), ny=dy/(d||1), push=(MIN_DIST-d)/2;
          newPos[i].x-=nx*push; newPos[i].y-=ny*push;
          newPos[j].x+=nx*push; newPos[j].y+=ny*push;
          newPos[i]=clampIntoBounds(newPos[i], (i===12)? ZONE_RADIUS : PNJ_RADIUS);
          newPos[j]=clampIntoBounds(newPos[j], (j===12)? ZONE_RADIUS : PNJ_RADIUS);
        }
      }
    }
    iter++;
  }
  return newPos;
}

function getLevelFinalShapePositions(level){
  const b=getBounds(), cx=(b.left+b.right)/2, cy=(b.top+b.bottom)/2;
  const w=(b.right-b.left), h=(b.bottom-b.top), r=Math.min(w,h)*.36;
  switch(level){
    case 1: return distributeAlongPolyline(diamondVertices(cx,cy,r), MUSICIANS);
    case 2: return pointsOnCircle(cx,cy,r, MUSICIANS);
    case 3: return grid5x5(cx,cy, Math.min(w,h)*.58);
    case 4: return distributeAlongPolyline(starVertices(cx,cy,r*.55,r,-Math.PI/2), MUSICIANS);
    case 5: return distributeAlongPolyline(polygonVertices(cx,cy,3,r,-Math.PI/2), MUSICIANS);
    case 6: return distributeAlongPolyline(polygonVertices(cx,cy,6,r,-Math.PI/2), MUSICIANS);
    case 7: return plusShape(cx,cy,r);
    case 8: return distributeAlongPolyline(polygonVertices(cx,cy,5,r,-Math.PI/2), MUSICIANS);
    case 9: return xShape(cx,cy,r);
    case 10:return distributeAlongPolyline(polygonVertices(cx,cy,8,r,-Math.PI/2), MUSICIANS);
    default:return pointsOnCircle(cx,cy,r, MUSICIANS);
  }
}
function polygonVertices(cx,cy,sides,r,rot=0){ const v=[]; for(let i=0;i<sides;i++){const a=rot+i*2*Math.PI/sides; v.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});} v.push(v[0]); return v; }
function starVertices(cx,cy,innerR,outerR,rot=0,points=5){ const v=[]; for(let i=0;i<points*2;i++){const rr=(i%2===0)?outerR:innerR; const a=rot+i*Math.PI/points; v.push({x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr});} v.push(v[0]); return v; }
function diamondVertices(cx,cy,r){ return [{x:cx,y:cy-r},{x:cx+r,y:cy},{x:cx,y:cy+r},{x:cx-r,y:cy},{x:cx,y:cy-r}] }
function distributeAlongPolyline(verts,count){
  const segs=[]; let total=0;
  for(let i=0;i<verts.length-1;i++){const p=verts[i],q=verts[i+1],len=Math.hypot(q.x-p.x,q.y-p.y); segs.push({p,q,len}); total+=len;}
  const step=total/count, pts=[]; let segIdx=0, segPos=0;
  for(let k=0;k<count;k++){
    const target=k*step;
    while(segIdx<segs.length && target>segPos+segs[segIdx].len){ segPos+=segs[segIdx].len; segIdx++; }
    if (segIdx>=segs.length) pts.push({...segs[segs.length-1].q});
    else { const s=segs[segIdx], t=(target-segPos)/(s.len||1); pts.push(lerpPt(s.p,s.q,t)); }
  }
  return pts.map(p=>clampIntoBounds(p, PNJ_RADIUS));
}
function pointsOnCircle(cx,cy,r,count){ const pts=[]; for(let i=0;i<count;i++){const a=-Math.PI/2+i*2*Math.PI/count; pts.push({x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r});} return pts.map(p=>clampIntoBounds(p, PNJ_RADIUS)); }
function grid5x5(cx,cy,size){ const pts=[]; const step=size/4, sx=cx-size/2, sy=cy-size/2; for(let r=0;r<5;r++){for(let c=0;c<5;c++){pts.push({x:sx+c*step,y:sy+r*step});}} return pts.map(p=>clampIntoBounds(p, PNJ_RADIUS)); }
function plusShape(cx,cy,r){ const pts=[], step=r/4; for(let i=-2;i<=2;i++) pts.push({x:cx,y:cy+i*step}); for(let i=-2;i<=2;i++) if(i!==0) pts.push({x:cx+i*step,y:cy}); while(pts.length<MUSICIANS){const k=pts.length, off=.6+.2*((k%4)-1.5); pts.push({x:cx+off*step,y:cy+off*step});} return pts.slice(0,MUSICIANS).map(p=>clampIntoBounds(p, PNJ_RADIUS)); }
function xShape(cx,cy,r){ const pts=[], step=r/4; for(let i=-2;i<=2;i++) pts.push({x:cx+i*step,y:cy+i*step}); for(let i=-2;i<=2;i++) if(i!==0) pts.push({x:cx+i*step,y:cy-i*step}); while(pts.length<MUSICIANS){pts.push({x:cx+(Math.random()*.5-.25)*step,y:cy+(Math.random()*.5-.25)*step});} return pts.slice(0,MUSICIANS).map(p=>clampIntoBounds(p, PNJ_RADIUS)); }

function setStepTargets(stepIdx){
  const deltas = gameState.moves[stepIdx];
  const rawTargets = gameState.moveFrom.map((p,i)=>({x:p.x+deltas[i].dx, y:p.y+deltas[i].dy}));
  const adjusted = resolveTargets(gameState.moveFrom, rawTargets);
  gameState.moveTo = adjusted;
}

function gameLoop(){
  if (!gameState) return;
  if (gameState.running) update();
  render();
  requestAnimationFrame(gameLoop);
}

function update(){
  const now = performance.now();
  let elapsed = now - gameState.moveStartTime;

  while (elapsed >= gameState.moveDuration){
    for (let i=0;i<FORMATION.length;i++){ FORMATION[i].x = gameState.moveTo[i].x; FORMATION[i].y = gameState.moveTo[i].y; }

    gameState.currentMove++;
    if (gameState.currentMove >= gameState.moves.length){
      completeLevel();
      if (!gameState.running) return;
      gameState.moveFrom = FORMATION.map(p=>({...p}));
      setStepTargets(0);
    } else {
      gameState.moveFrom = FORMATION.map(p=>({...p}));
      setStepTargets(gameState.currentMove);
    }
    gameState.moveStartTime += gameState.moveDuration;
    elapsed = now - gameState.moveStartTime;
  }

  const t = clamp(elapsed / gameState.moveDuration, 0, 1);
  for (let i=0;i<FORMATION.length;i++){
    FORMATION[i].x = lerp(gameState.moveFrom[i].x, gameState.moveTo[i].x, t);
    FORMATION[i].y = lerp(gameState.moveFrom[i].y, gameState.moveTo[i].y, t);
  }

  const inGrace = now < gameState.graceUntil;
  if (!inGrace){
    if (!isPlayerInZone()){
      gameState.player.outZoneMs += 16;
      if (gameState.player.outZoneMs > MAX_OUT_ZONE_MS) endGame();
    } else {
      gameState.player.outZoneMs = 0;
      gameState.score++;
    }
  }
}

// Input: le joueur suit exactement le curseur
function onPointerDown(e){
  e.preventDefault?.();

  if (gameState && gameState.loseActive){
    const pt = getEventPoint(e);
    if (pointInRect(pt.x, pt.y, gameState.loseBtnRect)) {
      restartGame();
      return;
    }
    return;
  }
  isDragging = true;
  setPlayerFromEvent(e);
}
function onPointerMove(e){ if (!isDragging) return; setPlayerFromEvent(e); }
function onPointerUp(e){ isDragging = false; }

function getEventPoint(e){
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return clampIntoBounds({x,y}, 30);
}
function setPlayerFromEvent(e){
  const c = getEventPoint(e);
  gameState.player.x = c.x;
  gameState.player.y = c.y;
}

let grassPattern = null;
function getGrassPattern(){
  if (grassPattern) return grassPattern;
  const off = document.createElement('canvas'); off.width=96; off.height=96;
  const c = off.getContext('2d');
  c.fillStyle='#3a7950'; c.fillRect(0,0,off.width,off.height);
  c.strokeStyle='rgba(255,255,255,0.05)'; c.lineWidth=1;
  for(let y=8;y<off.height;y+=12){ c.beginPath(); c.moveTo(0,y); c.lineTo(off.width,y-2); c.stroke(); }
  for(let i=0;i<450;i++){ const x=Math.random()*off.width, y=Math.random()*off.height, a=.06+Math.random()*.06; c.fillStyle=`rgba(255,255,255,${a})`; c.fillRect(x,y,1,1); }
  grassPattern = ctx.createPattern(off,'repeat'); return grassPattern;
}

/* Pattern pelouse pour les canvases d’aperçu */
function makeGrassPattern(context){
  const off = document.createElement('canvas'); off.width=96; off.height=96;
  const c = off.getContext('2d');
  c.fillStyle='#3a7950'; c.fillRect(0,0,off.width,off.height);
  c.strokeStyle='rgba(255,255,255,0.05)'; c.lineWidth=1;
  for(let y=8;y<off.height;y+=12){ c.beginPath(); c.moveTo(0,y); c.lineTo(off.width,y-2); c.stroke(); }
  for(let i=0;i<450;i++){ const x=Math.random()*off.width, y=Math.random()*off.height, a=.06+Math.random()*.06; c.fillStyle=`rgba(255,255,255,${a})`; c.fillRect(x,y,1,1); }
  return context.createPattern(off,'repeat');
}

function render(){
  // Fond pelouse texturé (plein écran canvas)
  ctx.fillStyle = getGrassPattern();
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  const b=getBounds();

  // Zones “public” assombries autour du terrain
  ctx.fillStyle='rgba(0,0,0,0.18)';
  ctx.fillRect(0,0,CANVAS_W,b.top);
  ctx.fillRect(0,b.bottom,CANVAS_W,CANVAS_H-b.bottom);
  ctx.fillRect(0,b.top,b.left,b.bottom-b.top);
  ctx.fillRect(b.right,b.top,CANVAS_W-b.right,b.bottom-b.top);

  // Lignes du terrain
  ctx.strokeStyle=colors.line;
  ctx.lineWidth=2;
  ctx.strokeRect(b.left,b.top,b.right-b.left,b.bottom-b.top);

  // Foule
  drawCrowd();

  // Zone jaune (aux pieds du slot du joueur)
  const iSlot = (gameState? gameState.playerIdx : 12);
  const zoneX = FORMATION[iSlot].x;
  const zoneY = FORMATION[iSlot].y + FOOT_OFFSET * SCALE_PNJ;
  ctx.beginPath(); ctx.arc(zoneX, zoneY, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone; ctx.fill();

  // Musiciens
  for (let i=0;i<FORMATION.length;i++){
    const isPlayer = (gameState && i===gameState.playerIdx);
    const x = isPlayer ? gameState.player.x : FORMATION[i].x;
    const y = isPlayer ? gameState.player.y : FORMATION[i].y;
    const scale = isPlayer ? SCALE_PLAYER : SCALE_PNJ;
    const variant = isPlayer ? selectedCharacter : 'john';
    drawMusician(ctx, x, y, scale, isPlayer, variant);
  }

  // HUD canvas (bas du terrain, centré)
  drawCanvasHUD();

  // Écran de défaite au centre du terrain
  if (gameState && gameState.loseActive) {
    drawLoseOverlay();
  }
}

// HUD dans le terrain (bas, centré, bold rouge)
function drawCanvasHUD() {
  if (!gameState) return;
  const b = getBounds();
  const cx = (b.left + b.right) / 2;

  const y1 = b.bottom - 28;
  const y2 = y1 + 18;

  const line1 = `Niveau ${gameState.level} - Temps hors zone: ${(gameState.player.outZoneMs/1000).toFixed(2)}s`;
  const line2 = `Score: ${gameState.score}`;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 16px Poppins, system-ui, sans-serif';

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(line1, cx, y1);
  ctx.strokeText(line2, cx, y2);

  ctx.fillStyle = '#ff2d2d';
  ctx.fillText(line1, cx, y1);
  ctx.fillText(line2, cx, y2);
  ctx.restore();
}

// Écran de défaite dans le canvas + bouton Recommencer
function drawLoseOverlay() {
  const b = getBounds();
  const fieldW = b.right - b.left;
  const fieldH = b.bottom - b.top;
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;

  const cardW = Math.min(320, fieldW * 0.8);
  const cardH = 150;
  const cardX = cx - cardW / 2;
  const cardY = cy - cardH / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(b.left, b.top, fieldW, fieldH);

  roundRect(ctx, cardX, cardY, cardW, cardH, 14);
  ctx.fillStyle = '#0f1b13';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 18px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#ff2d2d';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  const msg = "T'es une terrine!";
  ctx.strokeText(msg, cx, cardY + 48);
  ctx.fillText(msg, cx, cardY + 48);

  const btnW = Math.min(200, cardW - 40);
  const btnH = 40;
  const btnX = cx - btnW/2;
  const btnY = cardY + cardH - btnH - 16;

  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
  grad.addColorStop(0, '#2fe38a');
  grad.addColorStop(1, '#1ab56b');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#2fe38a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '800 16px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#072513';
  ctx.fillText('Recommencer', cx, btnY + btnH/2);

  gameState.loseBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}
function pointInRect(x, y, rect){ return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }

/* Foule */
function drawCrowd(){
  const b=getBounds();
  drawCrowdRegion(0,0,CANVAS_W,b.top,22,20);
  drawCrowdRegion(0,b.bottom,CANVAS_W,CANVAS_H,22,20);
  drawCrowdRegion(0,b.top,b.left,b.bottom,20,22);
  drawCrowdRegion(b.right,b.top,CANVAS_W,b.bottom,20,22);
}
function drawCrowdRegion(x0,y0,x1,y1,stepX=18,stepY=18){
  const w=x1-x0, h=y1-y0; if (w<=0 || h<=0) return;
  const palette = colors.crowd;
  for (let y=y0+8; y<y1-6; y+=stepY){
    const offset = ((y/stepY)%2)*(stepX/2);
    for (let x=x0+8+offset; x<x1-6; x+=stepX){
      const c = palette[(Math.random()*palette.length)|0];
      ctx.beginPath(); ctx.arc(x,y,2.1,0,2*Math.PI); ctx.fillStyle=c; ctx.fill();
      ctx.fillStyle="rgba(0,0,0,0.14)"; ctx.fillRect(x-3.2,y+2,6.4,1.5);
    }
  }
}

/* Dessin persos */
function drawMusician(ctx,x,y,scale=1.2,isPlayer=false,variant='john'){
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  ctx.beginPath(); ctx.ellipse(0,18,9,5,0,0,2*Math.PI); ctx.fillStyle="rgba(0,0,0,0.22)"; ctx.fill();

  if (variant==='minik') drawMinik(ctx,isPlayer);
  else if (variant==='amelie') drawAmelie(ctx,isPlayer);
  else drawJohn(ctx,isPlayer);

  ctx.restore();
}
function drawTrumpet(ctx){
  ctx.save();
  const angle = -Math.PI*0.06; ctx.translate(4,-12); ctx.rotate(angle);
  ctx.fillStyle = colors.trumpetShadow; ctx.fillRect(0,-1,18,2);
  ctx.fillStyle = colors.trumpetBrass; ctx.fillRect(6,-2,3,4);
  const grd = ctx.createRadialGradient(22,0,1,22,0,6);
  grd.addColorStop(0,"#fff2a8"); grd.addColorStop(0.6,colors.trumpetBrass); grd.addColorStop(1,colors.trumpetShadow);
  ctx.beginPath(); ctx.ellipse(22,0,6,4,0,0,2*Math.PI); ctx.fillStyle=grd; ctx.fill();
  ctx.restore();
}
function baseFeetAndLegs(ctx){
  ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.lineTo(0,18); ctx.closePath(); ctx.fillStyle="#222"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-2,18,2.1,1.2,0,0,2*Math.PI); ctx.ellipse(2,18,2.1,1.2,0,0,2*Math.PI); ctx.fillStyle="#111"; ctx.fill();
}
function drawJohn(ctx,isPlayer){
  baseFeetAndLegs(ctx);
  ctx.beginPath(); ctx.moveTo(-7.5,-8); ctx.lineTo(-3.2,8); ctx.lineTo(3.2,8); ctx.lineTo(7.5,-8); ctx.lineTo(0,-12.5); ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#d00"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2.2,-9.5); ctx.lineTo(2.2,-9.5); ctx.lineTo(0,-12.5); ctx.closePath(); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-7.5,-8); ctx.lineTo(-10.5,-3); ctx.lineTo(-7.5,3); ctx.lineTo(-5.5,-6); ctx.closePath();
  ctx.moveTo(7.5,-8); ctx.lineTo(10.5,-3); ctx.lineTo(7.5,3); ctx.lineTo(5.5,-6); ctx.closePath(); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath(); ctx.arc(0,-14,5.2,0,2*Math.PI); ctx.fillStyle="#fbe2b6"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,-18.5,6.4,3.2,0,0,2*Math.PI); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath(); ctx.rect(-4.2,-28.5,8.4,10.5); ctx.fillStyle="#fff"; ctx.fill();
  ctx.fillStyle="#111"; ctx.fillRect(-4.2,-22.4,8.4,2.2);
  ctx.fillStyle="#d00"; ctx.fillRect(-4.2,-28.5,8.4,2.2);
  ctx.fillStyle="#fff"; ctx.fillRect(-1.2,-5,2.4,9.5);
  drawTrumpet(ctx);
}
function drawMinik(ctx,isPlayer){
  baseFeetAndLegs(ctx);
  ctx.beginPath(); ctx.moveTo(-10,-6); ctx.quadraticCurveTo(-14,4,-6,10); ctx.lineTo(6,10); ctx.quadraticCurveTo(14,4,10,-6); ctx.lineTo(0,-14); ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#2a63d4"; ctx.fill();
  ctx.beginPath(); ctx.arc(0,-15,6.2,0,2*Math.PI); ctx.fillStyle="#f2d2a9"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,-19.5,7.5,3.6,0,0,2*Math.PI); ctx.fillStyle="#eaeaea"; ctx.fill();
  ctx.fillStyle="#333"; ctx.fillRect(-5,-24,10,2);
  drawTrumpet(ctx);
}
function drawAmelie(ctx,isPlayer){
  baseFeetAndLegs(ctx);
  ctx.beginPath(); ctx.moveTo(-8,-6); ctx.lineTo(-12,8); ctx.lineTo(12,8); ctx.lineTo(8,-6); ctx.lineTo(0,-12); ctx.closePath();
  ctx.fillStyle = isPlayer ? "#FFD700" : "#ff7f1f"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-3,-9); ctx.lineTo(3,-9); ctx.lineTo(0,-12); ctx.closePath(); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath(); ctx.arc(0,-14,5.0,0,2*Math.PI); ctx.fillStyle="#f7d8b8"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,-18,8.5,3.2,0,0,2*Math.PI); ctx.fillStyle="#252525"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,-30); ctx.lineTo(-4.5,-18); ctx.lineTo(4.5,-18); ctx.closePath(); ctx.fillStyle="#1d1d1d"; ctx.fill();
  drawTrumpet(ctx);
}

/* Aperçus avec pelouse */
function drawCharacterPreviews(){
  document.querySelectorAll('.char-canvas').forEach(cv=>{
    const c=cv.getContext('2d');
    c.clearRect(0,0,cv.width,cv.height);

    const pat = makeGrassPattern(c);
    c.save(); c.fillStyle = pat; c.fillRect(0,0,cv.width,cv.height); c.restore();

    c.save();
    c.translate(cv.width/2, cv.height/2);
    c.scale(1.25,1.25);
    const who=cv.dataset.char||'john';
    if (who==='minik') drawMinik(c,false);
    else if (who==='amelie') drawAmelie(c,false);
    else drawJohn(c,false);
    c.restore();
  });
}

/* Zone via les pieds */
function isPlayerInZone(){
  const idx = gameState.playerIdx;
  const zoneX = FORMATION[idx].x;
  const zoneY = FORMATION[idx].y + FOOT_OFFSET * SCALE_PNJ;
  const playerFootX = gameState.player.x;
  const playerFootY = gameState.player.y + FOOT_OFFSET * SCALE_PLAYER;
  const dx = playerFootX - zoneX, dy = playerFootY - zoneY;
  return (dx*dx + dy*dy) < (ZONE_RADIUS*ZONE_RADIUS);
}

function completeLevel(){
  gameState.level++;
  showBanner("Bravo, on continue la cohésion jusqu'au bout!");
  gameState.player.outZoneMs = 0;
  initLevel(gameState.level);
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function endGame(){
  gameState.running = false;
  gameState.loseActive = true;
  if (musicAudio) { try { musicAudio.pause(); } catch(e){} }
}

function restartGame(){ location.reload(); }
