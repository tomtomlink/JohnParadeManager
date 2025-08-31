// John Parade Manager
// - Joystick adouci (deadzone élargie), déplacement joueur
// - Pubs "Prod-S Arena" (bandeau droit texte à 180°)
// - HUD haut modernisé (Niveau + Score)
// - 4 persos jouables (Minik bleu, Amélie orange, Candice poupée; John garde la trompette)
// - Logo image centré, panneau menu responsive, police nette d’inspiration militaire
// - Alerte HORS ZONE: compte à rebours 5→0, ne couvre jamais le cercle; si le cercle est centré, popup en bas
// - Défaite: message aléatoire ("Terrine!", "10 Jours d'arrêt!", "Réformé!")
// - High Score: bouton + fenêtre type borne d’arcade (défilement), scores en localStorage
// - Rendu net (DPR aware) des canvases UI, ajustements mobiles (logo non coupé)
// - Miniature du musicien choisi dans le menu: avatar "tête" net et recadré (correction bug)

// ============================================================================
// Constantes et état
// ============================================================================
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
const MAX_OUT_ZONE_MS = 5000; // 5 secondes de compte à rebours
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
  brass1: "#D4AF37",
  brass2: "#b08f2d",
  brassHi: "#fff2a8",
  adBg: "#0f1b13",
  adStroke: "rgba(255,255,255,0.12)",
  adText: "#e7f0ff"
};

// Couleurs pour John (remplace le rouge par un bleu marine pour PNJ et joueur)
const NAVY = "#0b2249"; // bleu marine
const JOHN_PLAYER_MAIN = NAVY;
const JOHN_NPC_MAIN = NAVY;
const JOHN_ACCENT = NAVY;

// Polices
const MENU_FONT = '"Russo One", system-ui, sans-serif';          // menus
const HUD_TITLE_FONT = '"Black Ops One", system-ui, sans-serif';  // titres HUD / alertes
const HUD_NUM_FONT = '"Teko", system-ui, sans-serif';             // chiffres HUD

let canvas, ctx, gameState = null;
let musicAudio = null;
let selectedCharacter = 'john';

// Joystick (adouci)
const PLAYER_SPEED = 190; // px/s (sensibilité réduite)
const JOY_MARGIN = 14;
const JOY_DEADZONE = 0.22; // zone morte élargie
const JOY_SENS_POW = 1.35; // courbe non-linéaire (>1 = plus doux près du centre)

const INPUT = { hasPointer: false, hasTouch: false, hasMouse: false };

// Fichier du logo principal
const MAIN_LOGO_SRC = 'menu-logo.png';

// High Score UI state
const HS_STORAGE_KEY = 'jpm_highscores';
let hsState = {
  visible: false,
  canvas: null,
  ctx: null,
  lastTS: 0,
  offset: 0,
  speed: 28, // px/sec
  rowH: 34,
  entries: [],
  rafId: null
};

// Options d’envoi au repo (optionnel, si fournis)
function getRepoConfig(){
  const repo = window.GH_REPO || document.querySelector('meta[name="gh-repo"]')?.content || '';
  const token = window.GH_TOKEN || document.querySelector('meta[name="gh-token"]')?.content || '';
  const branch = window.GH_BRANCH || document.querySelector('meta[name="gh-branch"]')?.content || 'main';
  return { repo, token, branch };
}

// ============================================================================
// Boot
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d', { alpha: false });
  canvas.style.touchAction = 'none';
  canvas.style.webkitTapHighlightColor = 'transparent';

  INPUT.hasPointer = 'onpointerdown' in window;
  INPUT.hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints|0) > 0;
  INPUT.hasMouse = 'onmousedown' in window;

  ensureHUDFonts();
  ensureMainLogo();
  setMenuGrassBackground();
  ensureHighScoreUI(); // bouton + modal high score (arcade ticker)

  ensureCandiceCard();

  const playBtn = document.getElementById('play-btn');
  const selectBtn = document.getElementById('select-btn');
  const selectLabel = document.getElementById('select-label');
  const closeSelect = document.getElementById('close-select');
  const modal = document.getElementById('select-modal');
  const mainMenu = document.getElementById('main-menu');

  // Miniature avatar tête dans le bouton de sélection
  ensureCharLogoCanvas();
  updateCharLogo(); // initial

  if (modal){
    modal.setAttribute('aria-hidden','true');
    modal.style.display = 'none';
  }

  // Sélection personnage
  const cards = document.querySelectorAll('.char-card');
  cards.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedCharacter = btn.getAttribute('data-char') || 'john';
      if (selectLabel) {
        const name = selectedCharacter.charAt(0).toUpperCase()+selectedCharacter.slice(1);
        selectLabel.textContent = 'Musicien: ' + name;
      }
      updateCharLogo(); // met à jour l’avatar tête
      if (modal){
        modal.setAttribute('aria-hidden','true');
        modal.style.display='none';
      }
      if (mainMenu) mainMenu.style.display = '';
    });
  });

  drawCharacterPreviews(); // grilles (corps complet)

  if (playBtn){
    playBtn.addEventListener('click', function(e){
      if (e && e.preventDefault) e.preventDefault();
      startGame();
    });
  } else {
    startGame();
  }

  if (selectBtn){
    selectBtn.addEventListener('click', function(e){
      if (e && e.preventDefault) e.preventDefault();
      if (!modal) return;
      if (mainMenu) mainMenu.style.display = 'none';
      modal.setAttribute('aria-hidden','false');
      modal.style.display = 'flex';
      drawCharacterPreviews();
    });
  }

  if (closeSelect){
    closeSelect.addEventListener('click', function(e){
      if (e && e.preventDefault) e.preventDefault();
      if (!modal) return;
      modal.setAttribute('aria-hidden','true');
      modal.style.display = 'none';
      if (mainMenu) mainMenu.style.display = '';
    });
  }

  try {
    musicAudio = new Audio('music.mp3');
    musicAudio.loop = true;
  } catch(_) {}

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    resizeHighScoreCanvas();
    drawCharacterPreviews();
    updateCharLogo();
  });
});

