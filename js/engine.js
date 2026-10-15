/* =========================================================
   Движок новеллы
   ========================================================= */
(() => {
  'use strict';

  /* ---------- настройки ---------- */
  const IMAGE_DIR = 'images/';
  const IMAGE_EXT = ['jpg', 'png', 'jpeg', 'webp', 'JPG', 'PNG'];
  const TITLE_BG = 1;               // фон главного меню (scene_1)
  const SAVE_KEY = 'valmont_s1_save';
  const PREF_KEY = 'valmont_prefs';
  const DONE_KEY = 'valmont_s1_done';
  const SPEEDS = { slow: 42, normal: 24, fast: 11, instant: 0 };
  const SIZES = { s: '17px', m: '19px', l: '21.5px' };

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  const prefs = Object.assign({ music: 0.7, sfx: 0.8, speed: 'normal', size: 'm', dim: 0.38 }, store.get(PREF_KEY, {}));
  function applyPrefs() {
    document.documentElement.style.setProperty('--text-size', SIZES[prefs.size]);
    document.documentElement.style.setProperty('--dim', prefs.dim);
    SoundEngine.setMusicVolume(prefs.music);
    SoundEngine.setSfxVolume(prefs.sfx);
  }

  /* ---------- состояние ---------- */
  const freshStats = () => ({ gab: 0, adr: 0, intr: 0, dign: 0, bold: 0, pass: 0 });
  let S = { scene: 0, queue: [], stats: freshStats(), flags: {}, music: null, fx: 'dust' };
  let history = [];
  let currentItem = null;
  let typing = null;
  let busy = false;        // анимация выбора
  let inGame = false;

  /* ---------- картинки ---------- */
  const imgCache = {};
  function resolveImage(n) {
    if (imgCache[n] !== undefined) return Promise.resolve(imgCache[n]);
    return new Promise((res) => {
      let i = 0;
      const tryNext = () => {
        if (i >= IMAGE_EXT.length) { imgCache[n] = null; return res(null); }
        const url = `${IMAGE_DIR}scene_${n}.${IMAGE_EXT[i++]}`;
        const im = new Image();
        im.onload = () => { imgCache[n] = url; res(url); };
        im.onerror = tryNext;
        im.src = url;
      };
      tryNext();
    });
  }
  const FALLBACK = [
    ['#3b1d12', '#7a3b1c'], ['#14261f', '#3a5a3c'], ['#2a1a10', '#5a3a20'], ['#2a0f14', '#5a1f2a'],
    ['#2b0d08', '#7a2a10'], ['#141a24', '#3a4a5c'], ['#1d1d2a', '#4a4a6a'], ['#20101e', '#5a2a50'],
    ['#100a1a', '#3a1f4a'], ['#170d10', '#4a2028'], ['#141018', '#4a3a5a'], ['#0f1418', '#2a3a44'],
    ['#22140a', '#6a4a1a'], ['#0a0a0c', '#1f2226'], ['#06070a', '#1a1d24']
  ];
  let bgFront = $('bgA'), bgBack = $('bgB'), bgNow = null;
  async function setBg(n, instant) {
    if (bgNow === n) return;
    bgNow = n;
    const url = await resolveImage(n);
    if (bgNow !== n) return;
    const el = bgBack;
    if (url) el.style.backgroundImage = `url("${url}")`;
    else {
      const c = FALLBACK[(n - 1) % FALLBACK.length];
      el.style.backgroundImage = `radial-gradient(ellipse at 50% 35%, ${c[1]}, ${c[0]} 70%, #000)`;
    }
    if (instant) { el.style.transition = 'none'; requestAnimationFrame(() => (el.style.transition = '')); }
    el.classList.add('show');
    bgFront.classList.remove('show');
    [bgFront, bgBack] = [bgBack, bgFront];
    // заранее грузим следующий фон
    if (n < 15) resolveImage(n + 1);
  }

  /* ---------- частицы ---------- */
  const FXC = (() => {
    const cv = $('fx'), cx = cv.getContext('2d');
    let mode = 'none', parts = [], w = 0, h = 0, dpr = 1, raf = null;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(init) {
      const p = { x: Math.random() * w, y: init ? Math.random() * h : 0, life: Math.random() };
      if (mode === 'embers') { p.y = init ? Math.random() * h : h + 10; p.vx = (Math.random() - .5) * .3; p.vy = -(.25 + Math.random() * .6); p.r = .8 + Math.random() * 1.8; p.c = [255, 140 + Math.random() * 60, 60]; }
      else if (mode === 'rain') { p.y = init ? Math.random() * h : -20; p.vx = -1.2; p.vy = 9 + Math.random() * 6; p.r = .8; p.l = 10 + Math.random() * 14; }
      else if (mode === 'petals') { p.y = init ? Math.random() * h : -20; p.vx = .2 + Math.random() * .5; p.vy = .5 + Math.random() * .7; p.r = 3 + Math.random() * 4; p.a = Math.random() * 6; p.va = (Math.random() - .5) * .04; }
      else { p.vx = (Math.random() - .5) * .15; p.vy = -(.05 + Math.random() * .15); p.r = .5 + Math.random() * 1.4; p.c = [255, 230, 190]; }
      return p;
    }
    const COUNT = { dust: 40, embers: 46, rain: 110, petals: 22, none: 0 };
    function set(m) {
      if (m === mode) return;
      mode = m || 'none';
      parts = [];
      for (let i = 0; i < COUNT[mode]; i++) parts.push(spawn(true));
      if (!raf && mode !== 'none') loop();
      if (mode === 'none') cx.clearRect(0, 0, w, h);
    }
    let flash = 0;
    function lightning() { flash = 1; }
    function loop() {
      raf = requestAnimationFrame(loop);
      cx.clearRect(0, 0, w, h);
      if (flash > 0) { cx.fillStyle = `rgba(220,230,255,${flash * 0.35})`; cx.fillRect(0, 0, w, h); flash -= 0.04; }
      if (mode === 'none' && flash <= 0) { cancelAnimationFrame(raf); raf = null; return; }
      const t = performance.now() / 1000;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (mode === 'rain') {
          cx.strokeStyle = 'rgba(180,200,230,.28)'; cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x + p.vx * 2, p.y + p.l); cx.stroke();
          if (p.y > h) parts[i] = spawn(false);
        } else if (mode === 'petals') {
          p.a += p.va; p.x += Math.sin(t + p.life * 6) * .4;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a);
          cx.fillStyle = 'rgba(190,40,62,.75)';
          cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * .55, 0, 0, Math.PI * 2); cx.fill(); cx.restore();
          if (p.y > h + 20) parts[i] = spawn(false);
        } else {
          const tw = .5 + .5 * Math.sin(t * 2 + p.life * 10);
          const a = mode === 'embers' ? .35 + .5 * tw : .12 + .25 * tw;
          cx.fillStyle = `rgba(${p.c[0]},${p.c[1] | 0},${p.c[2]},${a})`;
          cx.shadowColor = mode === 'embers' ? 'rgba(255,120,40,.9)' : 'transparent';
          cx.shadowBlur = mode === 'embers' ? 8 : 0;
          cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
          if (p.y < -10 || p.x < -10 || p.x > w + 10) parts[i] = spawn(false);
        }
      }
      cx.shadowBlur = 0;
    }
    window.addEventListener('resize', resize);
    resize();
    return { set, lightning, resize, get mode() { return mode; } };
  })();

  /* ---------- экраны ---------- */
  const screens = ['splash', 'title', 'seasons', 'ending'];
  function showScreen(id) {
    screens.forEach((s) => $(s).classList.toggle('hidden', s !== id));
    if (id) { $(id).classList.remove('enter'); void $(id).offsetWidth; $(id).classList.add('enter'); }
    $('game').classList.toggle('hidden', !!id);
    inGame = !id;
  }

  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  /* ---------- текст и печать ---------- */
  function parseSegments(str) {
    const segs = [];
    str.split(/(\*[^*]+\*)/g).forEach((part) => {
      if (!part) return;
      if (part.startsWith('*') && part.endsWith('*')) segs.push({ t: part.slice(1, -1), em: true });
      else segs.push({ t: part, em: false });
    });
    return segs;
  }
  function renderSegments(el, segs, count) {
    el.innerHTML = '';
    let left = count;
    for (const s of segs) {
      if (left <= 0) break;
      const piece = s.t.slice(0, left);
      left -= s.t.length;
      if (s.em) { const e = document.createElement('em'); e.textContent = piece; el.appendChild(e); }
      else el.appendChild(document.createTextNode(piece));
    }
  }
  function typeText(el, str, instant) {
    stopTyping();
    const segs = parseSegments(str);
    const total = segs.reduce((a, s) => a + s.t.length, 0);
    const speed = SPEEDS[prefs.speed];
    $('nextHint').classList.remove('show');
    if (instant || speed === 0) { renderSegments(el, segs, total); $('nextHint').classList.add('show'); return; }
    let n = 0, last = performance.now(), acc = 0;
    typing = { finish() { renderSegments(el, segs, total); stopTyping(); $('nextHint').classList.add('show'); } };
    const tick = (now) => {
      if (!typing) return;
      acc += now - last; last = now;
      const step = Math.floor(acc / speed);
      if (step > 0) {
        acc -= step * speed;
        n = Math.min(total, n + step);
        renderSegments(el, segs, n);
        el.scrollTop = el.scrollHeight;
      }
      if (n >= total) { typing.finish(); return; }
      typing.raf = requestAnimationFrame(tick);
    };
    typing.raf = requestAnimationFrame(tick);
  }
  function stopTyping() { if (typing && typing.raf) cancelAnimationFrame(typing.raf); typing = null; }

  /* ---------- ход истории ---------- */
  const cloneState = () => ({
    scene: S.scene, queue: S.queue.slice(),
    stats: Object.assign({}, S.stats), flags: Object.assign({}, S.flags),
    music: S.music, fx: S.fx
  });

  function buildQueue(idx) {
    const sc = STORY[idx];
    const q = [];
    if (sc.card) q.push({ type: 'card', top: sc.card.top, title: sc.card.title });
    return q.concat(sc.lines);
  }

  function enterScene(idx) {
    S.scene = idx;
    const sc = STORY[idx];
    S.queue = buildQueue(idx);
    S.music = sc.music; S.fx = sc.fx || 'dust';
    SoundEngine.setMood(S.music);
    FXC.set(S.fx);
    setBg(sc.bg);
    updateHud();
    store.set(SAVE_KEY, { scene: idx, stats: S.stats, flags: S.flags });
  }

  function updateHud() {
    const sc = STORY[S.scene];
    $('sceneLabel').textContent = sc.label;
    $('sceneCount').textContent = `Сцена ${S.scene + 1} из ${STORY.length}`;
    $('progressBar').style.width = `${((S.scene + 1) / STORY.length) * 100}%`;
    $('btnBack').disabled = history.length <= 1;
  }

  function flagOk(flag) {
    if (!flag) return true;
    if (Array.isArray(flag)) return flag.some((f) => S.flags[f]);
    if (flag.startsWith('!')) return !S.flags[flag.slice(1)];
    return !!S.flags[flag];
  }

  function advance() {
    if (busy) return;
    for (let guard = 0; guard < 500; guard++) {
      if (!S.queue.length) {
        if (S.scene < STORY.length - 1) { enterScene(S.scene + 1); continue; }
        return;
      }
      const it = S.queue.shift();
      switch (it.type) {
        case 'sfx':
          SoundEngine.sfx(it.name);
          if (it.name === 'thunder') FXC.lightning();
          continue;
        case 'mus': S.music = it.mood; SoundEngine.setMood(it.mood); continue;
        case 'fx': S.fx = it.fx; FXC.set(it.fx); continue;
        case 'when': S.queue.unshift(...(flagOk(it.flag) ? it.then : it.otherwise)); continue;
      }
      history.push({ item: it, state: cloneState() });
      if (history.length > 600) history.shift();
      display(it, false);
      return;
    }
  }

  function goBack() {
    if (busy) return;
    if (typing) stopTyping();
    if (history.length <= 1) return;
    history.pop();
    const top = history[history.length - 1];
    const st = top.state;
    S = { scene: st.scene, queue: st.queue.slice(), stats: Object.assign({}, st.stats), flags: Object.assign({}, st.flags), music: st.music, fx: st.fx };
    SoundEngine.setMood(S.music);
    FXC.set(S.fx);
    setBg(STORY[S.scene].bg);
    SoundEngine.sfx('click');
    display(top.item, true);
  }

  function next() {
    if (busy) return;
    if (typing) { typing.finish(); return; }
    if (!currentItem) return;
    if (currentItem.type === 'choice') {
      const head = document.querySelector('.choice-head');
      if (head) { head.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }
      return;
    }
    if (currentItem.type === 'end') return;
    SoundEngine.sfx('click');
    advance();
  }

  /* ---------- отображение ---------- */
  function hideOverlays() {
    $('card').classList.add('hidden');
    $('letter').classList.add('hidden');
    $('choices').classList.add('hidden');
  }

  function display(it, fromBack) {
    currentItem = it;
    updateHud();
    hideOverlays();
    const bo = $('blackout');
    if (it.type !== 'fade') bo.classList.remove('on', 'hard');

    const panel = $('panel');
    const plate = $('nameplate');
    const text = $('text');
    const pov = $('povTag');
    const sc = STORY[S.scene];

    switch (it.type) {
      case 'card':
      case 'sec': {
        panel.classList.add('gone');
        const c = $('card');
        c.classList.toggle('sec', it.type === 'sec');
        $('cardTop').textContent = it.type === 'card' ? it.top : '✦';
        $('cardTitle').textContent = it.type === 'card' ? `«${it.title}»` : it.title;
        $('cardSub').textContent = it.sub || '';
        c.classList.remove('hidden');
        // перезапуск анимаций
        c.querySelectorAll('.card-inner > *').forEach((e) => { e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; });
        break;
      }
      case 'letter': {
        panel.classList.add('gone');
        const L = $('letter');
        const lt = $('letterText');
        lt.innerHTML = '';
        it.t.split(/(\.\.\.)/).forEach((p) => {
          const s = document.createElement('span');
          if (p === '...') s.className = 'smudge';
          s.textContent = p;
          lt.appendChild(s);
        });
        L.classList.remove('hidden');
        const parch = L.querySelector('.parchment');
        parch.style.animation = 'none'; void parch.offsetWidth; parch.style.animation = '';
        break;
      }
      case 'fade': {
        panel.classList.add('gone');
        bo.classList.toggle('hard', it.mode === 'hard');
        bo.classList.add('on');
        break;
      }
      case 'choice': {
        panel.classList.add('gone');
        renderChoice(it);
        break;
      }
      case 'end': {
        showEnding();
        break;
      }
      default: { // n / d
        const wasGone = panel.classList.contains('gone');
        panel.classList.remove('gone');
        if (wasGone) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
        if (it.type === 'd') {
          const col = CHARACTERS[it.who] || '#e9dcc6';
          plate.textContent = it.who;
          plate.style.color = col;
          plate.classList.add('show');
          text.className = 'dlg';
          pov.classList.remove('show');
        } else {
          plate.classList.remove('show');
          text.className = 'narr';
          if (sc.pov) { pov.textContent = sc.pov; pov.classList.add('show'); } else pov.classList.remove('show');
        }
        text.scrollTop = 0;
        typeText(text, it.t, fromBack);
      }
    }
  }

  function fxLabel(fx) {
    return Object.keys(fx).filter((k) => fx[k]).map((k) => `<b>+${fx[k]}</b> ${STATS[k].icon} ${STATS[k].name}`);
  }

  function renderChoice(it) {
    const box = $('choices');
    const head = box.querySelector('.choice-head');
    head.classList.toggle('key', !!it.major);
    $('choiceTitle').textContent = it.major ? 'Ключевой выбор' : 'Выбор';
    head.style.animation = 'none'; void head.offsetWidth; head.style.animation = '';
    const list = $('choiceList');
    list.innerHTML = '';
    it.opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.style.animationDelay = `${0.12 + i * 0.12}s`;
      const ok = flagOk(o.req);
      const tags = fxLabel(o.fx);
      if (o.note) tags.push(o.note);
      if (!ok) { b.classList.add('locked'); tags.length = 0; tags.push(`🔒 ${o.lock || 'Недоступно'}`); }
      b.innerHTML = `<span class="ct"></span>${tags.length ? `<span class="cfx">${tags.map((t) => `<span>${t}</span>`).join('')}</span>` : ''}`;
      b.querySelector('.ct').textContent = o.t;
      b.addEventListener('click', (e) => { e.stopPropagation(); pick(it, o, b); });
      list.appendChild(b);
    });
    box.classList.remove('hidden');
  }

  function pick(choiceItem, opt, btn) {
    if (busy) return;
    busy = true;
    SoundEngine.sfx('choose');
    btn.classList.add('picked');
    document.querySelectorAll('.choice').forEach((c) => { if (c !== btn) c.classList.add('fade'); });
    Object.keys(opt.fx).forEach((k) => { S.stats[k] = (S.stats[k] || 0) + opt.fx[k]; });
    if (opt.flag) S.flags[opt.flag] = true;
    S.flags['choice_' + choiceItem.key] = choiceItem.opts.indexOf(opt);
    const gained = Object.keys(opt.fx).filter((k) => opt.fx[k]).map((k) => `${STATS[k].icon} +${opt.fx[k]} ${STATS[k].name}`);
    if (gained.length) toast(gained.join('   '));
    else if (opt.note) toast(opt.note);
    setTimeout(() => {
      busy = false;
      S.queue.unshift(...opt.then);
      advance();
    }, 650);
  }

  /* ---------- финал ---------- */
  function showEnding() {
    SoundEngine.sfx('bell');
    store.set(DONE_KEY, true);
    store.del(SAVE_KEY);
    const endItem = currentItem;
    setTimeout(() => {
      if (currentItem !== endItem || !inGame) return;
      SoundEngine.setMood('title');
      FXC.set('petals');
      const side = S.flags.sideAdrian ? 'рядом с <b>Эдрианом</b>' : S.flags.sideGabriel ? 'рядом с <b>Габриэлем</b>' : S.flags.sideSelf ? '<b>ни с кем</b> — ты не вещь' : '';
      let lead = '';
      if (S.stats.gab > S.stats.adr) lead = 'Сердце ближе к <b>Габриэлю</b>';
      else if (S.stats.adr > S.stats.gab) lead = 'Сердце ближе к <b>Эдриану</b>';
      else lead = 'Сердце разрывается <b>пополам</b>';
      $('endPath').innerHTML = `${lead}${side ? `<br>На рассвете ты встала ${side}` : ''}`;
      $('endStats').innerHTML = Object.keys(STATS).map((k) => `<span>${STATS[k].icon} ${STATS[k].name} ${S.stats[k] || 0}</span>`).join('');
      showScreen('ending');
      $('ending').scrollTop = 0;
    }, 2600);
  }

  /* ---------- запуск ---------- */
  function startNew() {
    S = { scene: 0, queue: [], stats: freshStats(), flags: {}, music: null, fx: 'dust' };
    history = [];
    showScreen(null);
    $('panel').classList.add('gone');
    enterScene(0);
    advance();
  }
  function continueGame() {
    const sv = store.get(SAVE_KEY, null);
    if (!sv) return startNew();
    S = { scene: sv.scene, queue: [], stats: Object.assign(freshStats(), sv.stats), flags: sv.flags || {}, music: null, fx: 'dust' };
    history = [];
    showScreen(null);
    $('panel').classList.add('gone');
    enterScene(sv.scene);
    advance();
  }

  function toTitle() {
    closeModal();
    stopTyping();
    showScreen('title');
    $('btnContinue').classList.toggle('hidden', !store.get(SAVE_KEY, null));
    setBg(TITLE_BG);
    SoundEngine.setMood('title');
    FXC.set('petals');
  }

  /* ---------- сезоны ---------- */
  function renderSeasons() {
    const done = store.get(DONE_KEY, false);
    const list = $('seasonList');
    list.innerHTML = '';
    SEASONS.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'season ' + s.status;
      b.style.animationDelay = `${i * 0.12}s`;
      const badge = s.status === 'open' ? (done ? 'Пройден ✓' : 'Доступен') : 'В разработке';
      b.innerHTML = `
        <div class="s-bg"></div><div class="s-shade"></div>
        <div class="s-badge">${badge}</div>
        <div class="s-body">
          <div class="s-num">Сезон ${s.num}</div>
          <div class="s-title">${s.title}</div>
          <div class="s-meta">${s.meta}</div>
        </div>
        ${s.status === 'dev' ? '<div class="lock">🔒</div>' : ''}`;
      resolveImage(s.status === 'open' ? 1 : 15).then((u) => { if (u) b.querySelector('.s-bg').style.backgroundImage = `url("${u}")`; });
      b.addEventListener('click', () => {
        if (s.status === 'open') {
          SoundEngine.sfx('choose');
          if (store.get(SAVE_KEY, null)) continueGame(); else startNew();
        } else {
          SoundEngine.sfx('click');
          toast(`Сезон ${s.num} ещё пишется... ✦ Скоро`);
        }
      });
      list.appendChild(b);
    });
  }

  /* ---------- модалки ---------- */
  function openModal(html, bind) {
    $('sheetBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (bind) bind($('sheetBody'));
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  function seg(name, opts, cur) {
    return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function openSettings() {
    openModal(`
      <h3>Настройки</h3>
      <div class="row"><label>🎵 Музыка</label><input type="range" min="0" max="1" step="0.05" value="${prefs.music}" data-r="music"></div>
      <div class="row"><label>🔔 Звуки</label><input type="range" min="0" max="1" step="0.05" value="${prefs.sfx}" data-r="sfx"></div>
      <div class="row"><label>🌙 Затемнение фона</label><input type="range" min="0" max="0.75" step="0.05" value="${prefs.dim}" data-r="dim"></div>
      <div class="row"><label>Скорость текста</label>${seg('speed', [['slow', 'Медленно'], ['normal', 'Обычно'], ['fast', 'Быстро'], ['instant', 'Сразу']], prefs.speed)}</div>
      <div class="row"><label>Размер текста</label>${seg('size', [['s', 'Аа'], ['m', 'Аа'], ['l', 'Аа']], prefs.size)}</div>
      <button class="menu-btn" data-close>Готово</button>
    `, (root) => {
      root.querySelectorAll('[data-seg="size"] button').forEach((b, i) => (b.style.fontSize = ['14px', '17px', '21px'][i]));
      root.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
        prefs[r.dataset.r] = parseFloat(r.value); applyPrefs(); store.set(PREF_KEY, prefs);
      }));
      root.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        prefs[sg.dataset.seg] = b.dataset.v;
        sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        applyPrefs(); store.set(PREF_KEY, prefs); SoundEngine.sfx('click');
      })));
      root.querySelector('[data-close]').addEventListener('click', closeModal);
    });
  }
  function openStats() {
    const max = Math.max(8, ...Object.values(S.stats));
    openModal(`
      <h3>Отношения</h3>
      ${Object.keys(STATS).map((k) => `
        <div class="stat">
          <span class="ic">${STATS[k].icon}</span><span class="nm">${STATS[k].name}</span><span class="val">${S.stats[k] || 0}</span>
          <span class="ic"></span><div class="bar"><i style="width:${((S.stats[k] || 0) / max) * 100}%"></i></div>
        </div>`).join('')}
      <div class="hint">Каждый выбор оставляет след...</div>
      <button class="menu-btn" data-close>Закрыть</button>
    `, (root) => root.querySelector('[data-close]').addEventListener('click', closeModal));
  }
  function openGameMenu() {
    openModal(`
      <h3>Меню</h3>
      <button class="menu-btn primary" data-a="resume">Продолжить чтение</button>
      <button class="menu-btn" data-a="settings">Настройки</button>
      <button class="menu-btn" data-a="seasons">Сезоны</button>
      <button class="menu-btn" data-a="title">Главное меню</button>
      <div class="hint">Прогресс сохраняется в начале каждой сцены</div>
    `, (root) => root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      SoundEngine.sfx('click');
      if (a === 'resume') closeModal();
      if (a === 'settings') openSettings();
      if (a === 'seasons') { closeModal(); stopTyping(); renderSeasons(); showScreen('seasons'); SoundEngine.setMood('title'); FXC.set('petals'); setBg(TITLE_BG); }
      if (a === 'title') toTitle();
    })));
  }

  /* ---------- события ---------- */
  $('splash').addEventListener('click', () => {
    SoundEngine.init();
    applyPrefs();
    toTitle();
  });
  $('btnStart').addEventListener('click', () => {
    SoundEngine.sfx('choose');
    if (store.get(SAVE_KEY, null) && !confirm('Начать заново? Сохранённый прогресс будет потерян.')) return;
    store.del(SAVE_KEY);
    startNew();
  });
  $('btnContinue').addEventListener('click', () => { SoundEngine.sfx('choose'); continueGame(); });
  $('btnSeasons').addEventListener('click', () => { SoundEngine.sfx('click'); renderSeasons(); showScreen('seasons'); });
  $('btnSettings').addEventListener('click', () => { SoundEngine.sfx('click'); openSettings(); });
  $('btnSeasonsBack').addEventListener('click', () => { SoundEngine.sfx('click'); toTitle(); });

  $('btnEndSeasons').addEventListener('click', () => { SoundEngine.sfx('click'); renderSeasons(); showScreen('seasons'); });
  $('btnEndMenu').addEventListener('click', () => { SoundEngine.sfx('click'); toTitle(); });
  $('btnEndRestart').addEventListener('click', () => { SoundEngine.sfx('choose'); startNew(); });

  $('btnNext').addEventListener('click', (e) => { e.stopPropagation(); next(); });
  $('btnBack').addEventListener('click', (e) => { e.stopPropagation(); goBack(); });
  $('btnMenu').addEventListener('click', (e) => { e.stopPropagation(); SoundEngine.sfx('click'); openGameMenu(); });
  $('btnStats').addEventListener('click', (e) => { e.stopPropagation(); SoundEngine.sfx('click'); openStats(); });
  $('btnHide').addEventListener('click', (e) => {
    e.stopPropagation();
    const g = $('game');
    g.classList.toggle('ui-hidden');
  });

  // тап по экрану / панели / карточке — дальше
  const tapNext = (e) => {
    if ($('game').classList.contains('ui-hidden')) { $('game').classList.remove('ui-hidden'); return; }
    next();
  };
  $('tapZone').addEventListener('click', tapNext);
  $('panel').addEventListener('click', tapNext);
  $('card').addEventListener('click', tapNext);
  $('letter').addEventListener('click', tapNext);
  $('blackout').addEventListener('click', tapNext);

  // свайп вправо — назад
  let sx = 0, sy = 0;
  $('stage').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('stage').addEventListener('touchend', (e) => {
    if (!inGame || !$('modal').classList.contains('hidden')) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50 && dx > 0 && sx < 60) goBack();
  }, { passive: true });

  // клавиатура (для ПК / VS Code Live Server)
  document.addEventListener('keydown', (e) => {
    if (!inGame || !$('modal').classList.contains('hidden')) return;
    if (['ArrowRight', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
    if (currentItem && currentItem.type === 'choice' && /^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll('.choice:not(.locked)');
      const all = document.querySelectorAll('.choice');
      const b = all[parseInt(e.key, 10) - 1];
      if (b && !b.classList.contains('locked') && btns.length) b.click();
    }
  });

  /* старт */
  applyPrefs();
  setBg(TITLE_BG, true);
  FXC.set('none');
})();
