(() => {
  const root = document.documentElement;
  const toast = document.querySelector('.toast');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => motion.matches;
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  let toastTimer;

  const announce = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
  };

  // The email bars. Each sends its address to /api/join (api/join.js). Once it lands, every bar on
  // the page says you're on the list, the sticky one slides away, and the browser remembers it so
  // the bars stay that way on your next visit. Wrong addresses and failures say so in a toast.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const joinForms = [...document.querySelectorAll('.join')];
  const JOINED = 'duet-joined';
  const markJoined = (quietly = false) => {
    joinForms.forEach(form => form.classList.add('is-joined'));
    const dockBar = document.querySelector('.join-dock');
    if (dockBar) setTimeout(() => dockBar.classList.add('is-done'), quietly ? 0 : 2500);
  };
  try { if (localStorage.getItem(JOINED)) markJoined(true); } catch { /* Storage blocked: ask again. */ }
  joinForms.forEach(form => {
    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');
    const label = button?.querySelector('span');
    const original = label?.textContent;
    input?.addEventListener('input', () => delete form.dataset.invalid);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.busy !== undefined) return;
      const email = input?.value.trim() || '';
      if (!EMAIL.test(email)) {
        form.dataset.invalid = '';
        input?.focus();
        announce('Enter an email address, like you@example.com.');
        return;
      }
      form.dataset.busy = '';
      if (button) button.disabled = true;
      if (label) label.textContent = 'Joining…';
      try {
        const response = await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: form.dataset.source, website: form.querySelector('.join-trap')?.value || '' })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || String(response.status));
        try { localStorage.setItem(JOINED, '1'); } catch { /* Fine: only skips remembering. */ }
        markJoined();
        announce(result.already ? 'You’re already on the list.' : 'You’re on the list. We’ll email you when Duet is ready.');
      } catch (error) {
        if (error.message === 'email') {
          form.dataset.invalid = '';
          announce('That email doesn’t look right. Check it and try again.');
        } else {
          announce('Couldn’t add you just now. Try again in a moment.');
        }
      } finally {
        delete form.dataset.busy;
        if (button) button.disabled = false;
        if (label) label.textContent = original;
      }
    });
  });

  // The sticky email bar steps aside while another email bar (the hero's, the closing one) is on
  // screen. The header's Join button puts you in whichever email field is showing.
  const dock = document.querySelector('.join-dock');
  const heroJoin = document.querySelector('.join-hero');
  const finalJoin = document.querySelector('.join-large');
  const onScreen = new Set();
  if (dock && 'IntersectionObserver' in window) {
    const watch = new IntersectionObserver(entries => {
      entries.forEach(entry => (entry.isIntersecting ? onScreen.add(entry.target) : onScreen.delete(entry.target)));
      dock.classList.toggle('is-hidden', onScreen.size > 0);
    }, { threshold: .2 });
    [heroJoin, finalJoin].forEach(bar => bar && watch.observe(bar));
  }

  // FAQ: the answer is revealed by the item growing (and hidden by it shrinking), like a curtain.
  document.querySelectorAll('.faq details').forEach(details => {
    const summary = details.querySelector('summary');
    const answer = details.querySelector('p');
    if (!summary || !answer) return;
    const timing = { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' };
    let animation = null;
    let opens = false;
    summary.addEventListener('click', event => {
      if (still()) return;
      event.preventDefault();
      opens = animation ? !opens : !details.open;
      const from = details.getBoundingClientRect().height;
      animation?.cancel();
      details.open = true;
      details.classList.toggle('is-closing', !opens);
      details.style.overflow = 'hidden';
      const to = summary.offsetHeight + (opens ? answer.offsetHeight : 0);
      const current = details.animate({ height: [`${from}px`, `${to}px`] }, timing);
      animation = current;
      current.onfinish = () => {
        details.open = opens;
        details.classList.remove('is-closing');
        details.style.overflow = '';
        animation = null;
      };
    });
  });

  // The primary button fills from where the pointer enters and retracts toward where it leaves.
  document.querySelectorAll('.button').forEach(button => {
    const setOrigin = event => {
      const rect = button.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);
      button.style.setProperty('--mx', `${x}px`);
      button.style.setProperty('--my', `${y}px`);
      // End at the farthest corner so the visible fill uses the full transition.
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      button.style.setProperty('--fill-diameter', `${Math.ceil(radius * 2)}px`);
    };
    button.addEventListener('pointerenter', setOrigin);
    button.addEventListener('pointerleave', setOrigin);
  });
  document.querySelectorAll('[data-join-focus]').forEach(link => {
    link.addEventListener('click', event => {
      const shown = [...onScreen][0] || (dock && !dock.classList.contains('is-hidden') ? dock : finalJoin);
      const input = shown?.querySelector('input');
      if (!input) return;
      event.preventDefault();
      if (shown === finalJoin && !onScreen.has(finalJoin)) shown.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' });
      input.focus({ preventScroll: true });
    });
  });

  // ---- How it works ------------------------------------------------------------------------------
  // The scene's subtitles: the clip's lines (Sintel, 1:45–2:27) as Duet shows them in Japanese. The
  // top line is the English with words swapped for Japanese, coloured by how well "you" know them;
  // a word swaps in at its level (`lv`) or above. Times are seconds into the clip.
  const LINES = [
    { at: 2.25, en: 'This blade has a dark past.', ja: 'この剣には暗い過去がある。', mix: ['This', ['blade', 'ken', 'k', 1], 'has a', ['dark', 'kurai', 's', 2], ['past', 'kako', 'e', 3], '.'] },
    { at: 6.8, en: 'It has shed much innocent blood.', ja: '罪のない血をたくさん流してきた。', mix: ['It has shed', ['much', 'takusan', 'k', 1], 'innocent', ['blood', 'chi', 's', 2], '.'] },
    { at: 13, en: 'You’re a fool for traveling alone, so completely unprepared.', ja: '何の準備もなく一人で旅をするなんて、ばかだ。', mix: ['You’re a', ['fool', 'baka', 'k', 1], 'for', ['traveling', 'tabi o suru', 's', 2], ['alone', 'hitori de', 'u', 1], ', so completely unprepared.'] },
    { at: 16.75, en: 'You’re lucky your blood’s still flowing.', ja: 'まだ血が流れているだけ運がいい。', mix: ['You’re lucky your', ['blood', 'chi', 's', 1], 'is', ['still', 'mada', 'k', 2], 'flowing.'] },
    { at: 20.25, en: 'Thank you.', ja: 'ありがとう。', mix: [['Thank you', 'arigatou', 'u', 1], '.'] },
    { at: 22.5, en: 'So…', ja: 'それで…', mix: [['So', 'sorede', 'k', 2], '…'] },
    { at: 24.4, en: 'What brings you to the land of the gatekeepers?', ja: '門番の地に何の用だ？', mix: [['What', 'nani', 'k', 1], 'brings you to the', ['land', 'chi', 'e', 3], 'of the gatekeepers?'] },
    { at: 30, en: 'I’m searching for someone.', ja: '人を探しているの。', mix: ['I’m', ['searching', 'sagashite iru', 'k', 1], 'for', ['someone', 'hito', 's', 2], '.'] },
    { at: 33, en: 'Someone very dear? A kindred spirit?', ja: '大切な人か？ 心の友か？', mix: [['Someone', 'hito', 's', 1], 'very', ['dear', 'taisetsu', 'e', 3], '? A kindred', ['spirit', 'kokoro', 'k', 2], '?'] },
    { at: 38.4, en: 'A dragon.', ja: 'ドラゴンよ。', mix: ['A', ['dragon', 'doragon', 'u', 1], '.'] }
  ];
  // Explain and the checkpoint are about this line, so the strip holds it in those beats.
  const HELD = LINES[7];

  const frame = document.querySelector('[data-frame]');
  const how = document.querySelector('.how');
  const flyer = document.querySelector('.flyer');
  const mascot = flyer?.querySelector('.duet-mascot');
  if (!frame || !how || !flyer || !mascot) { root.classList.add('js'); return; }

  const video = frame.querySelector('.scene-video');
  const mixLine = frame.querySelector('[data-mix]');
  const jaLine = frame.querySelector('[data-ja]');
  const enLine = frame.querySelector('[data-en]');
  const lines = frame.querySelector('.lines');
  const levelBox = frame.querySelector('.level');
  const levelNumber = frame.querySelector('[data-level]');
  const said = frame.querySelector('[data-said]');
  const bubbles = [...frame.querySelectorAll('.bub')];
  const checkpoint = frame.querySelector('.checkpoint');
  const beatItems = [...document.querySelectorAll('[data-beat]:not([data-frame])')];
  const navButtons = [...document.querySelectorAll('[data-go]')];

  const drawMix = (line, level) => {
    mixLine.replaceChildren();
    line.mix.forEach((part, index) => {
      const text = typeof part === 'string' ? part : null;
      if (index > 0 && !(text && /^[.,!?…’]/.test(text))) mixLine.append(' ');
      if (text) { mixLine.append(text); return; }
      const [english, romaji, rung, from] = part;
      if (level < from) { mixLine.append(english); return; }
      const word = document.createElement('span');
      word.className = `w ${rung}`;
      word.textContent = romaji;
      mixLine.append(word);
    });
  };
  let shownLine = null;
  let shownLevel = 0;
  const showLine = (line, level) => {
    if (line === shownLine && level === shownLevel) return;
    const fresh = line !== shownLine;
    shownLine = line;
    shownLevel = level;
    levelNumber.textContent = String(level);
    if (!fresh || still()) {
      drawMix(line, level);
      jaLine.textContent = line.ja;
      enLine.textContent = line.en;
      return;
    }
    lines.classList.add('is-changing');
    setTimeout(() => {
      drawMix(shownLine, shownLevel);
      jaLine.textContent = shownLine.ja;
      enLine.textContent = shownLine.en;
      lines.classList.remove('is-changing');
    }, 180);
  };
  const lineAt = time => LINES.reduce((found, line) => (line.at <= time ? line : found), LINES[LINES.length - 1]);

  // Duet: its state (the app's mascot states), and the boxes it flies to.
  let opening = !still();
  const setState = state => { if (!opening) mascot.dataset.state = state; };
  if (opening) setTimeout(() => { opening = false; mascot.dataset.state = 'idle'; }, 2450);
  else mascot.dataset.state = 'idle';
  const anchor = name => document.querySelector(`[data-anchor="${name}"]`);
  const anchors = { hero: anchor('hero'), popup: anchor('popup'), panel: anchor('panel'), hub: anchor('hub'), closing: anchor('closing') };
  const BEAT_ANCHOR = ['popup', 'panel', 'popup', 'hub'];

  // The beats. Each starts its own little scene; leaving it puts its pieces back.
  let beat = -1;
  let timers = [];
  let levelTimer = null;
  const later = (ms, run) => timers.push(setTimeout(run, still() ? 0 : ms));
  const speak = ms => { setState('speaking'); later(ms, () => setState('idle')); };
  const say = (text, ms = 500) => {
    said.classList.remove('is-on');
    if (!text) return;
    later(ms, () => { said.textContent = text; said.classList.add('is-on'); });
  };
  const reset = () => {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(levelTimer);
    levelTimer = null;
    bubbles.forEach(bubble => bubble.classList.remove('is-on'));
    checkpoint.classList.remove('is-answered');
    levelBox.classList.remove('is-tug');
  };
  const START = [
    () => {
      say('Orange means you know it. Swipe, and I’ll swap in more.');
      later(500, () => speak(2200));
      if (still()) return;
      // The swipe: one level more every few seconds, round from 1 to 3.
      let level = 2;
      levelTimer = setInterval(() => {
        level = level >= 3 ? 1 : level + 1;
        levelBox.classList.add('is-tug');
        setTimeout(() => levelBox.classList.remove('is-tug'), 350);
        showLine(shownLine, level);
      }, 2600);
    },
    () => {
      say('');
      later(500, () => setState('thinking'));
      later(1100, () => { bubbles[0].classList.add('is-on'); speak(1800); });
      later(3000, () => { bubbles[1].classList.add('is-on'); setState('listening'); });
      later(3900, () => { bubbles[2].classList.add('is-on'); speak(1600); });
    },
    () => {
      say('Quick one before the next scene.');
      later(500, () => speak(1600));
      later(2400, () => { checkpoint.classList.add('is-answered'); setState('success'); });
      later(4000, () => setState('idle'));
    },
    () => {
      say('');
      later(700, () => speak(1500));
    }
  ];
  // Beat -1 is the scene before it is pinned: it looks like the first beat, but nothing has been
  // said yet, so Duet says its first line when you get there.
  const setBeat = next => {
    if (next === beat) return;
    beat = next;
    reset();
    const shownBeat = String(Math.max(0, beat));
    frame.dataset.beat = shownBeat;
    beatItems.forEach(item => item.classList.toggle('is-on', item.dataset.beat === shownBeat));
    navButtons.forEach(button => (button.dataset.go === shownBeat ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current')));
    if (beat > 0) showLine(HELD, 2);
    if (beat >= 0) START[beat]();
  };
  navButtons.forEach(button => button.addEventListener('click', () => {
    const range = how.offsetHeight - innerHeight;
    scrollTo({ top: how.offsetTop + range * (Number(button.dataset.go) + .5) / 4, behavior: still() ? 'auto' : 'smooth' });
  }));

  // The closing: Duet asks once when it gets there.
  const closingSaid = document.querySelector('[data-closing-said]');
  let asked = false;

  // Duet's eyes (its whole face, a little) turn toward the pointer.
  const face = mascot.querySelector('.duet-face');
  let lookX = 0;
  let lookY = 0;
  window.addEventListener('pointermove', event => {
    const box = flyer.getBoundingClientRect();
    lookX = clamp((event.clientX - (box.left + box.width / 2)) / 500, -1, 1);
    lookY = clamp((event.clientY - (box.top + box.height / 2)) / 400, -1, 1);
    if (face && !still()) face.style.translate = `${(lookX * 9).toFixed(1)}px ${(lookY * 6).toFixed(1)}px`;
  }, { passive: true });

  // Each frame: pick the beat from the scroll, and fly Duet toward where it should be now. Between the
  // hero and the scene, and the scene and the closing, its place is a blend of the two boxes by how
  // far you have scrolled; inside the scene it is the beat's box. It eases toward that place, so a
  // new box is a short flight and scrolling is a gentle follow.
  const BASE_WIDTH = 210;
  const BASE_HEIGHT = 95;
  const shown = { x: 0, y: 0, w: 0 };
  let placed = false;
  let last = performance.now();
  const ease = t => t * t * (3 - 2 * t);
  const boxOf = name => {
    const box = anchors[name]?.getBoundingClientRect();
    return box ? { x: box.left, y: box.top + box.height / 2, w: box.width } : { x: 0, y: 0, w: 0 };
  };
  const blend = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
  const tick = now => {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    const vh = innerHeight;
    const area = how.getBoundingClientRect();
    const progress = clamp(-area.top / Math.max(1, area.height - vh));
    setBeat(area.top > 0 ? -1 : Math.min(3, Math.floor(progress * 4)));
    if (beat <= 0 && video && !video.paused) showLine(lineAt(video.currentTime), shownLevel || 2);

    let target;
    const into = clamp(1 - area.top / vh);
    const out = clamp((vh - area.bottom) / (vh * .9));
    if (out > 0) target = blend(boxOf(BEAT_ANCHOR[3]), boxOf('closing'), ease(out));
    else if (into < 1) target = blend(boxOf('hero'), boxOf('popup'), ease(into));
    else target = boxOf(BEAT_ANCHOR[Math.max(0, beat)]);
    if (!placed || still()) Object.assign(shown, target);
    else {
      const k = 1 - Math.exp(-dt / .09);
      shown.x += (target.x - shown.x) * k;
      shown.y += (target.y - shown.y) * k;
      shown.w += (target.w - shown.w) * k;
    }
    placed = true;
    const scale = shown.w / BASE_WIDTH;
    flyer.style.transform = `translate3d(${shown.x.toFixed(1)}px,${(shown.y - BASE_HEIGHT * scale / 2).toFixed(1)}px,0) scale(${scale.toFixed(4)})`;

    if (!asked && out > .85 && closingSaid) {
      asked = true;
      closingSaid.classList.add('is-on');
      setState('speaking');
      setTimeout(() => setState('idle'), 1200);
    }
    requestAnimationFrame(tick);
  };

  // The clip plays only while the scene is on screen (and never for reduced motion).
  if (video && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !still()) video.play().catch(() => {});
      else video.pause();
    }, { threshold: .1 }).observe(frame);
  }

  document.body.append(flyer);
  root.classList.add('js');
  showLine(lineAt(0), 2);
  requestAnimationFrame(tick);
})();
