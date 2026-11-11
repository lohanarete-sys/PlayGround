(() => {
  const $ = (id) => document.getElementById(id);
  const menu = $('menuScreen'), gameView = $('gameScreen'), canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
  const names = ['Premiers pas','En cadence','Petit détour','À petits bonds','La clairière','Pas de côté','Double temps','Ça s’accélère','Les collines','Entre les pics','À toute allure','Pique-nique','Terrain mouvant','Tout en rythme','Le grand saut','Virage serré','Sans pause','La traversée','Dernière ligne','Maestro','Sommet'];
  const difficultyNames = ['DOUX','FACILE','FACILE','FACILE','MODÉRÉ','MODÉRÉ','MODÉRÉ','MODÉRÉ','SOUTENU','SOUTENU','SOUTENU','SOUTENU','RAPIDE','RAPIDE','RAPIDE','RAPIDE','INTENSE','INTENSE','INTENSE','EXPERT','EXPERT'];
  const colors = [
    ['#e8e4d7','#87967d','#e8784b','#434c40','#d0b181'],['#e7e2d5','#718a82','#d48b62','#3f514c','#bdc6aa'],['#eee2d5','#9a8b76','#dc7751','#514941','#d6ae88'],['#e2e8de','#81947b','#cb7958','#435147','#b9c9ae'],['#e8e4d7','#a18f77','#d37853','#504940','#d7bd93'],['#e4e6df','#788f8d','#df946a','#424d4d','#b6c4bd'],['#eee5d9','#8c8f73','#db7850','#4c4a3f','#c6bd92']
  ];
  const saved = (() => { try { return JSON.parse(localStorage.getItem('rythme-save')) || {}; } catch (_) { return {}; } })();
  let highest = Math.max(1, Math.min(21, saved.highest || 1));
  let completed = new Set(saved.completed || []);
  let bests = saved.bests || {};
  let level = 1, running = false, ended = false, won = false, raf = 0;
  let player = {x: 142, y: 0, vy: 0, size: 34, grounded: true, rotation: 0};
  let obstacles = [], world = 0, speed = 260, total = 5300, lastTime = 0, elapsed = 0, beat = 0, audioCtx = null, soundOn = false;
  let stageW = 800, stageH = 420, ground = 320, worldSeed = 1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, '0');
  const palette = () => colors[(level - 1) % colors.length];
  function save() { localStorage.setItem('rythme-save', JSON.stringify({highest, completed:[...completed], bests})); }

  function drawLevels() {
    const grid = $('levelGrid'); grid.innerHTML = '';
    for (let i = 1; i <= 21; i++) {
      const button = document.createElement('button');
      button.className = 'level-card' + (completed.has(i) ? ' done' : '') + (i === highest ? ' active' : '');
      button.disabled = i > highest;
      button.innerHTML = `<span class="level-number">${pad(i)}</span><span class="level-name">${names[i-1]}</span><span class="level-difficulty">${difficultyNames[i-1]}</span>${i > highest ? '<span class="level-lock">⌑</span>' : completed.has(i) ? '<span class="level-lock">✓</span>' : ''}`;
      button.addEventListener('click', () => startLevel(i)); grid.appendChild(button);
    }
    $('progressLabel').textContent = `${completed.size} / 21 TERMINÉS`;
  }
  drawLevels();

  function resize() {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); stageW = rect.width; stageH = rect.height; ground = stageH * .79;
    player.size = clamp(stageH * .085, 29, 39); player.x = clamp(stageW * .19, 76, 158);
    if (!running) render(0);
  }
  window.addEventListener('resize', resize);

  function makeCourse() {
    const difficulty = (level - 1) / 20;
    speed = 245 + difficulty * 155;
    total = 4900 + difficulty * 1050;
    obstacles = []; worldSeed = level * 7781;
    let x = 570, n = 0;
    while (x < total - 300) {
      const rand = random(n++);
      let count = rand > .77 + difficulty * .09 ? 2 : 1;
      if (level > 12 && rand > .91) count = 3;
      obstacles.push({x, count, w: 42, h: 38 + (random(n++) > .72 ? 7 : 0)});
      x += 350 - difficulty * 48 + random(n++) * 100;
    }
  }
  function random(n) { let t = Math.sin(worldSeed + n * 82.93) * 43758.5453; return t - Math.floor(t); }

  function startLevel(which) {
    level = which; menu.classList.add('hidden'); gameView.classList.remove('hidden');
    $('levelNumber').textContent = pad(level); $('levelName').textContent = names[level - 1];
    $('stageTip').classList.remove('hidden'); $('gameOverlay').classList.add('hidden');
    world = 0; elapsed = 0; beat = 0; lastTime = 0; ended = false; won = false; running = true;
    player.vy = 0; player.grounded = true; player.rotation = 0; player.y = 0;
    makeCourse(); resize(); updateProgress(); $('bestLabel').textContent = bests[level] ? `RECORD ${Math.round(bests[level] / total * 100)}%` : 'RECORD —';
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function backToMenu() { running = false; cancelAnimationFrame(raf); gameView.classList.add('hidden'); menu.classList.remove('hidden'); drawLevels(); window.scrollTo({top:0, behavior:'smooth'}); }
  function jump() {
    if (gameView.classList.contains('hidden')) return;
    enableAudio();
    if (!running) return;
    if (player.grounded) { player.vy = -Math.sqrt(stageH) * 34; player.grounded = false; player.rotation = 0; }
  }
  $('playButton').addEventListener('click', () => startLevel(highest));
  $('backButton').addEventListener('click', backToMenu);
  $('restartButton').addEventListener('click', () => startLevel(level));
  $('resultPrimary').addEventListener('click', () => won ? (level < 21 ? startLevel(level + 1) : backToMenu()) : startLevel(level));
  $('resultSecondary').addEventListener('click', () => startLevel(level));
  $('gameStage').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) { e.preventDefault(); jump(); } });
  window.addEventListener('keydown', (e) => { if (['Space','ArrowUp','KeyW'].includes(e.code)) { e.preventDefault(); jump(); } if (e.code === 'Escape' && !gameView.classList.contains('hidden')) backToMenu(); });

  function enableAudio() {
    if (!soundOn) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function setSound(on) {
    soundOn = on; $('soundToggle').querySelector('.sound-label').textContent = on ? 'SON ON' : 'SON OFF';
    $('soundToggle').setAttribute('aria-label', on ? 'Désactiver le son' : 'Activer le son');
    if (on) enableAudio();
  }
  $('soundToggle').addEventListener('click', () => setSound(!soundOn));
  function tone(freq, duration, type, volume, at) {
    if (!soundOn || !audioCtx) return;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, at); gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(at); osc.stop(at + duration);
  }
  function beatSound() {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime, step = beat % 4;
    tone(step === 0 ? 105 : 720, step === 0 ? .16 : .045, step === 0 ? 'sine' : 'square', step === 0 ? .14 : .026, t);
    if (step === 2) tone(220, .10, 'triangle', .05, t);
    const notes = [392, 0, 494, 0, 587, 0, 494, 0];
    if (beat % 2 === 0 && notes[(beat / 2) % notes.length]) tone(notes[(beat / 2) % notes.length], .13, 'triangle', .035, t);
    beat++;
  }
  function loop(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, .035); lastTime = now;
    elapsed += dt; world += speed * dt;
    player.vy += stageH * 4.1 * dt; player.y += player.vy * dt;
    if (player.y >= 0) { player.y = 0; player.vy = 0; player.grounded = true; }
    if (!player.grounded) player.rotation += dt * 5.2;
    const beatInterval = 60 / (92 + (level - 1) * 2.3);
    if (elapsed >= beat * beatInterval) beatSound();
    updateProgress(); render(now);
    const collision = obstacles.some(o => { const sx = o.x - world, w = o.count * 42 + (o.count - 1) * 5; return sx < player.x + player.size - 5 && sx + w > player.x + 5 && player.y > -o.h - 2; });
    if (collision) finish(false);
    else if (world >= total) finish(true);
    if (running) raf = requestAnimationFrame(loop);
  }
  function updateProgress() {
    const pct = clamp(world / total, 0, 1); $('progressPercent').textContent = `${Math.floor(pct * 100)}%`; $('progressBar').style.width = `${pct * 100}%`;
  }
  function finish(success) {
    running = false; ended = true; won = success; $('stageTip').classList.add('hidden'); $('gameOverlay').classList.remove('hidden');
    const pct = clamp(world / total, 0, 1);
    if (success) {
      completed.add(level); highest = Math.max(highest, Math.min(21, level + 1)); bests[level] = Math.max(bests[level] || 0, world); save(); drawLevels();
      $('resultKicker').textContent = 'NIVEAU VALIDÉ'; $('resultIcon').textContent = '✦'; $('resultTitle').textContent = level === 21 ? 'Tu es un maestro !' : 'Bien joué !';
      $('resultText').textContent = level === 21 ? 'Tu as traversé les 21 niveaux.' : `Niveau ${pad(level)} terminé, en cadence.`;
      $('resultPrimary').querySelector('span').textContent = level === 21 ? 'RETOUR AU MENU' : 'NIVEAU SUIVANT'; $('resultSecondary').textContent = 'REJOUER';
    } else {
      bests[level] = Math.max(bests[level] || 0, world); save();
      $('resultKicker').textContent = 'OUPS, UN PIC !'; $('resultIcon').textContent = '↗'; $('resultTitle').textContent = 'Presque !';
      $('resultText').textContent = `Tu as parcouru ${Math.floor(pct * 100)} % du niveau. Reprends le rythme.`;
      $('resultPrimary').querySelector('span').textContent = 'RECOMMENCER'; $('resultSecondary').textContent = 'REJOUER';
    }
    $('bestLabel').textContent = `RECORD ${Math.round((bests[level] || 0) / total * 100)}%`;
  }

  function render(now) {
    if (!ctx || !stageW) return;
    const [sky, grass, orange, dark, hill] = palette();
    ctx.clearRect(0, 0, stageW, stageH); ctx.fillStyle = sky; ctx.fillRect(0, 0, stageW, stageH);
    // Soft, graphic hill silhouettes
    drawHill(stageW * .72, ground - stageH * .12, stageW * .52, stageH * .21, hill, .18);
    drawHill(stageW * .2, ground - stageH * .08, stageW * .48, stageH * .16, '#b8bca7', .3);
    // warm sun and small paper-like clouds
    ctx.fillStyle = '#d9b78e'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(stageW * .79, stageH * .22, stageH * .085, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const cloudOffset = (world * .09) % (stageW + 130);
    for (let i = 0; i < 3; i++) { const cx = ((i * stageW * .48 - cloudOffset) % (stageW + 150) + stageW + 150) % (stageW + 150) - 70; cloud(cx, stageH * (.20 + (i % 2) * .1)); }
    // Ground
    ctx.fillStyle = grass; ctx.fillRect(0, ground, stageW, stageH - ground);
    ctx.fillStyle = dark; ctx.fillRect(0, ground, stageW, 5);
    ctx.globalAlpha = .18; ctx.fillStyle = '#f9f4e8';
    const stride = 44, offset = world % stride;
    for (let x = -offset; x < stageW; x += stride) ctx.fillRect(x, ground + 22, 18, 3);
    ctx.globalAlpha = 1;
    // distant beat markers / score track
    ctx.fillStyle = '#455044'; ctx.globalAlpha = .13;
    for (let x = 20 - (world * .45 % 56); x < stageW; x += 56) ctx.fillRect(x, ground - 20, 2, 6);
    ctx.globalAlpha = 1;
    // Spikes
    for (const o of obstacles) {
      const x = o.x - world; if (x < -140 || x > stageW + 80) continue;
      for (let i = 0; i < o.count; i++) {
        const sx = x + i * 47; const h = o.h;
        ctx.beginPath(); ctx.moveTo(sx, ground); ctx.lineTo(sx + 21, ground - h); ctx.lineTo(sx + 42, ground); ctx.closePath();
        ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = '#303a32'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + 21, ground - h); ctx.lineTo(sx + 29, ground - 16); ctx.lineTo(sx + 21, ground - 20); ctx.closePath(); ctx.fillStyle = '#778371'; ctx.fill();
      }
    }
    // Cube with a tiny expressive face
    const s = player.size, px = player.x, py = ground - s + player.y;
    ctx.save(); ctx.translate(px + s/2, py + s/2); ctx.rotate(player.grounded ? Math.sin(now * .006) * .025 : player.rotation);
    ctx.fillStyle = orange; ctx.fillRect(-s/2, -s/2, s, s);
    ctx.fillStyle = '#fff3df'; ctx.fillRect(-s*.23, -s*.12, s*.12, s*.15); ctx.fillRect(s*.11, -s*.12, s*.12, s*.15);
    ctx.strokeStyle = '#fff3df'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-s*.17,s*.22); ctx.quadraticCurveTo(0,s*.32,s*.18,s*.2); ctx.stroke();
    ctx.restore();
    // shadow below player
    const shadowWidth = s * clamp(1 - Math.abs(player.y) / 180, .35, 1);
    ctx.fillStyle = '#334033'; ctx.globalAlpha = .19; ctx.beginPath(); ctx.ellipse(px + s/2, ground + 7, shadowWidth/2, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    // Subtle beat pulse at the horizon
    if (running && soundOn) { const phase = (elapsed % (60 / (92 + (level-1)*2.3))) / (60 / (92 + (level-1)*2.3)); ctx.globalAlpha = (1-phase)*.35; ctx.fillStyle = orange; ctx.fillRect(0, ground - 4, stageW, 4); ctx.globalAlpha = 1; }
  }
  function drawHill(x, y, w, h, color, offset) {
    const move = world * offset % (stageW * 1.5);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-stageW, ground);
    ctx.quadraticCurveTo(x - move, y - h, x + w * .3 - move, y);
    ctx.quadraticCurveTo(x + w * .8 - move, y + h * .2, x + w - move, ground);
    ctx.lineTo(stageW * 2, ground); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(stageW - move, ground);
    ctx.quadraticCurveTo(stageW + x - move, y - h * .6, stageW + x + w * .3 - move, y);
    ctx.quadraticCurveTo(stageW + x + w - move, y + h * .2, stageW * 2, ground); ctx.closePath(); ctx.fill();
  }
  function cloud(x,y) { ctx.fillStyle='#f6f1e5'; ctx.globalAlpha=.38; ctx.beginPath(); ctx.ellipse(x,y,20,5,0,0,Math.PI*2); ctx.ellipse(x+13,y-4,9,7,0,0,Math.PI*2); ctx.ellipse(x-9,y-2,8,6,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }
  resize();
})();
