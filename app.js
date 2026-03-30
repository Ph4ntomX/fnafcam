'use strict';

// ── DOM REFS ─────────────────────────────────────────────────────────────────
const canvas      = document.getElementById('main-canvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const video       = document.getElementById('webcam-video');
const captureBtn  = document.getElementById('capture-btn');
const goLiveBtn   = document.getElementById('go-live-btn');
const goLiveStatus= document.getElementById('go-live-status');
const galleryGrid = document.getElementById('gallery-grid');
const galleryEmpty= document.getElementById('gallery-empty');
const frameCount  = document.getElementById('frame-count');
const captureHint = document.getElementById('capture-hint');
const camBlocked  = document.getElementById('cam-blocked-msg');
const intensitySlider = document.getElementById('intensity-slider');
const intensityLabel  = document.getElementById('intensity-label');
const modalOverlay    = document.getElementById('modal-overlay');
const modalClose      = document.getElementById('modal-close');

// ── STATE ─────────────────────────────────────────────────────────────────────
const W = 640, H = 360;
canvas.width = W; canvas.height = H;

let webcamReady   = false;
let glitchFrames  = [];      // { dataUrl, img }
let glitchActive  = false;   // is a glitch event running?
let glitchFrameIdx = 0;
let glitchDuration = 0;
let glitchTicksLeft = 0;
let nextGlitchIn   = 0;
let framesSinceGlitch = 0;
let liveStream     = null;

const presets = {
  cctv:       true,
  scanlines:  true,
  staticnoise: false,
  camlabel:   true,
  timestamp:  true,
  recdot:     true,
  fisheye:    false,
};

const intensityLabels = ['LOW', 'MEDIUM', 'HIGH', 'UNHINGED'];
let intensityLevel = 1; // 0=low 1=med 2=high 3=unhinged

// REC blink state
let recVisible = true;
let recBlinkTimer = 0;

// ── INTENSITY CONFIG ──────────────────────────────────────────────────────────
// [minSecs, maxSecs, minFrames, maxFrames, glitchStrength(0-1)]
const intensityConfig = [
  { minInt: 5, maxInt: 8, minFrames: 3, maxFrames: 5,  strength: 0.4 },  // low
  { minInt: 2, maxInt: 6, minFrames: 4, maxFrames: 8,  strength: 0.7 },  // medium
  { minInt: 1, maxInt: 3, minFrames: 5, maxFrames: 12, strength: 0.9 },  // high
  { minInt: 0.3, maxInt: 1.5, minFrames: 6, maxFrames: 18, strength: 1.0 }, // unhinged
];

function getCfg() { return intensityConfig[intensityLevel]; }

// ── WEBCAM SETUP ──────────────────────────────────────────────────────────────
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: W, height: H, aspectRatio: 16/9 }, audio: false });
    video.srcObject = stream;
    await new Promise(res => { video.oncanplay = res; });
    await video.play();
    webcamReady = true;
    captureBtn.disabled = false;
    camBlocked.classList.remove('visible');
    scheduleNextGlitch();
    requestAnimationFrame(renderLoop);
  } catch(e) {
    camBlocked.classList.add('visible');
    console.error('Webcam error:', e);
  }
}

// ── GLITCH SCHEDULING ─────────────────────────────────────────────────────────
function scheduleNextGlitch() {
  if (glitchFrames.length === 0) { nextGlitchIn = Infinity; return; }
  const cfg = getCfg();
  const secs = cfg.minInt + Math.random() * (cfg.maxInt - cfg.minInt);
  nextGlitchIn = Math.round(secs * 30); // in frames at 30fps
  framesSinceGlitch = 0;
}

function triggerGlitch() {
  if (glitchFrames.length === 0) return;
  const cfg = getCfg();
  glitchActive = true;
  glitchDuration = Math.floor(cfg.minFrames + Math.random() * (cfg.maxFrames - cfg.minFrames));
  glitchTicksLeft = glitchDuration;
  glitchFrameIdx = Math.floor(Math.random() * glitchFrames.length);
}

// ── MAIN RENDER LOOP ──────────────────────────────────────────────────────────
let lastFrameTime = 0;
const TARGET_FPS = 30;
const FRAME_MS   = 1000 / TARGET_FPS;

function renderLoop(ts) {
  requestAnimationFrame(renderLoop);
  const delta = ts - lastFrameTime;
  if (delta < FRAME_MS - 1) return;
  lastFrameTime = ts;

  if (!webcamReady) return;
  drawFrame();
}

