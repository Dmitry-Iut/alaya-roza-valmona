/* =========================================================
   Движок новеллы (сезоны I и II, ветки, перенос шкал)
   ========================================================= */
(() => {
  'use strict';

  /* ---------- настройки ---------- */
  const IMAGE_DIR = 'images/';
  const IMAGE_EXT = ['jpg', 'JPG', 'png', 'PNG', 'jpeg', 'JPEG', 'webp'];
  const PREF_KEY = 'valmont_prefs';
  const LAST_KEY = 'valmont_last_season';
  const S1_DONE = 'valmont_s1_done';
  const S1_RESULT = 'valmont_s1_result';   // шкалы первого сезона → во второй
  const S2_FORK = 'valmont_s2_fork';       // состояние перед развилкой (сцена 18)
  const S2_RESULT = 'valmont_s2_result';   // шкалы второго сезона → в третий
  const S2_DONE = 'valmont_s2_branches';   // какие ветки пройдены
  const SEASON_CFG = {
    1: { story: STORY,  save: 'valmont_s1_save', titleBg: 1 },
    2: { story: STORY2, save: 'valmont_s2_save', titleBg: 18 }
  };
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
  const freshStats = () => ({ gab: 0, adr: 0, intr: 0, dign: 0, bold: 0, pass: 0, power: 0, andr: 0 });
  const blank = (season) => ({ season: season || 1, scene: 0, branch: null, queue: [], stats: freshStats(), flags: {}, music: null, fx: 'dust' });
  let S = blank(1);
  let history = [];
  let currentItem = null;
  let typing = null;
  let busy = false;
  let inGame = false;

  const story = () => SEASON_CFG[S.season].story;
  const scene = () => story()[S.scene];

  /* ---------- картинки ---------- */
  const imgName = (n) => (typeof n === 'number' ? `scene_${n}` : String(n));
  const imgCache = {};
  function resolveImage(n) {
    const name = imgName(n);
    if (imgCache[name] !== undefined) return Promise.resolve(imgCache[name]);
    return new Promise((res) => {
      let i = 0;
      const tryNext = () => {
        if (i >= IMAGE_EXT.length) { imgCache[name] = null; return res(null); }
        const url = `${IMAGE_DIR}${name}.${IMAGE_EXT[i++]}`;
        const im = new Image();
        im.onload = () => { imgCache[name] = url; res(url); };
        im.onerror = tryNext;
        im.src = url;
      };
      tryNext();
    });
  }
  function fallbackGradient(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `radial-gradient(ellipse at 50% 35%, hsl(${h},35%,24%), hsl(${h},40%,8%) 70%, #000)`;
  }
  let bgFront = $('bgA'), bgBack = $('bgB'), bgNow = null;
  async function setBg(n, instant) {
    const name = imgName(n);
    if (bgNow === name) return;
    bgNow = name;
    const url = await resolveImage(n);
    if (bgNow !== name) return;
    const el = bgBack;
    el.style.backgroundImage = url ? `url("${url}")` : fallbackGradient(name);
    if (instant) { el.style.transition = 'none'; requestAnimationFrame(() => (el.style.transition = '')); }
    el.classList.add('show');
    bgFront.classList.remove('show');
    [bgFront, bgBack] = [bgBack, bgFront];
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
    function lightning() { flash = 1; if (!raf) loop(); }
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
    t._h = setTimeout(() => t.classList.remove('show'), ms || 2400);
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
    season: S.season, scene: S.scene, branch: S.branch, queue: S.queue.slice(),
    stats: Object.assign({}, S.stats), flags: Object.assign({}, S.flags),
    music: S.music, fx: S.fx
  });
  const restoreState = (st) => ({
    season: st.season, scene: st.scene, branch: st.branch, queue: st.queue.slice(),
    stats: Object.assign({}, st.stats), flags: Object.assign({}, st.flags), music: st.music, fx: st.fx
  });

  function buildQueue(idx) {
    const sc = story()[idx];
    let q = [];
    if (sc.pre) q = q.concat(sc.pre);
    if (sc.card) q.push({ type: 'card', top: sc.card.top, title: sc.card.title });
    return q.concat(sc.lines);
  }

  function nextSceneIdx(from) {
    const list = story();
    for (let i = from + 1; i < list.length; i++) {
      if (!list[i].branch || list[i].branch === S.branch) return i;
    }
    return -1;
  }

  function enterScene(idx) {
    S.scene = idx;
    const sc = scene();
    S.queue = buildQueue(idx);
    S.music = sc.music; S.fx = sc.fx || 'dust';
    SoundEngine.setMood(S.music);
    FXC.set(S.fx);
    setBg(sc.bg);
    updateHud();
    store.set(SEASON_CFG[S.season].save, { season: S.season, scene: idx, branch: S.branch, stats: S.stats, flags: S.flags });
    store.set(LAST_KEY, S.season);
    if (sc.fork) store.set(S2_FORK, { stats: S.stats, flags: S.flags });
    const n = nextSceneIdx(idx);
    if (n >= 0) resolveImage(story()[n].bg);
  }

  function pathInfo() {
    const list = story();
    const br = S.branch;
    const visible = list.filter((sc) => !sc.branch || sc.branch === br);
    const common = list.filter((sc) => !sc.branch).length;
    let total = visible.length;
    if (S.season === 2 && !br) total = common + 7;
    const pos = visible.indexOf(scene()) + 1;
    return { pos, total };
  }

  function updateHud() {
    const sc = scene();
    const { pos, total } = pathInfo();
    $('sceneLabel').textContent = sc.label;
    let sub = `Сцена ${pos} из ${total}`;
    if (S.season === 2) sub = (S.branch ? `«${BRANCHES[S.branch].title}» · ` : 'Сезон II · ') + `${pos} из ${total}`;
    $('sceneCount').textContent = sub;
    $('progressBar').style.width = `${(pos / total) * 100}%`;
    $('btnBack').disabled = history.length <= 1;
  }

  function flagOk(flag) {
    if (!flag) return true;
    if (typeof flag === 'function') return !!flag(S);
    if (Array.isArray(flag)) return flag.some((f) => S.flags[f]);
    if (flag.startsWith('!')) return !S.flags[flag.slice(1)];
    return !!S.flags[flag];
  }

  function dip() {
    const d = $('dip');
    d.classList.remove('run'); void d.offsetWidth; d.classList.add('run');
  }

  function advance() {
    if (busy) return;
    for (let guard = 0; guard < 500; guard++) {
      if (!S.queue.length) {
        const n = nextSceneIdx(S.scene);
        if (n >= 0) { enterScene(n); continue; }
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
        case 'dip': dip(); continue;
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
    S = restoreState(top.state);
    SoundEngine.setMood(S.music);
    FXC.set(S.fx);
    setBg(scene().bg);
    SoundEngine.sfx('click');
    display(top.item, true);
  }

  function next() {
    if (busy) return;
    if (typing) { typing.finish(); return; }
    if (!currentItem) return;
    if (currentItem.type === 'choice') {
      const head = document.querySelector('.choice-head');
      if (head) head.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
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
    if (it.type !== 'fade' && it.type !== 'end') bo.classList.remove('on', 'hard');

    const panel = $('panel');
    const plate = $('nameplate');
    const text = $('text');
    const pov = $('povTag');
    const sc = scene();

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
        panel.classList.add('gone');
        showEnding(it);
        break;
      }
      default: {
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

  const sign = (v) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  function fxLabel(fx) {
    return Object.keys(fx).filter((k) => fx[k]).map((k) => `<b class="${fx[k] < 0 ? 'neg' : ''}">${sign(fx[k])}</b> ${STATS[k].icon} ${STATS[k].name}`);
  }

  function renderChoice(it) {
    const box = $('choices');
    const head = box.querySelector('.choice-head');
    head.classList.toggle('key', !!it.major);
    $('choiceTitle').textContent = it.major ? 'Ключевой выбор' : 'Выбор';
    $('choiceSub').textContent = it.title || '';
    head.style.animation = 'none'; void head.offsetWidth; head.style.animation = '';

    const okMap = it.opts.map((o) => flagOk(o.req));
    let forced = -1;
    if (it.fallback && !okMap.some(Boolean)) {
      // ни одна ветка не открыта — открываем ветку с самой большой шкалой
      let best = -Infinity;
      it.opts.forEach((o, i) => { const v = o.score ? o.score(S) : 0; if (v > best) { best = v; forced = i; } });
      okMap[forced] = true;
    }

    const list = $('choiceList');
    list.innerHTML = '';
    it.opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      if (o.branch) b.classList.add('branch');
      b.style.animationDelay = `${0.12 + i * 0.12}s`;
      const ok = okMap[i];
      const tags = fxLabel(o.fx);
      if (o.note) tags.push(o.note);
      if (i === forced) tags.push('✦ открыто по самой сильной шкале');
      if (!ok) { b.classList.add('locked'); tags.length = 0; tags.push(`🔒 ${o.lock || 'Недоступно'}`); }
      b.innerHTML = `<span class="ct"></span>${tags.length ? `<span class="cfx">${tags.map((t) => `<span>${t}</span>`).join('')}</span>` : ''}`;
      b.querySelector('.ct').textContent = o.t;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!ok) { toast(`🔒 ${o.lock || 'Недоступно'}`); return; }
        pick(it, o, b);
      });
      list.appendChild(b);
    });
    box.classList.remove('hidden');
    box.scrollTop = 0;
  }

  function pick(choiceItem, opt, btn) {
    if (busy) return;
    busy = true;
    SoundEngine.sfx('choose');
    btn.classList.add('picked');
    document.querySelectorAll('.choice').forEach((c) => { if (c !== btn) c.classList.add('fade'); });
    Object.keys(opt.fx).forEach((k) => { S.stats[k] = (S.stats[k] || 0) + opt.fx[k]; });
    if (opt.flag) S.flags[opt.flag] = true;
    if (opt.branch) S.branch = opt.branch;
    S.flags['choice_' + choiceItem.key] = choiceItem.opts.indexOf(opt);
    const gained = Object.keys(opt.fx).filter((k) => opt.fx[k]).map((k) => `${STATS[k].icon} ${sign(opt.fx[k])} ${STATS[k].name}`);
    if (gained.length) toast(gained.join('   '));
    else if (opt.branch) toast(`✦ Ветка «${BRANCHES[opt.branch].title}»`);
    else if (opt.note) toast(opt.note);
    setTimeout(() => {
      busy = false;
      S.queue.unshift(...opt.then);
      advance();
    }, 650);
  }

  /* ---------- финалы ---------- */
  function statsChips(season) {
    return Object.keys(STATS)
      .filter((k) => (STATS[k].season || 1) <= season)
      .map((k) => `<span>${STATS[k].icon} ${STATS[k].name} ${S.stats[k] || 0}</span>`).join('');
  }

  function showEnding(it) {
    const season = it.season || S.season;
    const endItem = currentItem;
    const cfg = SEASON_CFG[season];
    store.del(cfg.save);
    if (season === 1) {
      store.set(S1_DONE, true);
      store.set(S1_RESULT, { stats: S.stats, flags: S.flags });
    } else {
      store.set(S2_RESULT, { stats: S.stats, flags: S.flags, branch: it.branch });
      const done = store.get(S2_DONE, []);
      if (!done.includes(it.branch)) done.push(it.branch);
      store.set(S2_DONE, done);
    }
    setTimeout(() => {
      if (currentItem !== endItem || !inGame) return;
      SoundEngine.sfx('bell');
    }, 600);
    setTimeout(() => {
      if (currentItem !== endItem || !inGame) return;
      SoundEngine.setMood('title');
      FXC.set('petals');
      const data = season === 1 ? S1_END : it;
      $('endKicker').textContent = season === 1 ? 'Алая роза Вальмона' : 'Сезон второй · «Три короны»';
      $('endTitle').textContent = data.title;
      $('endQuestions').innerHTML = data.questions.map((q) => `<li></li>`).join('');
      $('endQuestions').querySelectorAll('li').forEach((li, i) => { li.textContent = data.questions[i]; li.style.animationDelay = `${1 + i * 0.5}s`; });

      let path = '';
      if (season === 1) {
        const side = S.flags.sideAdrian ? 'рядом с <b>Эдрианом</b>' : S.flags.sideGabriel ? 'рядом с <b>Габриэлем</b>' : S.flags.sideSelf ? '<b>ни с кем</b> — ты не вещь' : '';
        let lead = 'Сердце разрывается <b>пополам</b>';
        if (S.stats.gab > S.stats.adr) lead = 'Сердце ближе к <b>Габриэлю</b>';
        else if (S.stats.adr > S.stats.gab) lead = 'Сердце ближе к <b>Эдриану</b>';
        path = `${lead}${side ? `<br>На рассвете ты встала ${side}` : ''}<br><small>Шкалы сохранены и перейдут во второй сезон</small>`;
      } else {
        const done = store.get(S2_DONE, []);
        path = `Твоя ветка: <b>«${BRANCHES[it.branch].title}»</b><br><small>Пройдено веток: ${done.length} из 4 · шкалы сохранены для третьего сезона</small>`;
      }
      $('endPath').innerHTML = path;
      $('endStats').innerHTML = statsChips(season);
      $('endToBe').textContent = season === 1 ? 'Продолжение следует...' : 'Продолжение — в третьем сезоне...';

      const btns = $('endButtons');
      btns.innerHTML = '';
      const add = (label, cls, fn) => {
        const b = document.createElement('button');
        b.className = 'menu-btn ' + (cls || '');
        b.textContent = label;
        b.addEventListener('click', () => { SoundEngine.sfx('click'); fn(); });
        btns.appendChild(b);
      };
      if (season === 1) {
        add('Перейти к Сезону II', 'primary', () => startSeason2());
        add('Начать заново', '', () => startSeason1());
      } else {
        add('Сезон III · в разработке', 'primary', () => toast('Сезон III ещё пишется... ✦ Скоро'));
        add('Выбрать другую ветку', '', () => replayFork());
      }
      add('Главное меню', '', () => toTitle());
      showScreen('ending');
      $('ending').scrollTop = 0;
    }, 2800);
  }

  /* ---------- запуск ---------- */
  function begin(state, idx) {
    S = state;
    history = [];
    showScreen(null);
    $('panel').classList.add('gone');
    enterScene(idx);
    advance();
  }
  function startSeason1() {
    store.del(SEASON_CFG[1].save);
    begin(blank(1), 0);
  }
  function startSeason2() {
    store.del(SEASON_CFG[2].save);
    const st = blank(2);
    const r = store.get(S1_RESULT, null);
    if (r) {
      st.stats = Object.assign(freshStats(), r.stats);
      st.flags = Object.assign({}, r.flags);
      toast('✦ Шкалы первого сезона перенесены');
    } else {
      ['gab', 'adr', 'intr', 'dign', 'bold', 'pass'].forEach((k) => (st.stats[k] = 2));
      st.flags = { sideSelf: true };
      toast('Сохранения первого сезона нет — все шкалы начинаются с 2', 3200);
    }
    // флаги веток прошлого прохождения второго сезона не переносим
    delete st.flags.andrHand;
    begin(st, 0);
  }
  function replayFork() {
    const f = store.get(S2_FORK, null);
    if (!f) return startSeason2();
    const st = blank(2);
    st.stats = Object.assign(freshStats(), f.stats);
    st.flags = Object.assign({}, f.flags);
    const idx = STORY2.findIndex((sc) => sc.fork);
    begin(st, idx);
  }
  function continueSeason(season) {
    const cfg = SEASON_CFG[season];
    const sv = store.get(cfg.save, null);
    if (!sv) return season === 2 ? startSeason2() : startSeason1();
    const st = blank(season);
    st.branch = sv.branch || null;
    st.stats = Object.assign(freshStats(), sv.stats);
    st.flags = sv.flags || {};
    begin(st, Math.min(sv.scene, cfg.story.length - 1));
  }
  const lastSave = () => {
    const last = store.get(LAST_KEY, 1);
    if (store.get(SEASON_CFG[last].save, null)) return last;
    if (store.get(SEASON_CFG[2].save, null)) return 2;
    if (store.get(SEASON_CFG[1].save, null)) return 1;
    return 0;
  };

  function toTitle() {
    closeModal();
    stopTyping();
    showScreen('title');
    const ls = lastSave();
    $('btnContinue').classList.toggle('hidden', !ls);
    $('btnContinue').textContent = ls === 2 ? 'Продолжить · Сезон II' : 'Продолжить';
    $('btnSeason2').classList.toggle('primary', !!store.get(S1_DONE, false));
    $('btnStart').classList.toggle('primary', !store.get(S1_DONE, false));
    setBg(store.get(S1_DONE, false) ? SEASON_CFG[2].titleBg : SEASON_CFG[1].titleBg);
    SoundEngine.setMood('title');
    FXC.set('petals');
  }

  /* ---------- сезоны ---------- */
  function renderSeasons() {
    const list = $('seasonList');
    list.innerHTML = '';
    SEASONS.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'season ' + s.status;
      b.style.animationDelay = `${i * 0.12}s`;
      let badge = 'В разработке';
      let meta = s.meta;
      if (s.id === 1) badge = store.get(S1_DONE, false) ? 'Пройден ✓' : (store.get(SEASON_CFG[1].save, null) ? 'В процессе' : 'Доступен');
      if (s.id === 2) {
        const done = store.get(S2_DONE, []);
        badge = done.length ? `Ветки: ${done.length} из 4` : (store.get(SEASON_CFG[2].save, null) ? 'В процессе' : 'Новый');
        if (!store.get(S1_DONE, false)) meta += ' · лучше после I сезона';
      }
      b.innerHTML = `
        <div class="s-bg"></div><div class="s-shade"></div>
        <div class="s-badge">${badge}</div>
        <div class="s-body">
          <div class="s-num">Сезон ${s.num}</div>
          <div class="s-title">${s.title}</div>
          <div class="s-meta">${meta}</div>
        </div>
        ${s.status === 'dev' ? '<div class="lock">🔒</div>' : ''}`;
      resolveImage(s.bg).then((u) => { if (u) b.querySelector('.s-bg').style.backgroundImage = `url("${u}")`; });
      b.addEventListener('click', () => {
        if (s.status !== 'open') { SoundEngine.sfx('click'); toast(`Сезон ${s.num} ещё пишется... ✦ Скоро`); return; }
        SoundEngine.sfx('choose');
        if (store.get(SEASON_CFG[s.id].save, null)) continueSeason(s.id);
        else if (s.id === 2) startSeason2();
        else startSeason1();
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
    const keys = Object.keys(STATS).filter((k) => (STATS[k].season || 1) <= S.season);
    const max = Math.max(8, ...keys.map((k) => S.stats[k] || 0));
    openModal(`
      <h3>Отношения</h3>
      ${keys.map((k) => `
        <div class="stat">
          <span class="ic">${STATS[k].icon}</span><span class="nm">${STATS[k].name}${STATS[k].season === 2 ? ' <i class="new">новая</i>' : ''}</span><span class="val">${S.stats[k] || 0}</span>
          <span class="ic"></span><div class="bar"><i style="width:${(Math.max(0, S.stats[k] || 0) / max) * 100}%"></i></div>
        </div>`).join('')}
      <div class="hint">${S.season === 2 ? 'Шкалы пригодятся в третьем сезоне...' : 'Каждый выбор оставляет след...'}</div>
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
      if (a === 'seasons') { closeModal(); stopTyping(); renderSeasons(); showScreen('seasons'); SoundEngine.setMood('title'); FXC.set('petals'); }
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
    if (store.get(SEASON_CFG[1].save, null) && !confirm('Начать первый сезон заново? Сохранённый прогресс сезона будет потерян.')) return;
    startSeason1();
  });
  $('btnSeason2').addEventListener('click', () => {
    SoundEngine.sfx('choose');
    if (store.get(SEASON_CFG[2].save, null)) continueSeason(2);
    else startSeason2();
  });
  $('btnContinue').addEventListener('click', () => { SoundEngine.sfx('choose'); continueSeason(lastSave() || 1); });
  $('btnSeasons').addEventListener('click', () => { SoundEngine.sfx('click'); renderSeasons(); showScreen('seasons'); });
  $('btnSettings').addEventListener('click', () => { SoundEngine.sfx('click'); openSettings(); });
  $('btnSeasonsBack').addEventListener('click', () => { SoundEngine.sfx('click'); toTitle(); });

  $('btnNext').addEventListener('click', (e) => { e.stopPropagation(); next(); });
  $('btnBack').addEventListener('click', (e) => { e.stopPropagation(); goBack(); });
  $('btnMenu').addEventListener('click', (e) => { e.stopPropagation(); SoundEngine.sfx('click'); openGameMenu(); });
  $('btnStats').addEventListener('click', (e) => { e.stopPropagation(); SoundEngine.sfx('click'); openStats(); });
  $('btnHide').addEventListener('click', (e) => { e.stopPropagation(); $('game').classList.toggle('ui-hidden'); });

  const tapNext = () => {
    if ($('game').classList.contains('ui-hidden')) { $('game').classList.remove('ui-hidden'); return; }
    next();
  };
  $('tapZone').addEventListener('click', tapNext);
  $('panel').addEventListener('click', tapNext);
  $('card').addEventListener('click', tapNext);
  $('letter').addEventListener('click', tapNext);
  $('blackout').addEventListener('click', tapNext);

  // свайп вправо от левого края — назад
  let sx = 0, sy = 0;
  $('stage').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('stage').addEventListener('touchend', (e) => {
    if (!inGame || !$('modal').classList.contains('hidden')) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50 && dx > 0 && sx < 60) goBack();
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (!inGame || !$('modal').classList.contains('hidden')) return;
    if (['ArrowRight', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
    if (currentItem && currentItem.type === 'choice' && /^[1-9]$/.test(e.key)) {
      const b = document.querySelectorAll('.choice')[parseInt(e.key, 10) - 1];
      if (b) b.click();
    }
  });

  /* старт */
  applyPrefs();
  setBg(store.get(S1_DONE, false) ? SEASON_CFG[2].titleBg : SEASON_CFG[1].titleBg, true);
  FXC.set('none');
})();