// ============================================================================
// Menu principal: panneau, logo, bouton High Score, styles
// ============================================================================
function ensureMainLogo(){
  const mm = document.getElementById('main-menu');
  if (!mm) return;

  // purges
  const oldCanvas = document.getElementById('title-logo');
  if (oldCanvas && oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
  removeOffensiveText("Edition Tatoo de Merde");
  const maybeTitles = document.querySelectorAll('h1,h2,.app-title,.title');
  maybeTitles.forEach(n=>{
    const t = (n.textContent||'').trim().toLowerCase();
    if (t.includes('john parade manager')) n.style.display = 'none';
  });

  // panneau
  let panel = document.getElementById('menu-panel');
  if (!panel){
    panel = document.createElement('div');
    panel.id = 'menu-panel';
    document.getElementById('main-menu').insertBefore(panel, mm.firstChild || null);
  }

  // logo
  let wrap = document.getElementById('main-logo-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.id = 'main-logo-wrap';
    wrap.className = 'logo-wrap';
    panel.appendChild(wrap);
  } else if (!wrap.parentElement || wrap.parentElement.id !== 'menu-panel'){
    panel.insertBefore(wrap, panel.firstChild || null);
  }

  let img = document.getElementById('main-logo');
  if (!img){
    img = document.createElement('img');
    img.id = 'main-logo';
    img.alt = 'John Parade Manager';
    img.decoding = 'async';
    img.loading = 'eager';
    wrap.appendChild(img);
  }
  img.src = (typeof MAIN_LOGO_SRC !== 'undefined') ? MAIN_LOGO_SRC : 'menu-logo.png';

  // actions
  let actions = document.getElementById('menu-actions');
  if (!actions){
    actions = document.createElement('div');
    actions.id = 'menu-actions';
    actions.className = 'menu-actions';
    panel.appendChild(actions);
  }

  const play = document.getElementById('play-btn');
  const select = document.getElementById('select-btn');
  if (play && play.parentElement !== actions) actions.appendChild(play);
  if (select && select.parentElement !== actions) actions.appendChild(select);

  // bouton High Score
  let hsBtn = document.getElementById('highscore-btn');
  if (!hsBtn){
    hsBtn = document.createElement('button');
    hsBtn.id = 'highscore-btn';
    hsBtn.type = 'button';
    hsBtn.className = 'menu-btn';
    hsBtn.textContent = 'High Score';
    hsBtn.addEventListener('click', (e)=>{ e.preventDefault(); openHighScore(); });
    if (select && select.parentElement === actions){
      if (select.nextSibling) actions.insertBefore(hsBtn, select.nextSibling);
      else actions.appendChild(hsBtn);
    } else {
      actions.appendChild(hsBtn);
    }
  }

  injectMenuLogoStyles();
}

function removeOffensiveText(text){
  if (!text) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const targets = [];
  while (walker.nextNode()){
    const node = walker.currentNode;
    if (node.nodeValue && node.nodeValue.includes(text)){
      targets.push(node);
    }
  }
  targets.forEach(node=>{
    const el = node.parentElement;
    if (!el) return;
    if (el.childNodes.length === 1){
      el.remove();
    } else {
      el.innerHTML = el.innerHTML.replaceAll(text, '');
    }
  });
}

/* Styles: police nette menus + position mobile */
function injectMenuLogoStyles(){
  const STYLE_ID = 'menu-logo-style';
  const prev = document.getElementById(STYLE_ID);
  if (prev) prev.remove();

  const css = `
    :root{
      --menu-font: ${MENU_FONT};
      --menu-text-color: #ffffff;
      --menu-stroke: rgba(0,0,0,0.55);
      --mobile-shift: 12px;
    }

    #main-menu,
    #menu-panel,
    #menu-actions,
    #play-btn, #select-btn, #highscore-btn,
    #select-modal,
    .characters, .char-card, .char-name {
      font-family: var(--menu-font);
      color: var(--menu-text-color);
      -webkit-text-stroke: 0.5px var(--menu-stroke);
      text-shadow: 0 0 0.5px rgba(0,0,0,0.35), 0.5px 0.5px 0 rgba(0,0,0,0.35);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    #main-menu{
      background-color:#3a7950;
      background-repeat:repeat;
      background-size:96px 96px;

      min-height: 100vh;
      min-height: 100dvh;
      min-height: 100svh;

      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;

      padding: 18px 12px 24px;
      padding-top: clamp(18px, env(safe-area-inset-top,0px) + 16px, 56px);

      box-sizing: border-box;
      backface-visibility: hidden;
    }

    #menu-panel{
      width: min(88vw, 560px);
      margin: clamp(10px, env(safe-area-inset-top,0px) + 10px, 40px) auto 6px auto;
      background: rgba(70, 150, 95, 0.26);
      border: 2px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      box-shadow: 0 10px 22px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.14);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    #main-logo-wrap.logo-wrap{
      width: 100%;
      margin: 0;
      padding: 0;
      display: block;
    }
    #main-logo{
      display: block;
      width: 100%;
      height: auto;
      border: none;
      -webkit-mask-image: none !important;
              mask-image: none !important;
      filter: none !important;
    }

    /* Canvas avatar dans le bouton de sélection (rond, net) */
    #select-btn .char-btn-logo{
      display: inline-block;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.25);
      box-shadow: 0 2px 6px rgba(0,0,0,0.25) inset;
      background: transparent;
    }

    #menu-actions.menu-actions{
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
      align-items: center;
      padding: 16px;
      box-sizing: border-box;
    }

    #menu-actions button,
    #play-btn, #select-btn, #highscore-btn {
      appearance: none;
      border: 2px solid rgba(255,255,255,0.22);
      border-radius: 12px;
      background: linear-gradient(#1b2c21, #0e1a14);
      color: var(--menu-text-color);
      -webkit-text-stroke: 0.5px var(--menu-stroke);
      text-shadow: 0 0 0.5px rgba(0,0,0,0.35), 0.5px 0.5px 0 rgba(0,0,0,0.35);
      font-family: var(--menu-font);
      font-weight: 900;
      letter-spacing: 0.5px;
      padding: 10px 14px;
      min-width: 140px;
      cursor: pointer;
      transition: transform .06s ease, box-shadow .06s ease, background .2s ease;
    }
    @media (hover:hover){
      #menu-actions button:hover,
      #play-btn:hover, #select-btn:hover, #highscore-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0,0,0,0.25);
        background: linear-gradient(#223b2d, #13261c);
      }
      #menu-actions button:active,
      #play-btn:active, #select-btn:active, #highscore-btn:active {
        transform: translateY(0px) scale(0.995);
      }
    }

    @media (max-width: 480px), (pointer: coarse){
      #menu-panel{
        margin-top: calc(clamp(16px, env(safe-area-inset-top,0px) + 12px, 48px) + var(--mobile-shift));
      }
      #menu-actions{ padding-top: 20px; }
      #menu-actions button,
      #play-btn, #select-btn, #highscore-btn {
        transform: none !important;
      }
    }

    @media (min-width: 960px){
      #main-menu{ align-items: center; }
      #menu-panel{ width: min(56vw, 720px); }
    }
  `.trim();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function setMenuGrassBackground(){
  const mm = document.getElementById('main-menu');
  if (!mm) return;
  const off = document.createElement('canvas');
  off.width = 96; off.height = 96;
  const c = off.getContext('2d');
  c.fillStyle='#3a7950'; c.fillRect(0,0,off.width,off.height);
  c.strokeStyle='rgba(255,255,255,0.05)'; c.lineWidth=1;
  for(let y=8;y<off.height;y+=12){ c.beginPath(); c.moveTo(0,y); c.lineTo(off.width,y-2); c.stroke(); }
  for(let i=0;i<450;i++){ const x=Math.random()*off.width, y=Math.random()*off.height, a=.06+Math.random()*.06; c.fillStyle=`rgba(255,255,255,${a})`; c.fillRect(x,y,1,1); }
  mm.style.backgroundImage = `url(${off.toDataURL()})`;
}

// ============================================================================
// High Score UI (bouton + modal + ticker façon arcade)
// ============================================================================
function ensureHighScoreUI(){
  // Style
  if (!document.getElementById('highscore-style')){
    const css = `
      #highscore-modal{
        position: fixed; inset: 0; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.45);
        z-index: 9999;
      }
      #highscore-card{
        width: min(92vw, 560px);
        height: min(82vh, 580px);
        background: linear-gradient(#0c1511,#0a130f);
        border: 2px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        box-shadow: 0 18px 28px rgba(0,0,0,0.4);
        display: flex; flex-direction: column; align-items: stretch;
        overflow: hidden;
      }
      #highscore-canvas{
        display: block;
        width: 100%;
        height: auto;
        flex: 1 1 auto;
        background: radial-gradient(ellipse at center, rgba(255,255,255,0.03), rgba(0,0,0,0.0) 60%);
      }
      #highscore-footer{
        display: flex;
        gap: 10px;
        padding: 12px;
        justify-content: center;
      }
      #highscore-close{
        appearance: none;
        border: 2px solid rgba(255,255,255,0.22);
        border-radius: 10px;
        background: linear-gradient(#1b2c21, #0e1a14);
        color: #eaf3ff;
        -webkit-text-stroke: 0.5px rgba(0,0,0,0.55);
        text-shadow: 0.5px 0.5px 0 rgba(0,0,0,0.5);
        font-family: ${MENU_FONT};
        font-weight: 900;
        padding: 8px 14px;
        cursor: pointer;
      }
      #highscore-close:hover{
        background: linear-gradient(#223b2d, #13261c);
      }
    `.trim();
    const style = document.createElement('style');
    style.id = 'highscore-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // DOM
  let modal = document.getElementById('highscore-modal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'highscore-modal';
    modal.setAttribute('aria-hidden','true');

    const card = document.createElement('div');
    card.id = 'highscore-card';

    const canvasHS = document.createElement('canvas');
    canvasHS.id = 'highscore-canvas';
    canvasHS.width = 600;
    canvasHS.height = 480;

    const footer = document.createElement('div');
    footer.id = 'highscore-footer';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'highscore-close';
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', closeHighScore);

    footer.appendChild(closeBtn);
    card.appendChild(canvasHS);
    card.appendChild(footer);
    modal.appendChild(card);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e)=>{
      if (e.target === modal) closeHighScore();
    });
    window.addEventListener('keydown', (e)=>{
      if (hsState.visible && e.key === 'Escape') closeHighScore();
    });

    hsState.canvas = canvasHS;
    hsState.ctx = canvasHS.getContext('2d');

    // Ecoute rafraîchissement live quand un score est enregistré
    window.addEventListener('jpm:score-saved', () => {
      if (!hsState) return;
      hsState.entries = buildHighScoreTickerList(loadHighScores());
      hsState.offset = 0;
    });

    resizeHighScoreCanvas();
  }
}

function openHighScore(){
  ensureHighScoreUI();
  const modal = document.getElementById('highscore-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden','false');
  hsState.visible = true;
  hsState.entries = buildHighScoreTickerList(loadHighScores());
  hsState.offset = 0;
  hsState.lastTS = performance.now();
  startHighScoreTicker();
}

function closeHighScore(){
  const modal = document.getElementById('highscore-modal');
  if (!modal) return;
  stopHighScoreTicker();
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden','true');
  hsState.visible = false;
}

function loadHighScores(){
  try {
    const raw = localStorage.getItem(HS_STORAGE_KEY);
    if (raw){
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length){
        return normalizeScores(arr);
      }
    }
  } catch(_){}
  return [];
}
function saveHighScoreLocally(entry){
  const arr = loadHighScores();
  arr.push(entry);
  const trimmed = normalizeScores(arr).slice(0, 50);
  try { localStorage.setItem(HS_STORAGE_KEY, JSON.stringify(trimmed)); } catch(_){}
  return trimmed;
}
function normalizeScores(arr){
  return arr.map(e=>({
      name: (e.name||'---').toString().substring(0,8).toUpperCase(),
      score: Math.max(0, parseInt(e.score||0,10)),
      dateISO: e.dateISO || new Date().toISOString()
    }))
    .sort((a,b)=> (b.score - a.score) || (new Date(b.dateISO) - new Date(a.dateISO)));
}
function buildHighScoreTickerList(base){
  const list = [];
  list.push({ type:'title', text:'HIGH SCORES' });
  list.push({ type:'spacer' });
  if (!base || base.length === 0){
    list.push({ type:'entry', rank: 1, name: 'Aucun', score: 0, empty:true });
  } else {
    for (let i=0;i<base.length;i++){
      list.push({ type:'entry', rank: i+1, name: base[i].name, score: base[i].score });
    }
  }
  list.push({ type:'spacer' });
  list.push({ type:'spacer' });
  return list.concat(list.slice(1));
}
function startHighScoreTicker(){
  if (hsState.rafId) cancelAnimationFrame(hsState.rafId);
  const loop = (ts)=>{
    renderHighScoreTicker(ts);
    hsState.rafId = requestAnimationFrame(loop);
  };
  hsState.rafId = requestAnimationFrame(loop);
}
function stopHighScoreTicker(){
  if (hsState.rafId){ cancelAnimationFrame(hsState.rafId); hsState.rafId = null; }
}
function resizeHighScoreCanvas(){
  if (!hsState.canvas) return;
  const card = document.getElementById('highscore-card');
  if (!card) return;
  const dpr = Math.max(1, window.devicePixelRatio||1);
  const cssW = Math.floor(card.clientWidth);
  const cssH = Math.floor(card.clientHeight - 56);
  hsState.canvas.style.width = cssW + 'px';
  hsState.canvas.style.height = cssH + 'px';
  hsState.canvas.width = Math.floor(cssW * dpr);
  hsState.canvas.height = Math.floor(cssH * dpr);
  hsState.ctx.setTransform(1,0,0,1,0,0);
  hsState.ctx.scale(dpr, dpr);
}
function renderHighScoreTicker(ts){
  const c = hsState.ctx;
  const W = hsState.canvas.clientWidth;
  const H = hsState.canvas.clientHeight;
  if (!c || W <= 0 || H <= 0) return;

  const dt = Math.min(0.05, Math.max(0, (ts - hsState.lastTS)/1000));
  hsState.lastTS = ts;

  hsState.offset -= hsState.speed * dt;
  if (hsState.offset <= -hsState.rowH){
    hsState.offset += hsState.rowH;
    hsState.entries.push(hsState.entries.shift());
  }

  c.fillStyle = '#0b140f';
  c.fillRect(0,0,W,H);

  c.strokeStyle = 'rgba(255,255,255,0.03)';
  c.lineWidth = 1;
  for (let y= (hsState.offset|0); y < H; y += hsState.rowH){
    c.beginPath();
    c.moveTo(12, y);
    c.lineTo(W-12, y);
    c.stroke();
  }

  const cx = W/2;
  let y = hsState.offset + 24;

  for (let i=0; i<Math.ceil(H/hsState.rowH)+2; i++){
    const item = hsState.entries[i % hsState.entries.length];
    if (!item){ y += hsState.rowH; continue; }

    if (item.type === 'title'){
      const txt = item.text;
      c.font = '900 28px ' + HUD_TITLE_FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.65)';
      c.strokeText(txt, cx, y);
      c.fillStyle = '#eaf3ff';
      c.fillText(txt, cx, y);
    } else if (item.type === 'spacer'){
      // rien
    } else if (item.type === 'entry'){
      if (item.empty){
        c.font = '900 18px ' + MENU_FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 5;
        c.strokeText('Aucun score enregistré', cx, y);
        c.fillStyle = '#eaf3ff';
        c.fillText('Aucun score enregistré', cx, y);
      } else {
        c.font = '900 20px ' + MENU_FONT;
        c.textAlign = 'left'; c.textBaseline = 'middle';

        const rankStr = (item.rank<10? '0':'') + item.rank + '.';
        const leftX = 26;
        c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,0.65)';
        c.strokeText(rankStr, leftX, y);
        c.fillStyle = '#eaf3ff';
        c.fillText(rankStr, leftX, y);

        const nameX = leftX + 56;
        c.strokeText(item.name, nameX, y);
        c.fillText(item.name, nameX, y);

        c.textAlign = 'right';
        c.font = '700 20px ' + HUD_NUM_FONT;
        const scoreStr = item.score.toString().padStart(4,' ');
        c.strokeText(scoreStr, W - 24, y);
        c.fillText(scoreStr, W - 24, y);
      }
    }

    y += hsState.rowH;
  }
}