function drawFrame() {
  if (video.readyState < video.HAVE_CURRENT_DATA) return;
  // ── 1. Base: webcam or glitch photo ──────────────────────────────────────
  ctx.clearRect(0, 0, W, H);

  const cfg = getCfg();

  // Glitch event logic
  framesSinceGlitch++;
  if (!glitchActive && glitchFrames.length > 0 && framesSinceGlitch >= nextGlitchIn) {
    triggerGlitch();
  }

  if (glitchActive && glitchTicksLeft > 0) {
    drawGlitchFrame(cfg);
    glitchTicksLeft--;
    if (glitchTicksLeft <= 0) {
      glitchActive = false;
      scheduleNextGlitch();
    }
  } else {
    // Normal feed
    if (presets.fisheye) {
      drawFisheye();
    } else {
      ctx.drawImage(video, 0, 0, W, H);
    }
  }

  // ── 2. Always-on overlays ─────────────────────────────────────────────────
  if (presets.staticnoise) drawStaticNoise(0.08);
  if (presets.cctv)        drawCCTV();
  if (presets.scanlines)   drawScanlines(false);
  if (presets.camlabel)    drawCamLabel();
  if (presets.timestamp)   drawTimestamp();
  if (presets.recdot)      drawRecDot();
}

// ── GLITCH FRAME RENDERER ─────────────────────────────────────────────────────
function drawGlitchFrame(cfg) {
  const s = cfg.strength;
  const faceImg = glitchFrames[glitchFrameIdx].img;
  const progress = 1 - glitchTicksLeft / glitchDuration;

  // --- A) Draw base (face photo) with RGB channel split ---
  const offsetX = Math.floor((Math.random() - 0.5) * 24 * s);
  const offsetY = Math.floor((Math.random() - 0.5) * 6 * s);

  // Red channel offset
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Draw face photo shifted
  const shiftAmt = Math.floor(s * 18 * (Math.random()));

  // Desaturation: draw normal, then overlay grey
  if (presets.fisheye) {
    drawFisheyeSource(faceImg);
  } else {
    ctx.drawImage(faceImg, 0, 0, W, H);
  }

  // RGB chromatic aberration
  drawChromaAberration(faceImg, shiftAmt, s);

  // --- B) Scan line tearing: random horizontal strips ---
  const numTears = Math.floor(2 + Math.random() * 6 * s);
  for (let i = 0; i < numTears; i++) {
    const ty   = Math.floor(Math.random() * H);
    const th   = Math.floor(2 + Math.random() * 18 * s);
    const tx   = Math.floor((Math.random() - 0.5) * 60 * s);
    try {
      const imgData = ctx.getImageData(0, ty, W, Math.min(th, H - ty));
      ctx.putImageData(imgData, tx, ty);
    } catch(e) {}
  }

  // --- C) White noise overlay ---
  drawStaticNoise(0.15 + 0.3 * s * Math.random());

  // --- D) Desaturation flash (brief) ---
  if (Math.random() < 0.4 * s) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // --- E) Bright flash on first frame ---
  if (glitchTicksLeft === glitchDuration) {
    ctx.globalAlpha = 0.25 * s;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // --- F) Brief full scanline tear on glitch ---
  if (presets.scanlines) drawScanlines(true);
}

function drawChromaAberration(src, shift, strength) {
  if (shift < 1) return;
  // offscreen canvas for chroma
  const off = new OffscreenCanvas(W, H);
  const octx = off.getContext('2d');
  octx.drawImage(src, 0, 0, W, H);
  const imgData = octx.getImageData(0, 0, W, H);
  const d = imgData.data;

  const out = ctx.getImageData(0, 0, W, H);
  const od = out.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Red channel: shift right
      const rx = Math.min(W - 1, x + shift);
      const ri = (y * W + rx) * 4;
      od[i]   = d[ri];     // R from shifted pixel
      // Blue channel: shift left
      const bx = Math.max(0, x - shift);
      const bi = (y * W + bx) * 4;
      od[i+2] = d[bi + 2]; // B from shifted pixel
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ── FISHEYE ───────────────────────────────────────────────────────────────────
function drawFisheye() {
  drawFisheyeSource(video);
}

function drawFisheyeSource(source) {
  // Simple barrel distortion via pixel sampling
  const off = new OffscreenCanvas(W, H);
  const octx = off.getContext('2d');
  octx.drawImage(source, 0, 0, W, H);
  const src = octx.getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  const sd = src.data, od = out.data;
  const cx = W / 2, cy = H / 2;
  const k = 0.25; // barrel strength

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      const r2 = nx * nx + ny * ny;
      const scale = 1 + k * r2;
      const sx = Math.round(nx * scale * cx + cx);
      const sy = Math.round(ny * scale * cy + cy);
      const oi = (y * W + x) * 4;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        const si = (sy * W + sx) * 4;
        od[oi]   = sd[si];
        od[oi+1] = sd[si+1];
        od[oi+2] = sd[si+2];
        od[oi+3] = sd[si+3];
      } else {
        od[oi+3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ── CCTV FILTER ───────────────────────────────────────────────────────────────
function drawCCTV() {
  // Green phosphor tint
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 255, 60, 0.18)';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Subtle CRT horizontal warp lines (brightness waves)
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.04;
  for (let y = 0; y < H; y += 4) {
    const bright = Math.sin(y * 0.15 + Date.now() * 0.001) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(0,255,60,${bright * 0.15})`;
    ctx.fillRect(0, y, W, 2);
  }
  ctx.globalAlpha = 1;
}

// ── SCANLINES ─────────────────────────────────────────────────────────────────
function drawScanlines(glitching) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = glitching ? 0.55 : 0.22;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;
}

// ── STATIC NOISE ──────────────────────────────────────────────────────────────
const noiseCanvas = new OffscreenCanvas(W, H);
const noiseCtx    = noiseCanvas.getContext('2d');

function drawStaticNoise(alpha) {
  const imgData = noiseCtx.createImageData(W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255 | 0;
    d[i] = d[i+1] = d[i+2] = v;
    d[i+3] = 255;
  }
  noiseCtx.putImageData(imgData, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.drawImage(noiseCanvas, 0, 0);
  ctx.globalAlpha = 1;
}

// ── CAM LABEL ─────────────────────────────────────────────────────────────────
function drawCamLabel() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.fillText('CAM 01', 10, 22);
  ctx.shadowBlur = 0;
}

// ── TIMESTAMP ─────────────────────────────────────────────────────────────────
function drawTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  const tw = ctx.measureText(ts).width;
  ctx.fillText(ts, W - tw - 10, H - 10);
  ctx.shadowBlur = 0;
}

// ── REC DOT ───────────────────────────────────────────────────────────────────
function drawRecDot() {
  recBlinkTimer++;
  if (recBlinkTimer >= 20) {
    recBlinkTimer = 0;
    recVisible = !recVisible;
  }
  if (!recVisible) return;

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(W - 20, 16, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2222';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('REC', W - 46, 21);
}

// ── GALLERY MANAGEMENT ────────────────────────────────────────────────────────
function captureFrame() {
  const snap = new OffscreenCanvas(W, H);
  snap.getContext('2d').drawImage(video, 0, 0, W, H);
  snap.convertToBlob({ type: 'image/jpeg', quality: 0.88 }).then(blob => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const entry = { dataUrl: url, img };
      glitchFrames.push(entry);
      addThumbToGallery(entry, glitchFrames.length - 1);
      updateGalleryUI();
      scheduleNextGlitch();
    };
  });
}

function addThumbToGallery(entry, idx) {
  galleryEmpty.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'gallery-thumb';
  wrap.dataset.idx = idx;

  const imgEl = document.createElement('img');
  imgEl.src = entry.dataUrl;
  imgEl.alt = `Glitch frame ${idx + 1}`;

  const del = document.createElement('button');
  del.className = 'del-btn';
  del.textContent = 'X';
  del.addEventListener('click', () => deleteFrame(wrap));

  const num = document.createElement('span');
  num.className = 'thumb-num';
  num.textContent = `F${String(idx + 1).padStart(2, '0')}`;

  wrap.append(imgEl, del, num);
  galleryGrid.appendChild(wrap);
}

function deleteFrame(wrap) {
  const idx = parseInt(wrap.dataset.idx, 10);
  URL.revokeObjectURL(glitchFrames[idx].dataUrl);
  glitchFrames.splice(idx, 1);
  wrap.remove();
  // Re-index remaining thumbs
  [...galleryGrid.querySelectorAll('.gallery-thumb')].forEach((el, i) => {
    el.dataset.idx = i;
    el.querySelector('.thumb-num').textContent = `F${String(i + 1).padStart(2, '0')}`;
  });
  updateGalleryUI();
  if (glitchFrames.length === 0) { glitchActive = false; nextGlitchIn = Infinity; }
  else scheduleNextGlitch();
}

function updateGalleryUI() {
  const n = glitchFrames.length;
  frameCount.textContent = `[${n} FRAME${n !== 1 ? 'S' : ''}]`;
  galleryEmpty.style.display = n === 0 ? 'block' : 'none';
  goLiveBtn.disabled = n === 0;
  if (n === 0) {
    captureHint.textContent = 'Capture at least 1 face to activate glitch effect';
  } else {
    captureHint.textContent = `${n} frame${n !== 1 ? 's' : ''} loaded — glitch effect active`;
    captureHint.style.color = 'var(--green-dim)';
  }
}

// ── PRESET TOGGLES ────────────────────────────────────────────────────────────
document.querySelectorAll('.toggle-btn[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.preset;
    presets[key] = !presets[key];
    btn.classList.toggle('active', presets[key]);
  });
});

// ── INTENSITY SLIDER ─────────────────────────────────────────────────────────
intensitySlider.addEventListener('input', () => {
  intensityLevel = parseInt(intensitySlider.value, 10);
  intensityLabel.textContent = intensityLabels[intensityLevel];
  if (glitchFrames.length > 0) scheduleNextGlitch();
});

// ── CAPTURE BUTTON ────────────────────────────────────────────────────────────
captureBtn.addEventListener('click', captureFrame);

// ── GO LIVE ───────────────────────────────────────────────────────────────────
goLiveBtn.addEventListener('click', () => {
  if (!liveStream) {
    liveStream = canvas.captureStream(30);
    window.glitchCamStream = liveStream;
    goLiveBtn.textContent = '&#9632; STREAM ACTIVE';
    goLiveBtn.innerHTML = '&#9632; STREAM ACTIVE';
    goLiveStatus.textContent = '30fps canvas stream running';
  }
  modalOverlay.classList.remove('hidden');
});

modalClose.addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

// ── INIT ──────────────────────────────────────────────────────────────────────
initWebcam();
updateGalleryUI();
