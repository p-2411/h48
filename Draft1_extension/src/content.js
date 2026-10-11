/* Duet — learn Spanish through what you watch.
 * Content script for youtube.com. Renders a panel beside (never over) the video.
 */
(() => {
  'use strict';
  if (window.__duetLoaded) return;
  window.__duetLoaded = true;

  const CLIPS = window.DUET_CLIPS || {};
  const LEX = window.DUET_LEXICON || {};
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

  const TYPE_NAME = { n: 'Thing', v: 'Action', a: 'Describing', p: 'People', x: 'Name', g: 'Glue', o: 'Word' };
  const TYPE_RANK = { n: 0, v: 1, a: 2, p: 3, g: 4, x: 9, o: 9 };
  const LEVELS = [
    null,
    { frac: 0.2, note: 'A few words' },
    { frac: 0.4, note: '40% Spanish' },
    { frac: 0.6, note: '60% Spanish' },
    { frac: 0.8, note: '80% Spanish' },
    { frac: 1, note: 'All Spanish' },
  ];
  // Leitner review intervals (ms) for boxes 0..5
  const INTERVALS = [0, 10 * 60e3, 24 * 3600e3, 3 * 24 * 3600e3, 7 * 24 * 3600e3, 21 * 24 * 3600e3];
  const MASTERED_BOX = 2; // from here on the word always appears in Spanish

  const DEFAULTS = { enabled: true, level: 2, guess: true, dock: 'side', collapsed: false, tab: 'script' };

  const S = {
    settings: { ...DEFAULTS },
    words: {},
    videoId: null,
    clip: null,
    mode: 'clip', // 'clip' (curated, full translation) or 'live' (any video, word-by-word)
    idx: -1,
    upcoming: -1,
    liveText: '',
    liveHistory: [],
    host: null, root: null, el: {},
    video: null,
    raf: 0,
    review: null,
  };

  /* ---------------- storage ---------------- */
  const store = chrome.storage.local;
  const load = () => new Promise(res => store.get(['settings', 'words'], d => {
    S.settings = { ...DEFAULTS, ...(d.settings || {}) };
    S.words = d.words || {};
    res();
  }));
  let lastWritten = '';
  const saveSettings = () => { lastWritten = JSON.stringify(S.settings); store.set({ settings: S.settings }); };
  const saveWords = () => store.set({ words: S.words });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings && JSON.stringify(ch.settings.newValue) !== lastWritten) {
      // change came from the toolbar popup
      const prev = S.settings;
      S.settings = { ...DEFAULTS, ...ch.settings.newValue };
      if (prev.enabled !== S.settings.enabled || prev.dock !== S.settings.dock) { unmount(); route(); }
      else if (S.root) renderAll();
    }
    if (ch.words) { S.words = ch.words.newValue || {}; if (S.root) (S.review ? renderAll() : softRefresh()); }
  });

  // Update saved-state marks and counts without rebuilding (keeps animations alive)
  function softRefresh() {
    if (!S.root) return;
    S.root.querySelectorAll('.w[data-word]').forEach(w => w.classList.toggle('saved', !!S.words[w.dataset.word]));
    const n = Object.keys(S.words).length, due = dueWords().length;
    if (S.el.pill) {
      S.el.pill.hidden = n === 0;
      S.el.pill.firstChild.textContent = due ? 'Review' : 'Practise';
      S.el.pill.lastChild.textContent = String(due || n);
    }
    if (S.el.wordsTab) S.el.wordsTab.textContent = `My words${n ? ` (${n})` : ''}`;
    if (S.settings.tab === 'words') renderList();
  }

  /* ---------------- helpers ---------------- */
  const $ = (sel, r = S.root) => r && r.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'icon') n.append(svgIcon(v));
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const wordKey = (es, en) => `${es.toLowerCase()}|${en.toLowerCase()}`;
  const clean = s => s.replace(/^[¿¡"'(\[]+|[.,!?…:;"')\]]+$/g, '');

  /* Critically damped spring (Apple: damping 1.0, response ~0.35s).
     Interruptible: always starts from the element's current animated value. */
  const springs = new WeakMap();
  function spring(el, key, to, { response = 0.35, damping = 1, apply }) {
    const bag = springs.get(el) || {}; springs.set(el, bag);
    const st = bag[key] || (bag[key] = { x: to, v: 0, raf: 0 });
    if (REDUCED.matches) { st.x = to; st.v = 0; apply(to); return; }
    cancelAnimationFrame(st.raf);
    const k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const a = -k * (st.x - to) - c * st.v;
      st.v += a * dt; st.x += st.v * dt;
      if (Math.abs(st.x - to) < 0.001 && Math.abs(st.v) < 0.01) { st.x = to; st.v = 0; apply(to); return; }
      apply(st.x); st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }
  const setSpringValue = (el, key, x) => { const bag = springs.get(el) || {}; springs.set(el, bag); bag[key] = { x, v: 0, raf: 0 }; };

  // Fade + rise + un-blur: a surface "materialising" rather than just fading
  function arrive(el, dist = 10) {
    setSpringValue(el, 'in', 0);
    spring(el, 'in', 1, {
      response: 0.42, apply: p => {
        el.style.opacity = Math.min(1, p);
        el.style.transform = `translateY(${(1 - p) * dist}px)`;
        el.style.filter = p > 0.98 ? '' : `blur(${(1 - p) * 6}px)`;
      }
    });
  }

  /* ---------------- line → tokens ---------------- */
  function boxOf(es, en) { const w = S.words[wordKey(es, en)]; return w ? w.box : -1; }

  // Decide which pairs appear in Spanish in the mixed line.
  function chooseSwaps(pairs) {
    const lvl = LEVELS[S.settings.level] || LEVELS[2];
    const cands = pairs.map((p, i) => ({ p, i })).filter(({ p }) => p.es && TYPE_RANK[p.t] < 9);
    const forced = new Set(cands.filter(({ p }) => boxOf(p.es, p.en) >= MASTERED_BOX).map(c => c.i));
    const n = Math.max(1, Math.round(cands.length * lvl.frac));
    const order = cands.slice().sort((A, B) => (TYPE_RANK[A.p.t] - TYPE_RANK[B.p.t]) || (A.i - B.i));
    const out = new Set(forced);
    for (const c of order) { if (out.size >= Math.max(n, forced.size)) break; out.add(c.i); }
    return out;
  }

  function wordSpan(text, t, key, extra = '') {
    const saved = key && S.words[key.word];
    return h('span', {
      class: `w ${extra}${saved ? ' saved' : ''}`, 'data-t': t,
      'data-k': key ? key.link : null, 'data-word': key ? key.word : null,
      'data-es': key ? key.es : null, 'data-en': key ? key.en : null,
    }, text);
  }

  function buildMix(line, li) {
    const frag = document.createDocumentFragment();
    if (S.settings.level === 5 && line.es) return buildEs(line, li);
    const sw = chooseSwaps(line.pairs);
    line.pairs.forEach((p, i) => {
      const key = p.es ? { link: `${li}:${i}`, word: wordKey(p.es, p.en), es: p.es, en: p.en } : null;
      const swapped = sw.has(i);
      let txt = swapped ? (i === 0 ? cap(p.es) : p.es) : p.en;
      frag.append(wordSpan(txt, p.t, key, swapped ? 'sw' : 'en'));
      if (p.punct) frag.append(h('span', { class: 'sep' }, p.punct));
      if (i < line.pairs.length - 1) frag.append(' ');
    });
    return frag;
  }

  function buildEs(line, li) {
    const frag = document.createDocumentFragment();
    line.es.forEach((tok, j) => {
      const p = tok.i >= 0 ? line.pairs[tok.i] : null;
      const key = p && p.es ? { link: `${li}:${tok.i}`, word: wordKey(p.es, p.en), es: p.es, en: p.en } : null;
      frag.append(wordSpan(tok.w, tok.t, key, 'sw'));
      if (tok.punct) frag.append(h('span', { class: 'sep' }, tok.punct));
      if (j < line.es.length - 1) frag.append(' ');
    });
    return frag;
  }

  function buildEn(line, li) {
    const frag = document.createDocumentFragment();
    line.pairs.forEach((p, i) => {
      const key = p.es ? { link: `${li}:${i}`, word: wordKey(p.es, p.en), es: p.es, en: p.en } : null;
      frag.append(wordSpan(p.en, p.t, key, 'en'));
      if (p.punct) frag.append(h('span', { class: 'sep' }, p.punct));
      if (i < line.pairs.length - 1) frag.append(' ');
    });
    return frag;
  }

  // Any-video mode: turn a caption string into a "line" using the starter lexicon.
  function liveLine(text) {
    const pairs = text.split(/\s+/).filter(Boolean).map(tok => {
      const m = tok.match(/^([¿¡"'(\[]*)(.*?)([.,!?…:;"')\]]*)$/);
      const core = m[2]; const hit = LEX[core.toLowerCase()];
      return hit ? { en: core, es: hit.es, t: hit.t, punct: m[3] } : { en: core, es: '', t: 'o', punct: m[3] };
    });
    return { pairs, es: null };
  }

  /* ---------------- mounting ---------------- */
  const isWatch = () => location.pathname === '/watch';
  const currentVideoId = () => new URLSearchParams(location.search).get('v');

  function unmount() {
    cancelAnimationFrame(S.raf);
    S.host?.remove(); S.host = null; S.root = null; S.el = {};
    document.querySelector('ytd-watch-flexy')?.style.removeProperty('--ytd-watch-flexy-sidebar-width');
    document.querySelector('ytd-watch-flexy')?.style.removeProperty('--ytd-watch-flexy-sidebar-min-width');
  }

  function route() {
    if (!S.settings.enabled || !isWatch()) { unmount(); return; }
    const vid = currentVideoId();
    if (vid !== S.videoId) {
      S.videoId = vid; S.clip = CLIPS[vid] || null; S.mode = S.clip ? 'clip' : 'live';
      S.idx = -1; S.upcoming = -1; S.liveText = ''; S.liveHistory = [];
      if (S.root) renderAll();
    }
    if (!S.host || !S.host.isConnected || (S.dock && S.dock !== effectiveDock())) { unmount(); mount(); }
  }

  // YouTube drops the side column on narrow windows; fall back to under the video then.
  function effectiveDock() {
    const flexy = document.querySelector('ytd-watch-flexy');
    const twoCol = flexy && flexy.hasAttribute('is-two-columns_');
    return S.settings.dock === 'side' && twoCol ? 'side' : 'below';
  }

  function mount() {
    const dock = S.dock = effectiveDock();
    const target = dock === 'below'
      ? document.querySelector('ytd-watch-flexy #below')
      : document.querySelector('ytd-watch-flexy #secondary-inner') || document.querySelector('ytd-watch-flexy #secondary');
    if (!target) return; // upkeep timer retries
    S.host?.remove();
    const host = h('div', { id: 'duet-host' });
    const root = host.attachShadow({ mode: 'open' });
    root.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('src/panel.css') }));
    target.prepend(host);
    S.host = host; S.root = root;
    if (dock === 'side') {
      const flexy = document.querySelector('ytd-watch-flexy');
      // Give the side column a little more room so the text can be big. The video resizes itself; nothing overlaps it.
      flexy?.style.setProperty('--ytd-watch-flexy-sidebar-width', '440px');
      flexy?.style.setProperty('--ytd-watch-flexy-sidebar-min-width', '380px');
    }
    buildShell();
    renderAll();
    arrive(S.el.panel, 14);
  }

  // Icons are built as DOM nodes (no innerHTML — YouTube enforces Trusted Types)
  const ICON = {
    dock: [['rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.5 }], ['path', { d: 'M10 2.5v11' }]],
    dockBelow: [['rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.5 }], ['path', { d: 'M1.5 9.5h13' }]],
    min: [['path', { d: 'M4 8h8' }]],
    close: [['path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }]],
  };
  ICON.x = ICON.close;
  function svgIcon(shapes) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' })) svg.setAttribute(k, v);
    for (const [tag, attrs] of shapes) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); svg.append(el); }
    return svg;
  }

  function buildShell() {
    const r = S.root;
    const panel = h('div', { class: 'duet', 'data-dock': S.dock });
    r.append(panel);
    S.el.panel = panel;
    applyTheme();

    panel.addEventListener('pointerover', onHover);
    panel.addEventListener('pointerout', onHoverOut);
    panel.addEventListener('click', onWordClick);
  }

  function applyTheme() {
    if (!S.el.panel) return;
    S.el.panel.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });

  /* ---------------- rendering ---------------- */
  function renderAll() {
    const p = S.el.panel; if (!p) return;
    p.dataset.dock = S.dock;
    p.classList.toggle('collapsed', !!S.settings.collapsed);
    p.replaceChildren();
    if (S.settings.collapsed) { p.append(renderMini()); return; }

    const due = dueWords();
    const nWords = Object.keys(S.words).length;

    // Header
    p.append(h('div', { class: 'bar' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, 'D'),
      h('div', { class: 'brand' }, h('b', {}, 'Duet'), h('small', {}, S.mode === 'clip' ? `English → Español · ${S.clip.title}` : 'English → Español · any video')),
      h('div', { class: 'spacer' }),
      S.el.pill = h('button', { class: 'pill', hidden: nWords === 0, title: 'Review your saved words', onclick: openReview },
        due.length ? 'Review' : 'Practise', h('span', { class: 'count' }, String(due.length || nWords))),
      h('button', { class: 'icon-btn', title: S.dock === 'side' ? 'Move under the video' : 'Move beside the video', icon: S.dock === 'side' ? ICON.dockBelow : ICON.dock, onclick: () => { S.settings.dock = S.dock === 'side' ? 'below' : 'side'; saveSettings(); unmount(); route(); } }),
      h('button', { class: 'icon-btn', title: 'Minimise', icon: ICON.min, onclick: () => { S.settings.collapsed = true; saveSettings(); renderAll(); } }),
    ));

    // Controls
    const levelSeg = segmented('level', [1, 2, 3, 4, 5].map(n => ({ v: n, label: String(n) })), S.settings.level, v => { S.settings.level = v; saveSettings(); note.textContent = LEVELS[v].note; renderNow(true); });
    const note = h('span', { class: 'level-note' }, LEVELS[S.settings.level].note);
    p.append(h('div', { class: 'controls' }, h('span', { class: 'ctl-label' }, 'Spanish'), levelSeg, note));

    // Now card
    S.el.now = h('section', { class: 'now', 'aria-live': 'polite' });
    p.append(S.el.now);

    // Legend
    p.append(h('div', { class: 'legend', 'aria-label': 'Colour key' },
      ...['n', 'v', 'a', 'p', 'x', 'g'].map(t => h('span', { 'data-t': t }, h('i'), TYPE_NAME[t]))));

    // Tabs
    const tabs = segmented('tabs', [
      { v: 'script', label: S.mode === 'clip' ? 'Script' : 'Recent lines' },
      { v: 'words', label: `My words${nWords ? ` (${nWords})` : ''}` },
    ], S.settings.tab, v => { S.settings.tab = v; saveSettings(); renderList(); });
    S.el.wordsTab = tabs.querySelectorAll('button')[1];
    p.append(h('div', { class: 'tabs-wrap' }, tabs));

    S.el.list = h('div', { class: 'list' });
    p.append(S.el.list);

    p.append(h('div', { class: 'credit' }, S.mode === 'clip'
      ? S.clip.credit
      : 'Word-by-word mode uses a 250-word starter dictionary. Curated clips get full, human translations.'));

    S.el.tip = h('div', { class: 'tip', role: 'tooltip' });
    p.append(S.el.tip);

    S.el.sheet = h('div', { class: 'sheet', hidden: true });
    p.append(S.el.sheet);

    renderNow();
    renderList();
    if (S.review) renderReview();
  }

  function renderMini() {
    return h('div', { class: 'mini', role: 'button', tabindex: '0', title: 'Show Duet',
      onclick: () => { S.settings.collapsed = false; saveSettings(); renderAll(); arrive(S.el.panel, 8); } },
      h('div', { class: 'logo' }, 'D'),
      h('div', { class: 'brand' }, h('b', {}, 'Duet'), h('small', {}, 'Tap to keep learning')));
  }

  function segmented(name, opts, value, onChange) {
    const seg = h('div', { class: `seg ${name}`, role: 'group' });
    const thumb = h('span', { class: 'thumb', 'aria-hidden': 'true' });
    seg.append(thumb);
    const btns = opts.map(o => {
      const b = h('button', { 'aria-pressed': String(o.v === value), onclick: () => select(o.v, true) }, o.label);
      b._v = o.v; seg.append(b); return b;
    });
    function place(animate) {
      const b = btns.find(x => x.getAttribute('aria-pressed') === 'true'); if (!b) return;
      const x = b.offsetLeft, w = b.offsetWidth;
      thumb.style.width = w + 'px';
      if (!animate) { setSpringValue(thumb, 'x', x); thumb.style.transform = `translateX(${x}px)`; return; }
      spring(thumb, 'x', x, { response: 0.32, apply: v => thumb.style.transform = `translateX(${v}px)` });
    }
    function select(v, user) {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b._v === v)));
      place(true);
      if (user) onChange(v);
    }
    // Re-measure whenever layout settles (stylesheet load, dock change, resize)
    new ResizeObserver(() => place(false)).observe(seg);
    return seg;
  }

  function guessSwitch() {
    const sw = h('div', { class: 'switch', role: 'switch', tabindex: '0', 'aria-checked': String(!!S.settings.guess), title: 'Blur the English so you try the Spanish first',
      onclick: () => {
        S.settings.guess = !S.settings.guess; sw.setAttribute('aria-checked', String(S.settings.guess)); saveSettings();
        const en = S.el.now.querySelector('.en-line'); en?.classList.toggle('guess', S.settings.guess);
        const hint = S.el.now.querySelector('.hint'); if (hint) hint.textContent = hintText();
      },
      onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sw.click(); } } },
      h('span', { class: 'track' }, h('span', { class: 'knob' })), 'Guess first');
    return sw;
  }
  const hintText = () => S.mode === 'live'
    ? 'Word-by-word mode. Hover a word to see its partner; click to save it.'
    : S.settings.guess
      ? 'Guess the meaning, then hover the blurred line to check. Hover any word to see its partner; click to save it.'
      : 'Hover any word to see its partner in the other language. Click to save it.';

  function renderNow(animate) {
    const box = S.el.now; if (!box) return;
    box.replaceChildren();
    box.classList.remove('upnext');

    if (S.mode === 'live') return renderLiveNow(box, animate);

    const lines = S.clip.lines;
    let li = S.idx, label = 'Now', live = true;
    if (li < 0) {
      live = false; box.classList.add('upnext');
      if (S.upcoming >= 0) { li = S.upcoming; label = 'Up next'; }
      else { li = lines.length - 1; label = 'Last line'; }
    }
    const line = lines[li];
    box.append(h('div', { class: `eyebrow${live ? ' live' : ''}` }, h('span', { class: 'dot' }), label, h('span', { class: 'time' }, `· ${fmt(line.start)}`), guessSwitch()));
    const mix = h('p', { class: 'mix', lang: 'es' }, buildMix(line, li));
    box.append(mix);
    if (S.settings.level < 5) box.append(h('p', { class: 'es-line', lang: 'es' }, h('span', { class: 'line-label' }, 'ES'), buildEs(line, li)));
    const en = h('p', { class: `en-line${S.settings.guess ? ' guess' : ''}`, lang: 'en', title: S.settings.guess ? 'Hover to check' : null }, h('span', { class: 'line-label' }, 'EN'), buildEn(line, li));
    box.append(en);
    box.append(h('div', { class: 'hint' }, hintText()));
    if (animate !== false) arrive(mix, 8);
  }

  function renderLiveNow(box, animate) {
    const ccBtn = document.querySelector('.ytp-subtitles-button');
    const ccOn = ccBtn && ccBtn.getAttribute('aria-pressed') === 'true';
    if (!S.liveText) {
      box.append(h('div', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Waiting for speech'));
      box.append(h('div', { class: 'empty', style: 'padding:10px 4px 4px' },
        h('b', {}, ccOn ? 'Captions are on — press play' : 'Turn on captions to start'),
        ccOn ? 'Duet will mix Spanish into each line as it is spoken.' : 'Duet reads the video’s captions and mixes Spanish words in, colour-coded.',
        !ccOn && ccBtn ? h('div', {}, h('button', { class: 'btn primary', onclick: () => { ccBtn.click(); setTimeout(() => renderNow(), 400); } }, 'Turn on captions')) : null,
        S.clip ? null : h('div', {}, h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { location.href = 'https://www.youtube.com/watch?v=eRsGyueVLvQ&t=100s'; } }, 'Try the full demo clip'))));
      return;
    }
    const line = liveLine(S.liveText);
    box.append(h('div', { class: 'eyebrow live' }, h('span', { class: 'dot' }), 'Now', h('span', { class: 'time' }, `· ${fmt(S.video?.currentTime || 0)}`), guessSwitch()));
    const mix = h('p', { class: 'mix', lang: 'es' }, buildMix(line, 'L'));
    box.append(mix);
    box.append(h('p', { class: `en-line${S.settings.guess ? ' guess' : ''}`, lang: 'en' }, h('span', { class: 'line-label' }, 'EN'), buildEn(line, 'L')));
    box.append(h('div', { class: 'hint' }, hintText()));
    if (animate !== false) arrive(mix, 6);
  }

  function renderList() {
    const list = S.el.list; if (!list) return;
    list.replaceChildren();
    if (S.settings.tab === 'words') return renderWords(list);
    if (S.mode === 'clip') {
      S.clip.lines.forEach((line, li) => {
        const row = h('button', { class: 'row', 'data-li': li, onclick: e => { if (e.target.closest('.w') && e.target.closest('.w').dataset.word) return; seek(line.start - 0.2); } },
          h('span', { class: 't' }, fmt(line.start)),
          h('span', {}, h('div', { class: 'r-es', lang: 'es' }, buildEs(line, `r${li}`)),
            h('div', { class: 'r-en' }, line.pairs.map(p => p.en + p.punct).join(' '))));
        list.append(row);
      });
      markActiveRow(false);
    } else {
      if (!S.liveHistory.length) { list.append(h('div', { class: 'empty' }, h('b', {}, 'Nothing yet'), 'Lines you hear will collect here so you can jump back to them.')); return; }
      S.liveHistory.slice().reverse().forEach(item => {
        const line = liveLine(item.text);
        list.append(h('button', { class: 'row', onclick: () => seek(Math.max(0, item.t - 1.5)) },
          h('span', { class: 't' }, fmt(item.t)),
          h('span', {}, h('div', { class: 'r-es' }, buildMix(line, 'h')))));
      });
    }
  }

  function renderWords(list) {
    const arr = Object.values(S.words).sort((a, b) => b.added - a.added);
    if (!arr.length) {
      list.append(h('div', { class: 'empty' }, h('b', {}, 'Your words live here'), 'Click any coloured word while you watch to save it. Duet will quiz you later — recalling a word is what makes it stick.'));
      return;
    }
    for (const w of arr) {
      list.append(h('div', { class: 'word-row', 'data-t': w.t },
        h('span', { class: 'd' }),
        h('span', {}, h('span', { class: 'es' }, w.es), h('span', { class: 'en' }, w.en)),
        h('span', { class: 'boxes', title: `Strength ${w.box}/5` }, ...[1, 2, 3, 4, 5].map(i => h('i', { class: i <= w.box ? 'on' : '' }))),
        h('button', { class: 'x', title: 'Remove', icon: ICON.x, onclick: () => { delete S.words[wordKey(w.es, w.en)]; saveWords(); } })));
    }
  }

  function markActiveRow(scroll = true) {
    const list = S.el.list; if (!list || S.mode !== 'clip' || S.settings.tab !== 'script') return;
    const cur = S.idx >= 0 ? S.idx : S.upcoming;
    list.querySelectorAll('.row').forEach(r => {
      const li = +r.dataset.li;
      r.classList.toggle('active', li === S.idx);
      r.classList.toggle('past', S.clip.lines[li].end < (S.video?.currentTime || 0));
    });
    const row = list.querySelector(`.row[data-li="${cur}"]`);
    if (row && scroll) {
      const target = row.offsetTop - list.offsetTop - list.clientHeight * 0.3;
      setSpringValue(list, 'scroll', list.scrollTop);
      spring(list, 'scroll', Math.max(0, target), { response: 0.5, apply: v => list.scrollTop = v });
    }
  }

  /* ---------------- hover linking + saving ---------------- */
  function onHover(e) {
    const w = e.target.closest?.('.w');
    if (!w || !w.dataset.k) return;
    const scope = w.closest('.now') || w.closest('.row');
    if (!scope) return;
    scope.classList.add('hovering');
    scope.querySelectorAll(`.w[data-k="${CSS.escape(w.dataset.k)}"]`).forEach(x => x.classList.add('lit'));
    // English line pairs share keys with the row-scope prefix, so link across the whole Now card
    showTip(w);
  }
  function onHoverOut(e) {
    const w = e.target.closest?.('.w');
    if (!w) return;
    const scope = w.closest('.now') || w.closest('.row');
    scope?.classList.remove('hovering');
    scope?.querySelectorAll('.lit').forEach(x => x.classList.remove('lit'));
    S.el.tip?.classList.remove('on');
  }
  function showTip(w) {
    const tip = S.el.tip; if (!tip || !w.dataset.es) return;
    const saved = !!S.words[w.dataset.word];
    tip.style.setProperty('--c', getComputedStyle(w).getPropertyValue('--c'));
    tip.replaceChildren(
      h('b', {}, w.dataset.es), ' = ', w.dataset.en,
      h('span', { class: 'kind' }, `· ${TYPE_NAME[w.dataset.t]}`),
      h('span', { class: 'act' }, saved ? 'Saved ✓ — click to remove' : 'Click to save for review'));
    const pr = S.el.panel.getBoundingClientRect(), wr = w.getBoundingClientRect();
    tip.classList.add('on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = wr.left - pr.left + wr.width / 2 - tw / 2;
    x = Math.max(8, Math.min(pr.width - tw - 8, x));
    let y = wr.top - pr.top - th - 8;
    if (y < 4) y = wr.bottom - pr.top + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  function onWordClick(e) {
    const w = e.target.closest?.('.w');
    if (!w || !w.dataset.word) return;
    e.stopPropagation(); e.preventDefault();
    const key = w.dataset.word;
    if (S.words[key]) delete S.words[key];
    else {
      const ctx = contextFor(w);
      S.words[key] = { es: w.dataset.es, en: w.dataset.en, t: w.dataset.t, box: 0, due: Date.now(), added: Date.now(), ...ctx };
    }
    // pop on press — immediate, physical feedback
    setSpringValue(w, 's', 1.18);
    spring(w, 's', 1, { response: 0.3, damping: 0.6, apply: v => w.style.transform = `scale(${v})` });
    saveWords();
  }

  function contextFor(w) {
    if (S.mode === 'clip') {
      const k = w.dataset.k || ''; const li = parseInt(k.replace(/^r/, ''), 10);
      const line = S.clip.lines[li];
      if (line) return {
        ctxEs: line.es.map(t => t.w + t.punct).join(' '),
        ctxEn: line.pairs.map(p => p.en + p.punct).join(' '),
        at: line.start, video: S.videoId,
      };
    }
    return { ctxEs: '', ctxEn: S.liveText, at: S.video?.currentTime || 0, video: S.videoId };
  }

  /* ---------------- review (active recall + spaced repetition) ---------------- */
  function dueWords() { const now = Date.now(); return Object.values(S.words).filter(w => w.due <= now); }

  function openReview() {
    let queue = dueWords();
    if (!queue.length) queue = Object.values(S.words);
    if (!queue.length) return;
    queue = queue.sort(() => Math.random() - 0.5).slice(0, 12);
    S.review = { queue, i: 0, shown: false, total: queue.length, got: 0 };
    S.video && !S.video.paused && S.video.pause();
    renderReview(true);
  }
  function closeReview() {
    const sheet = S.el.sheet;
    spring(sheet, 'y', 102, { response: 0.32, apply: v => { sheet.style.transform = `translateY(${v}%)`; if (v > 101) { sheet.hidden = true; } } });
    S.review = null;
  }
  function renderReview(enter) {
    const R = S.review, sheet = S.el.sheet; if (!R || !sheet) return;
    sheet.hidden = false;
    if (enter) { setSpringValue(sheet, 'y', 102); spring(sheet, 'y', 0, { response: 0.38, apply: v => sheet.style.transform = `translateY(${v}%)` }); }
    else sheet.style.transform = 'translateY(0%)';
    sheet.replaceChildren();
    const done = R.i >= R.queue.length;
    sheet.append(h('div', { class: 'sheet-head' },
      h('b', {}, done ? 'All done' : `${Math.min(R.i + 1, R.total)} of ${R.total}`),
      h('div', { class: 'progress' }, h('i', { style: `width:${(R.i / R.total) * 100}%` })),
      h('button', { class: 'icon-btn', title: 'Close', icon: ICON.close, onclick: closeReview })));

    if (done) {
      sheet.append(h('div', { class: 'card' }, h('div', { class: 'big', style: '--c:var(--accent)' }, '¡Bien!'),
        h('div', { class: 'ctx' }, `You remembered ${R.got} of ${R.total}. Words you know well will now show up in Spanish while you watch.`)));
      sheet.append(h('div', { class: 'sheet-foot one' }, h('button', { class: 'btn primary', onclick: () => { closeReview(); S.video?.play(); } }, 'Keep watching')));
      return;
    }
    const w = R.queue[R.i];
    const card = h('div', { class: 'card', 'data-t': w.t });
    card.append(h('div', { class: 'prompt' }, 'What does this mean?'));
    card.append(h('div', { class: 'kind' }, TYPE_NAME[w.t]));
    card.append(h('div', { class: 'big', lang: 'es' }, w.es));
    if (w.ctxEs) card.append(h('div', { class: 'ctx', lang: 'es' }, highlight(w.ctxEs, w.es)));
    if (R.shown) {
      card.append(h('div', { class: 'answer' }, h('div', { class: 'en' }, w.en), w.ctxEn ? h('div', { class: 'ctx' }, highlight(w.ctxEn, w.en)) : null));
    }
    sheet.append(card);
    arrive(card, 6);
    const foot = h('div', { class: `sheet-foot${R.shown ? '' : ' one'}` });
    if (!R.shown) foot.append(h('button', { class: 'btn primary', onclick: () => { R.shown = true; renderReview(); } }, 'Show answer'));
    else {
      foot.append(h('button', { class: 'btn', onclick: () => grade(false) }, 'Again'));
      foot.append(h('button', { class: 'btn primary', onclick: () => grade(true) }, 'Got it'));
    }
    sheet.append(foot);
  }
  function grade(ok) {
    const R = S.review; const w = R.queue[R.i];
    const key = wordKey(w.es, w.en); const rec = S.words[key];
    if (rec) {
      if (ok) { rec.box = Math.min(5, rec.box + 1); R.got++; } else { rec.box = 0; }
      rec.due = Date.now() + INTERVALS[rec.box];
    }
    R.i++; R.shown = false;
    store.set({ words: S.words }); // onChanged re-renders the panel underneath; the sheet re-renders below
  }
  function highlight(sentence, word) {
    const re = new RegExp(`(^|[^\\p{L}])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}]|$)`, 'iu');
    const m = re.exec(sentence);
    if (!m) return [sentence];
    const at = m.index + m[1].length;
    return [sentence.slice(0, at), h('mark', {}, m[2]), sentence.slice(at + m[2].length)];
  }

  /* ---------------- video sync ---------------- */
  function seek(t) { if (S.video) { S.video.currentTime = Math.max(0, t); if (S.video.paused) S.video.play(); } }

  function attachVideo() {
    const v = document.querySelector('#movie_player video') || document.querySelector('video.html5-main-video');
    if (!v || v === S.video) return;
    S.video = v;
    const kick = () => { cancelAnimationFrame(S.raf); const loop = () => { sync(); if (!v.paused) S.raf = requestAnimationFrame(loop); }; loop(); };
    v.addEventListener('play', kick);
    v.addEventListener('seeked', () => sync());
    v.addEventListener('timeupdate', () => { if (v.paused) sync(); });
    kick();
  }

  function sync() {
    if (!S.root || S.mode !== 'clip' || !S.video) return;
    const t = S.video.currentTime, lines = S.clip.lines;
    let idx = -1, up = -1;
    for (let i = 0; i < lines.length; i++) {
      if (t >= lines[i].start - 0.15 && t <= lines[i].end + 0.4) { idx = i; break; }
      if (lines[i].start > t) { up = i; break; }
    }
    if (idx !== S.idx || (idx < 0 && up !== S.upcoming)) {
      S.idx = idx; S.upcoming = up;
      if (!S.review) renderNow();
      markActiveRow(true);
    }
  }

  // Any-video mode: read YouTube's own captions as they appear
  let capObs = null;
  function watchCaptions() {
    const box = document.querySelector('#movie_player .ytp-caption-window-container') || document.querySelector('#movie_player');
    if (!box || capObs?._box === box) return;
    capObs?.disconnect();
    capObs = new MutationObserver(() => {
      if (S.mode !== 'live' || !S.root) return;
      const segs = [...document.querySelectorAll('#movie_player .ytp-caption-segment')].map(s => s.textContent.trim()).filter(Boolean);
      const text = segs.join(' ').replace(/\s+/g, ' ').trim();
      if (!text || text === S.liveText) return;
      const grew = S.liveText && text.startsWith(S.liveText.slice(0, 12));
      S.liveText = text;
      const last = S.liveHistory[S.liveHistory.length - 1];
      if (last && grew) last.text = text; else S.liveHistory.push({ text, t: S.video?.currentTime || 0 });
      if (S.liveHistory.length > 40) S.liveHistory.shift();
      if (!S.review) renderNow(!grew);
      if (S.settings.tab === 'script') renderList();
    });
    capObs._box = box;
    capObs.observe(box, { childList: true, subtree: true, characterData: true });
  }

  /* ---------------- boot ---------------- */
  load().then(() => {
    route();
    document.addEventListener('yt-navigate-finish', () => setTimeout(route, 50));
    // Upkeep: YouTube is a single-page app that re-renders freely, so re-check gently.
    setInterval(() => {
      route();
      if (S.root) { attachVideo(); watchCaptions(); }
    }, 1000);
  });
})();