// ============================================================================
// Polices
// ============================================================================
function ensureHUDFonts(){
  if (document.getElementById('hud-fonts')) return;
  const link = document.createElement('link');
  link.id = 'hud-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Russo+One&family=Teko:wght@600;700&display=swap';
  document.head.appendChild(link);
}

// ============================================================================
// Sélection / cartes / avatar tête
// ============================================================================
function ensureCandiceCard() {
  const grid = document.querySelector('.characters');
  if (!grid) return;
  if (grid.querySelector('.char-card[data-char="candice"]')) return;

  const card = document.createElement('div');
  card.className = 'char-card';
  card.setAttribute('data-char','candice');

  const canvasPrev = document.createElement('canvas');
  canvasPrev.className = 'char-canvas';
  canvasPrev.width = 120;
  canvasPrev.height = 120;

  const name = document.createElement('div');
  name.className = 'char-name';
  name.textContent = 'Candice';

  card.appendChild(canvasPrev);
  card.appendChild(name);
  grid.appendChild(card);

  card.addEventListener('click', function(){
    selectedCharacter = 'candice';
    const selectLabel = document.getElementById('select-label');
    if (selectLabel) selectLabel.textContent = 'Musicien: Candice';
    updateCharLogo(); // dessine l’avatar tête
    const modal = document.getElementById('select-modal');
    if (modal){
      modal.setAttribute('aria-hidden','true');
      modal.style.display='none';
    }
    const mm = document.getElementById('main-menu');
    if (mm) mm.style.display = '';
  });
}

// Assure la présence d'un canvas avatar dans le bouton de sélection
function ensureCharLogoCanvas(){
  const selectBtn = document.getElementById('select-btn');
  if (!selectBtn) return null;
  let logo = selectBtn.querySelector('.char-btn-logo');
  if (!logo){
    logo = document.createElement('canvas');
    logo.className = 'char-btn-logo';
    logo.width = 72; logo.height = 72;
    selectBtn.insertBefore(logo, selectBtn.firstChild || null);
  }
  return logo;
}

// Met à jour l’avatar du musicien choisi (tête uniquement)
function updateCharLogo(){
  const logo = ensureCharLogoCanvas();
  if (!logo) return;

  // DPR scaling
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.round((logo.clientWidth || 72));
  const cssH = Math.round((logo.clientHeight || 72));
  logo.style.width = cssW + 'px';
  logo.style.height = cssH + 'px';
  logo.width = Math.max(1, Math.round(cssW * dpr));
  logo.height = Math.max(1, Math.round(cssH * dpr));

  const c = logo.getContext('2d');
  c.setTransform(1,0,0,1,0,0);
  c.scale(dpr, dpr);

  // fond: pelouse douce
  c.clearRect(0,0,cssW,cssH);
  const pat = makeGrassPattern(c);
  c.save();
  c.fillStyle = pat; c.fillRect(0,0,cssW,cssH);
  c.restore();

  // bord circulaire
  const cx = cssW/2, cy = cssH/2, R = Math.min(cssW, cssH)/2 - 3;
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, 2*Math.PI); c.closePath();
  c.clip();

  // halo
  const hg = c.createRadialGradient(cx, cy, R*0.1, cx, cy, R);
  hg.addColorStop(0, 'rgba(255,255,255,0.06)');
  hg.addColorStop(1, 'rgba(0,0,0,0.18)');
  c.fillStyle = hg;
  c.fillRect(cx-R, cy-R, R*2, R*2);

  // Dessin tête (coord locales: tête centrée à (0,0))
  c.translate(cx, cy + 2);
  const scale = R / 9.5; // facteur pour bien rentrer la tête/bonnet/chapeau
  c.scale(scale, scale);
  drawHeadAvatar(c, selectedCharacter || 'john');
  c.restore();

  // anneau
  c.save();
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.arc(cx, cy, R, 0, 2*Math.PI); c.stroke();
  c.restore();
}

// Dessine uniquement la tête selon le variant
function drawHeadAvatar(ctx, variant){
  if (variant==='minik') drawMinikHead(ctx);
  else if (variant==='amelie') drawAmelieHead(ctx);
  else if (variant==='candice') drawCandiceHead(ctx);
  else drawJohnHead(ctx);
}

// Têtes (coord: tête centrée en (0,0))
function drawJohnHead(ctx){
  // tête peau
  ctx.beginPath(); ctx.arc(0,0,5.2,0,2*Math.PI); ctx.fillStyle="#fbe2b6"; ctx.fill();

  // casquette: bord (ancien -18.5 => -4.5 ici), couronne (ancien -28.5 => -14.5)
  ctx.beginPath(); ctx.ellipse(0,-4.5,6.4,3.2,0,0,2*Math.PI); ctx.fillStyle="#fff"; ctx.fill();

  ctx.beginPath(); ctx.rect(-4.2,-14.5,8.4,10.5); ctx.fillStyle="#fff"; ctx.fill();
  // bande
  ctx.fillStyle = "#111"; ctx.fillRect(-4.2,-8.4,8.4,2.2);
  ctx.fillStyle = JOHN_ACCENT; ctx.fillRect(-4.2,-14.5,8.4,2.2);

  // petit reflet
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.arc(-2.2,-1.8,1.2,0,2*Math.PI); ctx.fill();
}

function drawMinikHead(ctx){
  // tête
  ctx.beginPath(); ctx.arc(0,0,6.0,0,2*Math.PI); ctx.fillStyle="#f2d2a9"; ctx.fill();

  // joues
  ctx.fillStyle = "rgba(255,120,120,0.35)";
  ctx.beginPath(); ctx.arc(-3.2, 1.5, 2.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 3.2, 1.5, 2.2, 0, Math.PI*2); ctx.fill();

  // yeux
  ctx.fillStyle = "#221f1f";
  ctx.beginPath(); ctx.arc(-2.2, -2.2, 0.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.2, -2.2, 0.9, 0, Math.PI*2); ctx.fill();

  // nez
  ctx.strokeStyle = "#b9876a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,-0.8); ctx.lineTo(0,0.8); ctx.stroke();

  // moustache
  ctx.strokeStyle = "#1b1616"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-0.4,2.6); ctx.quadraticCurveTo(-2.6,3.2,-4.2,2.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 0.4,2.6); ctx.quadraticCurveTo( 2.6,3.2, 4.2,2.4); ctx.stroke();

  // béret (ellipse au-dessus)
  ctx.fillStyle = "#eaeaea";
  ctx.beginPath(); ctx.ellipse(0,-4.5,7.2,3.4,0,0,2*Math.PI); ctx.fill();
}

function drawAmelieHead(ctx){
  // tête verdâtre
  ctx.beginPath(); ctx.arc(0,0,5.6,0,2*Math.PI); ctx.fillStyle="#b4d98e"; ctx.fill();

  // yeux
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(-2.0,-1.4,0.9,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.0,-1.4,0.9,0,Math.PI*2); ctx.fill();

  // sourcils
  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-3.4,-2.8); ctx.lineTo(-0.6,-2.0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 3.4,-2.8); ctx.lineTo( 0.6,-2.0); ctx.stroke();

  // nez long
  ctx.fillStyle = "#9cc377";
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(4.2,1.8); ctx.lineTo(0.2,1.2); ctx.closePath(); ctx.fill();
  // verrue
  ctx.fillStyle = "#2d3a23"; ctx.beginPath(); ctx.arc(2.7,1.9,0.6,0,2*Math.PI); ctx.fill();

  // chapeau: large bord (-18.2 => -3.2), cône (-30.5 => -15.5)
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.ellipse(0,-3.2,10.0,2.8,0,0,2*Math.PI); ctx.fill();

  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.moveTo(-6.2, -3.2);
  ctx.lineTo(0, -15.5);
  ctx.lineTo(6.2, -3.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#6b3fa0";
  ctx.fillRect(-4.4, -6.2, 8.8, 1.6);
}

function drawCandiceHead(ctx){
  // tête
  ctx.beginPath(); ctx.arc(0,0,5.6,0,2*Math.PI); ctx.fillStyle="#f6dfc8"; ctx.fill();

  // yeux + reflets
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(-2.2,-1.0,1.2,0,2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.2,-1.0,1.2,0,2*Math.PI); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath(); ctx.arc(-2.6,-1.4,0.4,0,2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc( 1.8,-1.4,0.4,0,2*Math.PI); ctx.fill();

  // joues + bouche
  ctx.fillStyle = "rgba(255,120,120,0.35)";
  ctx.beginPath(); ctx.arc(-3.2, 1.6, 1.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 3.2, 1.6, 1.9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#d1425b";
  ctx.beginPath(); ctx.arc(0, 2.0, 0.9, 0, Math.PI*2); ctx.fill();

  // diadème (flocon) vers -6 (ancien -21)
  ctx.save();
  ctx.translate(0,-6.0);
  ctx.strokeStyle = "#dff6ff"; ctx.lineWidth = 1.2;
  for (let i=0;i<6;i++){
    ctx.rotate(Math.PI/3);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(0,-4.0);
    ctx.stroke();
  }
  ctx.restore();
}

// Grille de cartes (préviews corps entier)
function drawCharacterPreviews(){
  const cvs = document.querySelectorAll('.char-canvas');
  for (let i=0;i<cvs.length;i++){
    const cv = cvs[i];
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const rect = cv.getBoundingClientRect();
    if (rect.width && rect.height){
      cv.style.width = rect.width + 'px';
      cv.style.height = rect.height + 'px';
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
    }
    const c=cv.getContext('2d');
    c.setTransform(1,0,0,1,0,0); c.scale(dpr,dpr);
    c.clearRect(0,0,cv.clientWidth,cv.clientHeight);

    const pat = makeGrassPattern(c);
    c.save(); c.fillStyle = pat; c.fillRect(0,0,cv.clientWidth,cv.clientHeight); c.restore();

    c.save();
    c.translate(cv.clientWidth/2, cv.clientHeight/2);
    c.scale(1.25,1.25);
    const parent = cv.parentElement;
    const who = cv.dataset.char || (parent ? parent.getAttribute('data-char') : null) || 'john';
    if (who==='minik') drawMinik(c,false,0,0,0);
    else if (who==='amelie') drawAmelie(c,false,0,0,0);
    else if (who==='candice') drawCandice(c,false,0,0,0);
    else drawJohn(c,false,0,0,0);
    c.restore();
  }
}

// ============================================================================
// Mécanique de jeu
// ============================================================================
function getBounds(){ return { left: PAD_LR, right: CANVAS_W - PAD_LR, top: PAD_TOP, bottom: CANVAS_H - PAD_BOTTOM }; }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function clampIntoBounds(pos, m){ const b=getBounds(); return { x: clamp(pos.x, b.left+m, b.right-m), y: clamp(pos.y, b.top+m, b.bottom-m) }; }
function lerp(a,b,t){ return a + (b-a)*t; }
function lerpPt(p,q,t){ return {x:lerp(p.x,q.x,t), y:lerp(p.y,q.y,t)}; }
function easeInOutCubic(t){ return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }

// Formation fitting utilities
function getScaledMinDist(){
  const b = getBounds();
  const minSide = Math.min(b.right - b.left, b.bottom - b.top);
  return clamp(26 * (minSide / 360), 18, 26);
}

function fitFormationToBounds(pts, b, margin = PNJ_RADIUS, minDist = 26){
  if (pts.length === 0) return pts;
  
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  
  // Binary search for the best scale factor
  let low = 0, high = 1;
  let bestScale = 1;
  
  for (let iter = 0; iter < 16; iter++) {
    const scale = (low + high) / 2;
    let valid = true;
    
    // Check bounds constraint
    for (let i = 0; i < pts.length && valid; i++) {
      const x = cx + (pts[i].x - cx) * scale;
      const y = cy + (pts[i].y - cy) * scale;
      if (x < b.left + margin || x > b.right - margin || 
          y < b.top + margin || y > b.bottom - margin) {
        valid = false;
      }
    }
    
    // Check minimum distance constraint
    if (valid) {
      for (let i = 0; i < pts.length && valid; i++) {
        for (let j = i + 1; j < pts.length && valid; j++) {
          const x1 = cx + (pts[i].x - cx) * scale;
          const y1 = cy + (pts[i].y - cy) * scale;
          const x2 = cx + (pts[j].x - cx) * scale;
          const y2 = cy + (pts[j].y - cy) * scale;
          const d = Math.hypot(x2 - x1, y2 - y1);
          if (d < minDist) {
            valid = false;
          }
        }
      }
    }
    
    if (valid) {
      bestScale = scale;
      low = scale;
    } else {
      high = scale;
    }
  }
  
  // Apply the best scale
  return pts.map(p => ({
    x: cx + (p.x - cx) * bestScale,
    y: cy + (p.y - cy) * bestScale
  }));
}

function showBanner(text, ms=1400){
  const b = document.getElementById('level-banner');
  if (!b) return;
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
  const mm = document.getElementById('main-menu');
  const gc = document.getElementById('game-container');
  if (mm) mm.style.display = 'none';
  if (gc) gc.style.display = 'flex';

  initFormation();

  gameState = {
    playerIdx: 12,
    player: {x: FORMATION[12].x, y: FORMATION[12].y, outZoneMs: 0},
    level: 1,
    scoreTicks: 0,
    running: true,

    moves: [],
    currentMove: 0,
    moveStartTime: performance.now(),
    moveDuration: MOVE_DURATION_BASE,
    moveFrom: [],
    moveTo: [],

    graceUntil: performance.now() + 3000, // 3s de grâce
    loseActive: false,
    winActive: false,
    loseBtnRect: {x:0,y:0,w:0,h:0},
    winBtnRect: {x:0,y:0,w:0,h:0},
    loseMsg: "Terrine!",

    prevFormation: [],
    prevPlayer: {x: FORMATION[12].x, y: FORMATION[12].y},

    joy: { active: false, pointerId: null, dx: 0, dy: 0, mag: 0 },

    lastFrameTS: performance.now()
  };

  try {
    if (musicAudio && musicAudio.paused) { musicAudio.currentTime = 0; musicAudio.play().catch(()=>{}); }
  } catch(_) {}

  initLevel(gameState.level);
  gameState.moveFrom = FORMATION.map(p=>({...p}));
  setStepTargets(0);

  gameState.prevFormation = FORMATION.map(p=>({...p}));
  gameState.prevPlayer = {x: gameState.player.x, y: gameState.player.y};

  attachInputs();
  requestAnimationFrame(gameLoop);
}

function attachInputs(){
  if ('onpointerdown' in window){
    canvas.addEventListener('pointerdown', onPointerDown, {passive:false});
    canvas.addEventListener('pointermove', onPointerMove, {passive:false});
    canvas.addEventListener('pointerup', onPointerUp, {passive:false});
    canvas.addEventListener('pointercancel', onPointerUp, {passive:false});
    canvas.addEventListener('pointerleave', onPointerUp, {passive:false});
  } else if ('ontouchstart' in window){
    canvas.addEventListener('touchstart', onTouchStart, {passive:false});
    canvas.addEventListener('touchmove', onTouchMove, {passive:false});
    canvas.addEventListener('touchend', onTouchEnd, {passive:false});
    canvas.addEventListener('touchcancel', onTouchEnd, {passive:false});
  } else {
    canvas.addEventListener('mousedown', onMouseDown, {passive:false});
    window.addEventListener('mousemove', onMouseMove, {passive:false});
    window.addEventListener('mouseup', onMouseUp, {passive:false});
  }
}
function detachInputs(){
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerUp);
  canvas.removeEventListener('pointerleave', onPointerUp);
  canvas.removeEventListener('touchstart', onTouchStart);
  canvas.removeEventListener('touchmove', onTouchMove);
  canvas.removeEventListener('touchend', onTouchEnd);
  canvas.removeEventListener('touchcancel', onTouchEnd);
  canvas.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
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
  const SPEEDUP = 0.68;
  const stepsTotal = Math.max(16, 10 + level * 4);
  gameState.moveDuration = Math.max(220, MOVE_DURATION_BASE * Math.pow(SPEEDUP, level-1));

  const startPositions = FORMATION.map(p=>({...p}));
  const interPositions = getIntermediateLinePositions(level);
  const endPositions = getLevelFinalShapePositions(level);

  const steps1 = Math.max(6, Math.round(stepsTotal * 0.5));
  const steps2 = Math.max(6, stepsTotal - steps1);

  const path1 = buildSmoothPathMoves(startPositions, interPositions, steps1, level);
  const path2 = buildSmoothPathMoves(interPositions, endPositions, steps2, level);

  gameState.moves = path1.concat(path2);
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

    // Use reduced strength for the last step to soften collision resolution
    const isLastStep = s === steps;
    const strength = isLastStep ? 0.3 : 1.0;
    
    const adjusted = resolveTargets(prev, stepTargets, strength);
    path.push(adjusted.map((p,i)=>({dx:p.x-prev[i].x, dy:p.y-prev[i].y})));
    prev = adjusted;
  }

  const last = path[path.length-1];
  for (let i=0; i<MUSICIANS; i++){
    const before = {x: prev[i].x - last[i].dx, y: prev[i].y - last[i].dy};
    last[i].dx = endPositions[i].x - before.x;
    last[i].dy = endPositions[i].y - before.y;
  }
  return path;
}

function resolveTargets(fromPositions, targetPositions, strength = 1.0){
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
          const nx=dx/(d||1), ny=dy/(d||1), push=(MIN_DIST-d)/2 * strength;
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

/* Séquences de formes finales par niveau */
function getLevelFinalShapePositions(level){
  const b=getBounds(), cx=(b.left+b.right)/2, cy=(b.top+b.bottom)/2;
  const w=(b.right-b.left), h=(b.bottom-b.top), r=Math.min(w,h)*.36;
  const minDist = getScaledMinDist();
  
  let finalPositions;
  switch(level){
    case 1: finalPositions = distributeAlongPolyline(diamondVertices(cx,cy,r), MUSICIANS); break;
    case 2: finalPositions = pointsOnCircle(cx,cy,r, MUSICIANS); break;
    case 3: finalPositions = grid5x5(cx,cy, Math.min(w,h)*.58); break;
    case 4: finalPositions = distributeAlongPolyline(starVertices(cx,cy,r*.55,r,-Math.PI/2), MUSICIANS); break;
    case 5: finalPositions = distributeAlongPolyline(polygonVertices(cx,cy,3,r,-Math.PI/2), MUSICIANS); break;
    case 6: finalPositions = distributeAlongPolyline(polygonVertices(cx,cy,6,r,-Math.PI/2), MUSICIANS); break;
    case 7: finalPositions = plusShape(cx,cy,r); break;
    case 8: finalPositions = distributeAlongPolyline(polygonVertices(cx,cy,5,r,-Math.PI/2), MUSICIANS); break;
    case 9: finalPositions = xShape(cx,cy,r); break;
    case 10: finalPositions = distributeAlongPolyline(polygonVertices(cx,cy,8,r,-Math.PI/2), MUSICIANS); break;
    default: finalPositions = pointsOnCircle(cx,cy,r, MUSICIANS); break;
  }
  
  // Apply formation fitting to ensure shapes stay within bounds and maintain proper spacing
  return fitFormationToBounds(finalPositions, b, PNJ_RADIUS, minDist);
}

/* Interpositions “en ligne” entre chaque forme */
function getIntermediateLinePositions(level){
  const pattern = ['vertical','two','three','vertical','two','three','vertical','two','three','vertical'];
  const kind = pattern[(level-1) % pattern.length];
  const b=getBounds(), cx=(b.left+b.right)/2, cy=(b.top+b.bottom)/2;
  const w=(b.right-b.left), h=(b.bottom-b.top);

  if (kind === 'vertical'){
    const count = MUSICIANS;
    const top = b.top + 20, bottom = b.bottom - 20;
    const stepY = (bottom - top) / (count+1);
    const pts = [];
    for (let i=0;i<count;i++){
      pts.push({x:cx, y: top + stepY*(i+1)});
    }
    return pts.map(p=>clampIntoBounds(p, PNJ_RADIUS));
  } else if (kind === 'two'){
    const topY = cy - h*0.22;
    const botY = cy + h*0.22;
    const nTop = Math.ceil(MUSICIANS/2);
    const nBot = MUSICIANS - nTop;
    return [
      ...lineAcrossWidth(topY, nTop, b),
      ...lineAcrossWidth(botY, nBot, b)
    ].map(p=>clampIntoBounds(p, PNJ_RADIUS));
  } else {
    const off = h*0.2;
    const yTop = cy - off, yMid = cy, yBot = cy + off;
    const nTop = Math.floor(MUSICIANS/3);
    const nMid = Math.ceil(MUSICIANS/3);
    const nBot = MUSICIANS - nTop - nMid;
    return [
      ...lineAcrossWidth(yTop, nTop, b),
      ...lineAcrossWidth(yMid, nMid, b),
      ...lineAcrossWidth(yBot, nBot, b)
    ].map(p=>clampIntoBounds(p, PNJ_RADIUS));
  }
}
function lineAcrossWidth(y, n, b){
  if (n<=0) return [];
  const left = b.left + 16, right = b.right - 16;
  const step = (right - left) / (n+1);
  const pts = [];
  for (let i=0;i<n;i++){
    pts.push({x: left + step*(i+1), y});
  }
  return pts;
}

/* Outils formes */
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
function plusShape(cx,cy,r){
  const pts=[], step=r/4;
  for(let i=-2;i<=2;i++) pts.push({x:cx,y:cy+i*step});
  for(let i=-2;i<=2;i++) if(i!==0) pts.push({x:cx+i*step,y:cy});
  while(pts.length<MUSICIANS){
    const k=pts.length, off=.6+.2*((k%4)-1.5);
    pts.push({x:cx+off*step,y:cy+off*step});
  }
  return pts.slice(0,MUSICIANS).map(p=>clampIntoBounds(p, PNJ_RADIUS));
}
function xShape(cx,cy,r){
  const pts=[], step=r/4;
  for(let i=-2;i<=2;i++) pts.push({x:cx+i*step,y:cy+i*step});
  for(let i=-2;i<=2;i++) if(i!==0) pts.push({x:cx+i*step,y:cy-i*step});
  while(pts.length<MUSICIANS){
    pts.push({x:cx+(Math.random()*.5-.25)*step,y:cy+(Math.random()*.5-.25)*step});
  }
  return pts.slice(0,MUSICIANS).map(p=>clampIntoBounds(p, PNJ_RADIUS));
}

function setStepTargets(stepIdx){
  const deltas = gameState.moves[stepIdx];
  const rawTargets = gameState.moveFrom.map((p,i)=>({x:p.x+deltas[i].dx, y:p.y+deltas[i].dy}));
  
  // Use reduced strength for the final step to soften collision resolution
  const isFinalStep = stepIdx === gameState.moves.length - 1;
  const strength = isFinalStep ? 0.3 : 1.0;
  
  const adjusted = resolveTargets(gameState.moveFrom, rawTargets, strength);
  gameState.moveTo = adjusted;
}

function gameLoop(){
  try {
    if (gameState && gameState.running) update();
    render();
  } catch (err) {
    console.error('Game loop error:', err);
  }
  requestAnimationFrame(gameLoop);
}

function update(){
  const now = performance.now();
  let elapsed = now - gameState.moveStartTime;

  // Avance des formations
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

  // Déplacement du joueur via joystick
  const dtSec = Math.max(0, Math.min(0.05, (now - gameState.lastFrameTS) / 1000));
  const J = gameState.joy;
  if (J.mag > 0.0001){
    const vx = J.dx * PLAYER_SPEED;
    const vy = J.dy * PLAYER_SPEED;
    const nx = gameState.player.x + vx * dtSec;
    const ny = gameState.player.y + vy * dtSec;
    const clamped = clampIntoBounds({x:nx, y:ny}, 30);
    gameState.player.x = clamped.x;
    gameState.player.y = clamped.y;
  }

  // Score et timer hors-zone (compte à rebours 5→0)
  const inGrace = now < gameState.graceUntil;
  if (!inGrace){
    if (isPlayerInZone()){
      gameState.player.outZoneMs = 0;
      gameState.scoreTicks += 1;
    } else {
      gameState.player.outZoneMs += 16;
      if (gameState.player.outZoneMs >= MAX_OUT_ZONE_MS) {
        endGame();
      } else {
        gameState.scoreTicks = Math.max(0, gameState.scoreTicks - 1);
      }
    }
  }

  gameState.prevFormation = FORMATION.map(p=>({...p}));
  gameState.prevPlayer = {x: gameState.player.x, y: gameState.player.y};
  gameState.lastFrameTS = now;
}

/* Joystick helpers */
function getJoystickBase(){
  const b = getBounds();
  const R = clamp(Math.round(CANVAS_W * 0.12), 40, 56);
  const cx = b.right - R - JOY_MARGIN;
  const cy = b.bottom - R - JOY_MARGIN;
  return { x: cx, y: cy, r: R };
}
function isInCircle(x,y,cx,cy,r){ const dx=x-cx, dy=y-cy; return dx*dx + dy*dy <= r*r; }

function computeJoyFromPoint(px, py){
  const jb = getJoystickBase();
  const dx = px - jb.x;
  const dy = py - jb.y;
  const dist = Math.hypot(dx,dy) || 1;
  let mag = Math.min(1, dist / jb.r);
  if (mag < JOY_DEADZONE) return {dx:0, dy:0, mag:0};
  const nx = dx / dist, ny = dy / dist;
  const t = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE);
  const eff = Math.pow(t, JOY_SENS_POW);
  return { dx: nx * eff, dy: ny * eff, mag: eff };
}

function onPointerDown(e){
  if (e && e.preventDefault) e.preventDefault();

  if (gameState && gameState.loseActive){
    const pt = getEventPointFromClient(e.clientX, e.clientY);
    if (pointInRect(pt.x, pt.y, gameState.loseBtnRect)) { restartGame(); }
    return;
  }
  if (gameState && gameState.winActive){
    const pt = getEventPointFromClient(e.clientX, e.clientY);
    if (pointInRect(pt.x, pt.y, gameState.winBtnRect)) { backToMenu(); }
    return;
  }
  if (!gameState || !gameState.running) return;

  const pt = getEventPointFromClient(e.clientX, e.clientY);
  const jb = getJoystickBase();
  if (isInCircle(pt.x, pt.y, jb.x, jb.y, jb.r * 1.25)){
    const v = computeJoyFromPoint(pt.x, pt.y);
    gameState.joy.active = true;
    gameState.joy.pointerId = (typeof e.pointerId === 'number') ? e.pointerId : 0;
    gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
  }
}
function onPointerMove(e){
  if (!gameState || !gameState.joy.active) return;
  if ((typeof e.pointerId === 'number') && (e.pointerId !== gameState.joy.pointerId)) return;
  const pt = getEventPointFromClient(e.clientX, e.clientY);
  const v = computeJoyFromPoint(pt.x, pt.y);
  gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
}
function onPointerUp(e){
  if (!gameState) return;
  if (gameState.joy.active && ((typeof e.pointerId !== 'number') || (e.pointerId === gameState.joy.pointerId))){
    gameState.joy.active = false;
    gameState.joy.pointerId = null;
    gameState.joy.dx = 0; gameState.joy.dy = 0; gameState.joy.mag = 0;
  }
}

// Touch fallback
function onTouchStart(e){
  if (e && e.preventDefault) e.preventDefault();
  if (!gameState || !gameState.running) return;

  if (gameState.loseActive || gameState.winActive){
    const t = e.changedTouches[0];
    const pt = getEventPointFromClient(t.clientX, t.clientY);
    if (gameState.loseActive && pointInRect(pt.x, pt.y, gameState.loseBtnRect)) { restartGame(); }
    if (gameState.winActive && pointInRect(pt.x, pt.y, gameState.winBtnRect)) { backToMenu(); }
    return;
  }

  const t = e.touches[0];
  const pt = getEventPointFromClient(t.clientX, t.clientY);
  const jb = getJoystickBase();
  if (isInCircle(pt.x, pt.y, jb.x, jb.y, jb.r * 1.25)){
    const v = computeJoyFromPoint(pt.x, pt.y);
    gameState.joy.active = true;
    gameState.joy.pointerId = -1;
    gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
  }
}
function onTouchMove(e){
  if (e && e.preventDefault) e.preventDefault();
  if (!gameState || !gameState.joy.active) return;
  const t = e.touches[0];
  const pt = getEventPointFromClient(t.clientX, t.clientY);
  const v = computeJoyFromPoint(pt.x, pt.y);
  gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
}
function onTouchEnd(e){
  if (!gameState) return;
  gameState.joy.active = false;
  gameState.joy.pointerId = null;
  gameState.joy.dx = 0; gameState.joy.dy = 0; gameState.joy.mag = 0;
}

// Mouse fallback
function onMouseDown(e){
  if (e && e.preventDefault) e.preventDefault();
  if (!gameState || !gameState.running) return;
  const pt = getEventPointFromClient(e.clientX, e.clientY);
  const jb = getJoystickBase();
  if (isInCircle(pt.x, pt.y, jb.x, jb.y, jb.r * 1.25)){
    const v = computeJoyFromPoint(pt.x, pt.y);
    gameState.joy.active = true;
    gameState.joy.pointerId = -2;
    gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
  }
}
function onMouseMove(e){
  if (!gameState || !gameState.joy.active) return;
  const pt = getEventPointFromClient(e.clientX, e.clientY);
  const v = computeJoyFromPoint(pt.x, pt.y);
  gameState.joy.dx = v.dx; gameState.joy.dy = v.dy; gameState.joy.mag = v.mag;
}
function onMouseUp(e){
  if (!gameState) return;
  gameState.joy.active = false;
  gameState.joy.pointerId = null;
  gameState.joy.dx = 0; gameState.joy.dy = 0; gameState.joy.mag = 0;
}

function getEventPointFromClient(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return clampIntoBounds({x,y}, 30);
}

// ============================================================================
// Textures pelouse
// ============================================================================
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
function makeGrassPattern(context){
  const off = document.createElement('canvas'); off.width=96; off.height=96;
  const c = off.getContext('2d');
  c.fillStyle='#3a7950'; c.fillRect(0,0,off.width,off.height);
  c.strokeStyle='rgba(255,255,255,0.05)'; c.lineWidth=1;
  for(let y=8;y<off.height;y+=12){ c.beginPath(); c.moveTo(0,y); c.lineTo(off.width,y-2); c.stroke(); }
  for(let i=0;i<450;i++){ const x=Math.random()*off.width, y=Math.random()*off.height, a=.06+Math.random()*.06; c.fillStyle=`rgba(255,255,255,${a})`; c.fillRect(x,y,1,1); }
  return context.createPattern(off,'repeat');
}

// ============================================================================
// Football field rendering
// ============================================================================
function drawFootballFieldPortrait(b) {
  // Save context state
  ctx.save();
  
  // Clip to field bounds to prevent any drawing outside
  ctx.beginPath();
  ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  ctx.clip();
  
  const fieldW = b.right - b.left;
  const fieldH = b.bottom - b.top;
  
  // Optional mowing stripes - vertical alternating light/dark translucent strips
  const stripeW = Math.max(8, fieldW / 20);
  for (let x = b.left; x < b.right; x += stripeW) {
    const isEven = Math.floor((x - b.left) / stripeW) % 2 === 0;
    ctx.fillStyle = isEven ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(x, b.top, stripeW, fieldH);
  }
  
  // Yard lines - horizontal lines every 5 yards (21 lines for 0-100 yards)
  ctx.strokeStyle = colors.line;
  const step = fieldH / 20; // 100 yards / 20 = 5-yard increments
  
  for (let i = 0; i <= 20; i++) {
    const y = b.top + i * step;
    // Thicker lines for multiples of 25 yards (every 5 steps in 5-yard increments)
    ctx.lineWidth = (i % 5 === 0) ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(b.left, y);
    ctx.lineTo(b.right, y);
    ctx.stroke();
  }
  
  // Hash marks - short horizontal ticks at each yard (1-99), excluding multiples of 5
  const hashW = 8; // 8px ticks as specified
  const sidelineRatio = 0.4421875; // 70.75/160 ratio from each sideline
  const leftHashX = b.left + fieldW * sidelineRatio;
  const rightHashX = b.right - fieldW * sidelineRatio;
  
  ctx.lineWidth = 1;
  for (let yard = 1; yard < 100; yard++) {
    if (yard % 5 !== 0) { // Exclude multiples of 5
      const y = b.top + (yard / 100) * fieldH;
      
      // Left hash mark
      ctx.beginPath();
      ctx.moveTo(leftHashX - hashW/2, y);
      ctx.lineTo(leftHashX + hashW/2, y);
      ctx.stroke();
      
      // Right hash mark
      ctx.beginPath();
      ctx.moveTo(rightHashX - hashW/2, y);
      ctx.lineTo(rightHashX + hashW/2, y);
      ctx.stroke();
    }
  }
  
  // Yard numbers at 10-yard increments (10,20,30,40,50,40,30,20,10)
  const fontSize = Math.max(12, Math.min(fieldW * 0.08, 24));
  ctx.font = `900 ${fontSize}px ${MENU_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const numbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  for (let i = 0; i < numbers.length; i++) {
    const yardNum = numbers[i];
    const y = b.top + (i + 1) * 2 * step; // 10, 20, 30... yard positions
    
    // Left sideline - rotate -90° (bottom-to-top reading)
    ctx.save();
    ctx.translate(b.left + fontSize/2, y);
    ctx.rotate(-Math.PI/2);
    
    // Dark stroke (shadow/outline)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(yardNum.toString(), 0, 0);
    
    // White fill
    ctx.fillStyle = colors.line;
    ctx.fillText(yardNum.toString(), 0, 0);
    ctx.restore();
    
    // Right sideline - rotate +90° (top-to-bottom reading)
    ctx.save();
    ctx.translate(b.right - fontSize/2, y);
    ctx.rotate(Math.PI/2);
    
    // Dark stroke (shadow/outline)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(yardNum.toString(), 0, 0);
    
    // White fill
    ctx.fillStyle = colors.line;
    ctx.fillText(yardNum.toString(), 0, 0);
    ctx.restore();
  }
  
  // Outer border - white rectangle just inside the bounds
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.left, b.top, fieldW, fieldH);
  
  // Restore context state
  ctx.restore();
}

// ============================================================================
// Rendu scène
// ============================================================================
function render(){
  // Fond
  ctx.fillStyle = getGrassPattern();
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  const b=getBounds();

  // Zones foule
  ctx.fillStyle='rgba(0,0,0,0.18)';
  ctx.fillRect(0,0,CANVAS_W,b.top);
  ctx.fillRect(0,b.bottom,CANVAS_W,CANVAS_H-b.bottom);
  ctx.fillRect(0,b.top,b.left,b.bottom-b.top);
  ctx.fillRect(b.right,b.top,CANVAS_W-b.right,b.bottom-b.top);

  // Terrain
  drawFootballFieldPortrait(b);

  // Foule
  drawCrowd();

  // Panneaux
  drawAdBoards();

  // Zone jaune (slot joueur)
  const iSlot = (gameState? gameState.playerIdx : 12);
  const zoneX = FORMATION[iSlot].x;
  const zoneY = FORMATION[iSlot].y + FOOT_OFFSET * SCALE_PNJ;
  ctx.beginPath(); ctx.arc(zoneX, zoneY, ZONE_RADIUS, 0, 2*Math.PI);
  ctx.fillStyle = colors.zone; ctx.fill();

  // Temps pour anim jambes
  const tNow = performance.now();

  // Musiciens
  for (let i=0;i<FORMATION.length;i++){
    const isPlayer = (gameState && i===gameState.playerIdx);
    const x = isPlayer ? gameState.player.x : FORMATION[i].x;
    const y = isPlayer ? gameState.player.y : FORMATION[i].y;
    const scale = isPlayer ? SCALE_PLAYER : SCALE_PNJ;
    const variant = isPlayer ? selectedCharacter : 'john';

    let speed = 0;
    if (gameState){
      if (isPlayer){
        const dx = gameState.player.x - gameState.prevPlayer.x;
        const dy = gameState.player.y - gameState.prevPlayer.y;
        speed = Math.hypot(dx,dy);
      } else {
        const dx = FORMATION[i].x - gameState.prevFormation[i].x;
        const dy = FORMATION[i].y - gameState.prevFormation[i].y;
        speed = Math.hypot(dx,dy);
      }
    }
    drawMusician(ctx, x, y, scale, isPlayer, variant, speed, tNow, i*0.73);
  }

  // HUD
  drawCanvasHUD();

  // Alerte hors zone
  drawOutOfZoneAlert();

  // Overlays
  if (gameState && gameState.loseActive) drawLoseOverlay();
  if (gameState && gameState.winActive) drawWinOverlay();

  // Joystick
  if (gameState && gameState.running) drawJoystick();
}

/* Panneaux publicitaires */
function drawAdBoards(){
  const b = getBounds();
  const pad = 4;
  const h = 22;

  const bottomY = Math.min(CANVAS_H - h, b.bottom + pad);
  drawAdStrip(b.left, bottomY, b.right - b.left, h, 'horizontal', "Prod-S Arena");

  const leftX = Math.max(0, b.left - h - pad);
  drawAdStrip(leftX, b.top, h, b.bottom - b.top, 'vertical', "Prod-S Arena", false);

  const rightX = Math.min(CANVAS_W - h, b.right + pad);
  drawAdStrip(rightX, b.top, h, b.bottom - b.top, 'vertical', "Prod-S Arena", true);
}
function drawAdStrip(x, y, w, h, orientation, label, flip180=false){
  ctx.save();

  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = colors.adBg;
  ctx.fill();
  ctx.strokeStyle = colors.adStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 6);
  ctx.clip();

  const grad = orientation==='horizontal'
    ? ctx.createLinearGradient(x, y, x, y+h)
    : ctx.createLinearGradient(x, y, x+w, y);
  grad.addColorStop(0, "rgba(255,255,255,0.06)");
  grad.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = colors.adText;
  ctx.textBaseline = 'middle';

  if (orientation==='horizontal'){
    let fontSize = h >= 26 ? 16 : 14;
    ctx.font = '800 ' + fontSize + 'px Poppins, system-ui, sans-serif';
    const metrics = ctx.measureText(label);
    const step = Math.max(metrics.width + 32, 120);
    const baseY = y + h/2;

    for (let px = x + 12; px < x + w - 12; px += step){
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(label, px, baseY);
      ctx.fillText(label, px, baseY);
    }
  } else {
    let fontSize = w >= 26 ? 16 : 14;
    ctx.font = '800 ' + fontSize + 'px Poppins, system-ui, sans-serif';

    ctx.translate(x + w/2, y + h/2);
    ctx.rotate(-Math.PI/2);
    if (flip180) ctx.rotate(Math.PI);

    const metrics = ctx.measureText(label);
    const step = Math.max(metrics.width + 18, 140);
    const start = -h/2 + 12;
    const end = h/2 - 12;

    for (let pos = start; pos <= end; pos += step){
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(label, pos, 0);
      ctx.fillText(label, pos, 0);
    }
  }

  ctx.restore();
  ctx.restore();
}

// ============================================================================
// HUD & Alerte
// ============================================================================
function drawJoystick(){
  const jb = getJoystickBase();
  const J = gameState.joy;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(jb.x, jb.y, jb.r, 0, 2*Math.PI);
  const g = ctx.createRadialGradient(jb.x, jb.y, jb.r*0.2, jb.x, jb.y, jb.r);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.stroke();

  const kx = jb.x + (J.dx || 0) * jb.r * 0.6;
  const ky = jb.y + (J.dy || 0) * jb.r * 0.6;
  ctx.beginPath();
  ctx.arc(kx, ky, jb.r*0.38, 0, 2*Math.PI);
  const g2 = ctx.createLinearGradient(kx, ky - jb.r*0.38, kx, ky + jb.r*0.38);
  g2.addColorStop(0, 'rgba(255,255,255,0.55)');
  g2.addColorStop(1, 'rgba(200,200,200,0.55)');
  ctx.fillStyle = g2;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
  ctx.restore();
}

function drawCanvasHUD() {
  if (!gameState) return;
  const b = getBounds();
  const cx = (b.left + b.right) / 2;

  const areaTop = 0;
  const areaBottom = b.top;
  const areaH = Math.max(24, areaBottom - areaTop);

  const fontSize = areaH < 48 ? 16 : 18;
  const lineGap = areaH < 48 ? 16 : 22;
  const padY = 6;

  const cardH = padY * 2 + fontSize * 2 + (lineGap - fontSize);
  const cardW = Math.min(CANVAS_W - 24, 340);
  const centerY = areaTop + areaH / 2;
  const cardY = clamp(centerY - cardH / 2, 6, areaBottom - cardH - 6);
  const cardX = cx - cardW / 2;

  const displayScore = Math.floor((gameState.scoreTicks || 0) / 100);
  const line1 = 'Niveau ' + gameState.level;
  const line2 = 'Score: ' + displayScore;

  ctx.save();
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
  ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(9,21,14,0.78)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 ' + fontSize + 'px ' + HUD_TITLE_FONT;
  const y1 = cardY + padY + fontSize / 2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(line1, cx, y1);
  ctx.fillStyle = '#eaf3ff';
  ctx.fillText(line1, cx, y1);

  ctx.font = '700 ' + fontSize + 'px ' + HUD_NUM_FONT;
  const y2 = y1 + lineGap;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(line2, cx, y2);
  ctx.fillStyle = '#eaf3ff';
  ctx.fillText(line2, cx, y2);

  ctx.restore();
}

function drawOutOfZoneAlert(){
  if (!gameState) return;
  const now = performance.now();
  if (now < gameState.graceUntil) return;
  if (isPlayerInZone()) return;

  const idx = gameState.playerIdx;
  const zoneX = FORMATION[idx].x;
  const zoneY = FORMATION[idx].y + FOOT_OFFSET * SCALE_PNJ;
  const R = ZONE_RADIUS;

  const titleSize = Math.round(Math.min(44, CANVAS_W * 0.12));
  const timeSize = Math.round(Math.min(36, CANVAS_W * 0.10));
  const boxW = Math.min(CANVAS_W - 40, 12 + Math.max(240, CANVAS_W * 0.70));
  const boxH = titleSize + timeSize + 38;

  let rx = CANVAS_W/2 - boxW/2;
  let ry = CANVAS_H/2 - boxH/2;

  const distToCenter = Math.hypot(zoneX - CANVAS_W/2, zoneY - CANVAS_H/2);
  const nearCenterThresh = Math.min(CANVAS_W, CANVAS_H) * 0.12;
  if (distToCenter <= nearCenterThresh){
    ry = CANVAS_H - boxH - 20;
  }

  if (circleIntersectsRect(zoneX, zoneY, R, rx, ry, boxW, boxH)) {
    if (zoneY < CANVAS_H/2){
      ry = CANVAS_H - boxH - 20;
    } else {
      ry = 20;
    }
    if (circleIntersectsRect(zoneX, zoneY, R, rx, ry, boxW, boxH)){
      if (ry < CANVAS_H/2){
        ry = Math.max(20, zoneY - R - boxH - 12);
      } else {
        ry = Math.min(CANVAS_H - boxH - 20, zoneY + R + 12);
      }
    }
  }

  const remainingMs = Math.max(0, MAX_OUT_ZONE_MS - (gameState.player.outZoneMs || 0));
  const secs = (remainingMs / 1000).toFixed(2) + ' s';

  const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
  const alpha = 0.25 + 0.45 * pulse;

  const cx = rx + boxW/2;

  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = 'rgba(255,80,80,0.22)';
  ctx.beginPath(); ctx.ellipse(rx + boxW/2, ry + boxH/2, boxW*0.60, boxH*0.85, 0, 0, 2*Math.PI); ctx.fill();

  ctx.globalAlpha = 1;
  ctx.beginPath();
  roundRect(ctx, rx, ry, boxW, boxH, 14);
  const bgGrad = ctx.createLinearGradient(rx, ry, rx, ry + boxH);
  bgGrad.addColorStop(0, 'rgba(20,30,25,0.92)');
  bgGrad.addColorStop(1, 'rgba(15,24,19,0.92)');
  ctx.fillStyle = bgGrad;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,80,80,' + (0.35 + 0.35*pulse).toFixed(3) + ')';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 ' + titleSize + 'px ' + HUD_TITLE_FONT;

  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText('HORS ZONE', cx, ry + 16 + titleSize/2);

  ctx.fillStyle = '#fff4f4';
  ctx.fillText('HORS ZONE', cx, ry + 16 + titleSize/2);

  ctx.font = '700 ' + timeSize + 'px ' + HUD_NUM_FONT;
  const ty = ry + 16 + titleSize + 10 + timeSize/2;

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(secs, cx, ty);

  ctx.fillStyle = '#ffe1e1';
  ctx.fillText(secs, cx, ty);

  ctx.restore();
}

function circleIntersectsRect(cx, cy, r, rx, ry, rw, rh){
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return (dx*dx + dy*dy) <= r*r;
}

// ============================================================================
// Overlays victoire/défaite
// ============================================================================
function drawLoseOverlay() {
  const b = getBounds();
  const fieldW = b.right - b.left;
  const fieldH = b.bottom - b.top;
  const cx = (b.left + b.right) / 2;

  const cardW = Math.min(320, fieldW * 0.8);
  const cardH = 150;
  const cardX = cx - cardW / 2;
  const cardY = b.top + (fieldH - cardH)/2;

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
  ctx.font = '900 22px ' + HUD_TITLE_FONT;
  ctx.fillStyle = '#ff2d2d';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  const msg = (gameState && gameState.loseMsg) ? gameState.loseMsg : "Terrine!";
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

  ctx.font = '700 16px ' + HUD_NUM_FONT;
  ctx.fillStyle = '#072513';
  ctx.fillText('Recommencer', cx, btnY + btnH/2);

  gameState.loseBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.restore();
}

function drawWinOverlay() {
  const b = getBounds();
  const fieldW = b.right - b.left;
  const fieldH = b.bottom - b.top;
  const cx = (b.left + b.right) / 2;

  const cardW = Math.min(360, fieldW * 0.86);
  const cardH = 180;
  const cardX = cx - cardW / 2;
  const cardY = b.top + (fieldH - cardH)/2;

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
  ctx.font = '900 20px ' + HUD_TITLE_FONT;
  ctx.fillStyle = '#2fe38a';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  const msg = "Félicitations !\nCordialement, respectueusement,\net avec bienveillance.";
  const lines = msg.split('\n');
  for (let i=0;i<lines.length;i++){
    const line = lines[i];
    ctx.strokeText(line, cx, cardY + 58 + i*22);
    ctx.fillText(line, cx, cardY + 58 + i*22);
  }

  const btnW = Math.min(220, cardW - 40);
  const btnH = 42;
  const btnX = cx - btnW/2;
  const btnY = cardY + cardH - btnH - 16;

  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
  grad.addColorStop(0, '#71b8ff');
  grad.addColorStop(1, '#3f86dd');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#71b9ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '700 16px ' + HUD_NUM_FONT;
  ctx.fillStyle = '#081728';
  ctx.fillText('Menu principal', cx, btnY + btnH/2);

  gameState.winBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.restore();
}

// ============================================================================
// Dessins foule & persos
// ============================================================================
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

function computeFootOffsets(speed, time, seed){
  const amp = Math.min(3.5, speed * 0.9);
  if (amp < 0.1) return {left: 0, right: 0};
  const phase = time*0.012 + seed;
  const s = Math.sin(phase);
  return { left:  amp * s, right: -amp * s };
}

function drawMusician(ctx,x,y,scale=1.2,isPlayer=false,variant='john',speed=0,time=0,seed=0){
  const foot = computeFootOffsets(speed, time, seed);
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  // Ombre
  ctx.beginPath(); ctx.ellipse(0,18,9,5,0,0,2*Math.PI); ctx.fillStyle="rgba(0,0,0,0.22)"; ctx.fill();

  if (variant==='minik') drawMinik(ctx,isPlayer,foot.left,foot.right,seed);
  else if (variant==='amelie') drawAmelie(ctx,isPlayer,foot.left,foot.right,seed);
  else if (variant==='candice') drawCandice(ctx,isPlayer,foot.left,foot.right,seed);
  else drawJohn(ctx,isPlayer,foot.left,foot.right,seed);

  ctx.restore();
}

/* Trompette face caméra (pour John) */
function drawTrumpetFront(ctx){
  ctx.save();
  const bx = 0, by = -10;
  const rOuter = 5.6, rInner = 3.8;

  const halo = ctx.createRadialGradient(bx,by,1, bx,by,rOuter+2);
  halo.addColorStop(0, "rgba(0,0,0,0.10)");
  halo.addColorStop(1, "rgba(0,0,0,0.0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(bx,by,rOuter+2,0,2*Math.PI); ctx.fill();

  const ring = ctx.createRadialGradient(bx,by,1, bx,by,rOuter);
  ring.addColorStop(0.0, colors.brass1);
  ring.addColorStop(0.7, colors.brass2);
  ring.addColorStop(1.0, "#7d6720");
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(bx,by,rOuter,0,2*Math.PI); ctx.fill();

  const core = ctx.createRadialGradient(bx-1,by-1,0.5, bx,by,rInner);
  core.addColorStop(0.0, colors.brassHi);
  core.addColorStop(0.6, colors.brass1);
  core.addColorStop(1.0, colors.brass2);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(bx,by,rInner,0,2*Math.PI); ctx.fill();

  ctx.restore();
}

function baseFeetAndLegs(ctx, footDYLeft=0, footDYRight=0){
  ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.lineTo(0,18); ctx.closePath(); ctx.fillStyle="#222"; ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2, 18 + footDYLeft, 2.1, 1.2, 0, 0, 2*Math.PI);
  ctx.ellipse( 2, 18 + footDYRight,2.1, 1.2, 0, 0, 2*Math.PI);
  ctx.fillStyle="#111"; ctx.fill();
}

/* John (bleu marine pour PNJ et joueur) */
function drawJohn(ctx,isPlayer,footDYLeft,footDYRight,seed){
  baseFeetAndLegs(ctx, footDYLeft, footDYRight);
  ctx.beginPath();
  ctx.moveTo(-7.5,-8); ctx.lineTo(-3.2,8); ctx.lineTo(3.2,8); ctx.lineTo(7.5,-8); ctx.lineTo(0,-12.5); ctx.closePath();
  ctx.fillStyle = isPlayer ? JOHN_PLAYER_MAIN : JOHN_NPC_MAIN;
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2.2,-9.5); ctx.lineTo(2.2,-9.5); ctx.lineTo(0,-12.5); ctx.closePath(); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7.5,-8); ctx.lineTo(-10.5,-3); ctx.lineTo(-7.5,3); ctx.lineTo(-5.5,-6); ctx.closePath();
  ctx.moveTo(7.5,-8); ctx.lineTo(10.5,-3); ctx.lineTo(7.5,3); ctx.lineTo(5.5,-6); ctx.closePath();
  ctx.fillStyle="#fff"; ctx.fill();

  ctx.beginPath(); ctx.arc(0,-14,5.2,0,2*Math.PI); ctx.fillStyle="#fbe2b6"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,-18.5,6.4,3.2,0,0,2*Math.PI); ctx.fillStyle="#fff"; ctx.fill();
  ctx.beginPath(); ctx.rect(-4.2,-28.5,8.4,10.5); ctx.fillStyle="#fff"; ctx.fill();
  ctx.fillStyle="#111"; ctx.fillRect(-4.2,-22.4,8.4,2.2);
  ctx.fillStyle = JOHN_ACCENT; ctx.fillRect(-4.2,-28.5,8.4,2.2);
  ctx.fillStyle="#fff"; ctx.fillRect(-1.2,-5,2.4,9.5);

  drawTrumpetFront(ctx);
}

function drawMinik(ctx,isPlayer,footDYLeft,footDYRight,seed){
  baseFeetAndLegs(ctx, footDYLeft, footDYRight);
  ctx.beginPath(); ctx.moveTo(-10,-6); ctx.quadraticCurveTo(-14,4,-6,10); ctx.lineTo(6,10); ctx.quadraticCurveTo(14,4,10,-6); ctx.lineTo(0,-14); ctx.closePath();
  ctx.fillStyle = "#2a63d4"; ctx.fill();

  ctx.beginPath(); ctx.arc(0,-15,6.0,0,2*Math.PI); ctx.fillStyle="#f2d2a9"; ctx.fill();

  ctx.fillStyle = "rgba(255,120,120,0.35)";
  ctx.beginPath(); ctx.arc(-3.2, -13.5, 2.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 3.2, -13.5, 2.2, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "#221f1f";
  ctx.beginPath(); ctx.arc(-2.2, -16.2, 0.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.2, -16.2, 0.9, 0, Math.PI*2); ctx.fill();

  ctx.strokeStyle = "#b9876a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,-15.8); ctx.lineTo(0,-14.2); ctx.stroke();

  ctx.strokeStyle = "#1b1616"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-0.4,-13.4); ctx.quadraticCurveTo(-2.6,-12.8,-4.2,-13.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 0.4,-13.4); ctx.quadraticCurveTo( 2.6,-12.8, 4.2,-13.6); ctx.stroke();

  ctx.fillStyle = "#eaeaea";
  ctx.beginPath(); ctx.ellipse(0,-19.5,7.2,3.4,0,0,2*Math.PI); ctx.fill();
}

function drawAmelie(ctx,isPlayer,footDYLeft,footDYRight,seed){
  baseFeetAndLegs(ctx, footDYLeft, footDYRight);
  ctx.beginPath(); ctx.moveTo(-8,-6); ctx.lineTo(-12,8); ctx.lineTo(12,8); ctx.lineTo(8,-6); ctx.lineTo(0,-12); ctx.closePath();
  ctx.fillStyle = "#ff7f1f"; ctx.fill();

  ctx.beginPath(); ctx.arc(0,-15,5.6,0,2*Math.PI); ctx.fillStyle="#b4d98e"; ctx.fill();

  ctx.fillStyle = "#9cc377";
  ctx.beginPath(); ctx.moveTo(0,-15); ctx.lineTo(4.2,-13.2); ctx.lineTo(0.2,-13.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2d3a23";
  ctx.beginPath(); ctx.arc(2.7, -13.1, 0.6, 0, 2*Math.PI); ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(-2.0, -16.4, 0.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.0, -16.4, 0.9, 0, Math.PI*2); ctx.fill();

  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-3.4,-17.8); ctx.lineTo(-0.6,-17.0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 3.4,-17.8); ctx.lineTo( 0.6,-17.0); ctx.stroke();

  ctx.strokeStyle = "#5a1122"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-1.6,-12.8); ctx.lineTo(1.6,-12.8); ctx.stroke();

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.ellipse(0,-18.2,10.0,2.8,0,0,Math.PI*2); ctx.fill();

  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.moveTo(-6.2, -18.2);
  ctx.lineTo(0, -30.5);
  ctx.lineTo(6.2, -18.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#6b3fa0";
  ctx.fillRect(-4.4, -21.2, 8.8, 1.6);
}

function drawCandice(ctx,isPlayer,footDYLeft,footDYRight,seed){
  baseFeetAndLegs(ctx, footDYLeft, footDYRight);
  const grdDress = ctx.createLinearGradient(0,-14, 0, 10);
  grdDress.addColorStop(0, isPlayer ? "#bfe9ff" : "#9ad7ff");
  grdDress.addColorStop(1, isPlayer ? "#79b9ff" : "#5aa7f0");
  ctx.beginPath();
  ctx.moveTo(-9,-6);
  ctx.quadraticCurveTo(-12,6,-6,10);
  ctx.lineTo(6,10);
  ctx.quadraticCurveTo(12,6,9,-6);
  ctx.lineTo(0,-14);
  ctx.closePath();
  ctx.fillStyle = grdDress;
  ctx.fill();

  ctx.beginPath(); ctx.moveTo(-8,-8);
  ctx.quadraticCurveTo(-14,-2,-10,8);
  ctx.lineTo(10,8);
  ctx.quadraticCurveTo(14,-2,8,-8);
  ctx.closePath();
  ctx.fillStyle = "rgba(180,220,255,0.25)";
  ctx.fill();

  ctx.beginPath(); ctx.arc(0,-15,5.6,0,2*Math.PI); ctx.fillStyle="#f6dfc8"; ctx.fill();

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(-2.2, -16.0, 1.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 2.2, -16.0, 1.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath(); ctx.arc(-2.6, -16.4, 0.4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 1.8, -16.4, 0.4, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "rgba(255,120,120,0.35)";
  ctx.beginPath(); ctx.arc(-3.2, -13.4, 1.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 3.2, -13.4, 1.9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#d1425b";
  ctx.beginPath(); ctx.arc(0, -13.0, 0.9, 0, Math.PI*2); ctx.fill();

  ctx.save();
  ctx.translate(0,-21.0);
  ctx.strokeStyle = isPlayer ? "#dff6ff" : "#cfefff";
  ctx.lineWidth = 1.2;
  for (let i=0;i<6;i++){
    ctx.rotate(Math.PI/3);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(0,-4.0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(-1.0,-5.5,2.0,10);
}

// ============================================================================
// Logique fin de partie / sauvegarde score
// ============================================================================
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
  if (gameState.level === 10){
    winGame();
    return;
  }
  gameState.level++;
  showBanner("Bravo, on continue la cohésion jusqu'au bout!");
  gameState.player.outZoneMs = 0;
  initLevel(gameState.level);
  gameState.currentMove = 0;
  gameState.moveStartTime = performance.now();
}

function endGame(){
  // Sauvegarde score (défaite)
  persistEndOfGameScore(false);

  gameState.running = false;
  gameState.loseActive = true;
  const choices = ["Terrine!", "10 Jours d'arrêt!", "Réformé!"];
  gameState.loseMsg = choices[Math.floor(Math.random()*choices.length)];
  try { if (musicAudio) musicAudio.pause(); } catch(_){}
}

function winGame(){
  // Sauvegarde score (victoire)
  persistEndOfGameScore(true);

  gameState.running = false;
  gameState.winActive = true;
  try { if (musicAudio) musicAudio.pause(); } catch(_){}
}

// Ajout sauvegarde + rafraîchissement High Score live
function persistEndOfGameScore(didWin){
  if (!gameState) return;
  const score = Math.floor((gameState.scoreTicks || 0) / 100);
  const now = new Date();
  const entry = {
    name: (selectedCharacter || 'JPM').slice(0,8).toUpperCase(),
    score,
    dateISO: now.toISOString(),
    level: gameState.level || 0,
    win: !!didWin
  };
  saveHighScoreLocally(entry);

  // Evénement pour MAJ live de la fenêtre High Score si ouverte
  try {
    if (window && window.dispatchEvent) {
      const ev = new CustomEvent('jpm:score-saved', { detail: entry });
      window.dispatchEvent(ev);
    }
  } catch(_) {}
  if (hsState && hsState.visible) {
    hsState.entries = buildHighScoreTickerList(loadHighScores());
    hsState.offset = 0;
  }

  // Optionnel: pousser au repo si token fourni
  trySaveScoreToRepo(entry);
}

/* Envoi dans le repo via GitHub API (optionnel) */
async function trySaveScoreToRepo(entry){
  const { repo, token, branch } = getRepoConfig();
  if (!repo || !token) return;
  const safeTs = (entry.dateISO || new Date().toISOString()).replace(/[:.]/g,'-');
  const path = `saves/save-${safeTs}.json`;
  const bodyObj = {
    type: "jpm-save",
    created_at: entry.dateISO,
    character: entry.name,
    score: entry.score,
    level: entry.level,
    win: entry.win
  };
  const content = b64(JSON.stringify(bodyObj, null, 2));
  const api = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const payload = {
    message: `Save score ${entry.score} at ${entry.dateISO}`,
    content,
    branch
  };
  try {
    const res = await fetch(api, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok && res.status === 409){
      const altPath = `saves/save-${safeTs}-${Math.random().toString(36).slice(2,6)}.json`;
      await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(altPath)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...payload, message: `Save (alt) score ${entry.score} at ${entry.dateISO}` })
      });
    }
  } catch(_){}
}
function b64(str){
  try { return btoa(unescape(encodeURIComponent(str))); } catch(_){ return btoa(str); }
}

function backToMenu(){
  gameState = null;
  detachInputs();
  try { if (musicAudio) musicAudio.pause(); } catch(_){}
  try { if (musicAudio) musicAudio.currentTime = 0; } catch(_){}

  const gc = document.getElementById('game-container');
  const mm = document.getElementById('main-menu');
  if (gc) gc.style.display = 'none';
  if (mm) mm.style.display = '';
}

function restartGame(){ location.reload(); }
