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
  // top line is the English with words swapped for Japanese, coloured by how well "you" know them
  // (k known, s can say, u can use, e met). As in the app (shared/levels.ts, overlay/words.ts), a
  // level swaps words in by their job: 1 things (n), 2 and actions (v), 3 and describing words (a),
  // 4 and people and names (p); 5 is the whole line in the language (`all`, in its reading). Times
  // are seconds into the clip.
  const LINES = [
    { at: 2.25, en: 'This blade has a dark past.', ja: 'この剣には暗い過去がある。',
      mix: ['This', ['blade', 'ken', 'k', 'n'], ['has', 'aru', 's', 'v'], 'a', ['dark', 'kurai', 's', 'a'], ['past', 'kako', 'e', 'n'], '.'],
      all: ['Kono', ['ken', 'k'], 'ni wa', ['kurai', 's'], ['kako', 'e'], 'ga', ['aru', 's'], '.'] },
    { at: 6.8, en: 'It has shed much innocent blood.', ja: '罪のない血をたくさん流してきた。',
      mix: ['It', ['has shed', 'nagashite kita', 'e', 'v'], ['much', 'takusan', 'k', 'a'], ['innocent', 'tsumi no nai', 'e', 'a'], ['blood', 'chi', 's', 'n'], '.'],
      all: [['Tsumi no nai', 'e'], ['chi', 's'], 'o', ['takusan', 'k'], ['nagashite kita', 'e'], '.'] },
    { at: 13, en: 'You’re a fool for traveling alone, so completely unprepared.', ja: '何の準備もなく一人で旅をするなんて、ばかだ。',
      mix: ['You’re a', ['fool', 'baka', 'k', 'n'], 'for', ['traveling', 'tabi o suru', 's', 'v'], ['alone', 'hitori de', 'u', 'a'], ', so completely', ['unprepared', 'junbi mo naku', 'e', 'a'], '.'],
      all: ['Nan no', ['junbi mo naku', 'e'], ['hitori de', 'u'], ['tabi o suru', 's'], 'nante,', ['baka', 'k'], 'da.'] },
    { at: 16.75, en: 'You’re lucky your blood’s still flowing.', ja: 'まだ血が流れているだけ運がいい。',
      mix: ['You’re', ['lucky', 'un ga ii', 's', 'a'], 'your', ['blood', 'chi', 's', 'n'], 'is', ['still', 'mada', 'k', 'a'], ['flowing', 'nagarete iru', 'e', 'v'], '.'],
      all: [['Mada', 'k'], ['chi', 's'], 'ga', ['nagarete iru', 'e'], 'dake', ['un ga ii', 's'], '.'] },
    { at: 20.25, en: 'Thank you.', ja: 'ありがとう。',
      mix: [['Thank you', 'arigatou', 'u', 'v'], '.'],
      all: [['Arigatou', 'u'], '.'] },
    { at: 22.5, en: 'So…', ja: 'それで…',
      mix: [['So', 'sorede', 'k', 'p'], '…'],
      all: [['Sorede', 'k'], '…'] },
    { at: 24.4, en: 'What brings you to the land of the gatekeepers?', ja: '門番の地に何の用だ？',
      mix: [['What', 'nani', 'k', 'p'], 'brings you to the', ['land', 'chi', 'e', 'n'], 'of the', ['gatekeepers', 'monban', 'e', 'n'], '?'],
      all: [['Monban', 'e'], 'no', ['chi', 'e'], 'ni', ['nan', 'k'], 'no yō da?'] },
    { at: 30, en: 'I’m searching for someone.', ja: '人を探しているの。',
      mix: ['I’m', ['searching', 'sagashite iru', 'k', 'v'], 'for', ['someone', 'hito', 's', 'n'], '.'],
      all: [['Hito', 's'], 'o', ['sagashite iru', 'k'], 'no.'] },
    { at: 33, en: 'Someone very dear? A kindred spirit?', ja: '大切な人か？ 心の友か？',
      mix: [['Someone', 'hito', 's', 'n'], 'very', ['dear', 'taisetsu', 'e', 'a'], '? A', ['kindred spirit', 'kokoro no tomo', 'k', 'n'], '?'],
      all: [['Taisetsu na', 'e'], ['hito', 's'], 'ka?', ['Kokoro no tomo', 'k'], 'ka?'] },
    { at: 38.4, en: 'A dragon.', ja: 'ドラゴンよ。',
      mix: ['A', ['dragon', 'doragon', 'u', 'n'], '.'],
      all: [['Doragon', 'u'], 'yo.'] }
  ];
  const SWAPS = { 1: ['n'], 2: ['n', 'v'], 3: ['n', 'v', 'a'], 4: ['n', 'v', 'a', 'p'] };
  const HELD = LINES[7];

  const frame = document.querySelector('[data-frame]');
  const how = document.querySelector('.how');
  const flyer = document.querySelector('.flyer');
  const mascot = flyer?.querySelector('.duet-mascot');
  if (!frame || !how || !flyer || !mascot) { root.classList.add('js'); return; }

  const video = frame.querySelector('.scene-video');
  const lines = frame.querySelector('[data-lines]');
  const strip = frame.querySelector('.strip');
  const blob = frame.querySelector('[data-level-blob]');
  const said = frame.querySelector('[data-said]');
  const bubbles = [...frame.querySelectorAll('.bub')];
  const stripRow = frame.querySelector('.strip-row');
  const card = frame.querySelector('[data-checkpoint]');
  const challenge = card.querySelector('.challenge');
  const blank = card.querySelector('[data-blank]');
  const rightChoice = card.querySelector('[data-right]');
  const hub = frame.querySelector('.hub');
  const today = frame.querySelector('[data-today]');
  const startButton = frame.querySelector('[data-start]');
  const surface = frame.querySelector('[data-surface]');
  const session = frame.querySelector('[data-session]');
  const revealButton = frame.querySelector('[data-reveal]');
  const goodRating = frame.querySelector('[data-good]');
  const revealed = [...session.querySelectorAll('.stage-answer, .ratings')];
  let sessionOpen = false;
  const beatItems = [...document.querySelectorAll('[data-beat]:not([data-frame])')];
  const navButtons = [...document.querySelectorAll('[data-go]')];

  // The app's motion (components/motion/presets.ts): easings, and its spring drawn as a CSS
  // linear() curve, so the browser plays exactly that spring.
  const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
  const EASE_IN = 'cubic-bezier(.4,0,1,1)';
  const SNAP = 'cubic-bezier(.34,1.56,.64,1)';
  const spring = (stiffness, damping, mass) => {
    let x = 0;
    let v = 0;
    const points = [0];
    const step = 1 / 120;
    for (let t = 0; t < 2; t += step) {
      v += ((-stiffness * (x - 1) - damping * v) / mass) * step;
      x += v * step;
      points.push(+x.toFixed(4));
      if (Math.abs(x - 1) < 5e-4 && Math.abs(v) < 5e-3) break;
    }
    points[points.length - 1] = 1;
    const curve = `linear(${points.join(',')})`;
    return { duration: Math.round((points.length - 1) * step * 1000), easing: CSS.supports?.('transition-timing-function', curve) ? curve : EASE_OUT };
  };
  const SPRING = spring(520, 42, .8);

  // The line on the strip: English with words swapped in up to the level.
  // The words of a line at a level, as the app's Words.tsx writes them: one span a word, the ones
  // swapped in marked (sw) with their rung's colour, the rest plain. Drawn into the shown line's
  // spans by place, so a word that changes with the level changes colour smoothly (CSS), as in the
  // app.
  const wordsOf = (line, level) => {
    const whole = level >= 5;
    return (whole ? line.all : line.mix).map(part => {
      if (typeof part === 'string') return { text: part };
      if (whole) return { text: part[0], rung: part[1] };
      const [english, romaji, rung, job] = part;
      return SWAPS[level].includes(job) ? { text: romaji, rung } : { text: english };
    });
  };
  const drawWords = (mix, words) => {
    while (mix.children.length > words.length) mix.lastElementChild.remove();
    words.forEach((word, index) => {
      let slot = mix.children[index];
      if (!slot) {
        slot = document.createElement('span');
        slot.append(document.createElement('span'), '');
        mix.append(slot);
      }
      const [span] = slot.childNodes;
      span.className = word.rung ? `w sw ${word.rung}` : 'w';
      span.textContent = word.text;
      const next = words[index + 1];
      slot.lastChild.textContent = next && !/^[.,!?…’]/.test(next.text) ? ' ' : '';
    });
  };
  // The strip glides to its new height when its line changes size (the app's GLIDE: 0.2s, ease out).
  const glide = change => {
    const from = strip.offsetHeight;
    change();
    const to = strip.offsetHeight;
    if (still() || Math.abs(to - from) < 1) return;
    strip.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 200, easing: EASE_OUT });
  };
  let shownLine = null;
  let level = 2;
  const shownEl = () => lines.querySelector('.line:not(.is-leaving)');
  const drawLevel = () => glide(() => drawWords(shownEl().querySelector('.mix'), wordsOf(shownLine, level)));
  // A new line rises in as the last fades out (the app's fadeUp(4, 0.18), the old one popped out
  // of the layout and fading at 70% of that, easing in).
  const showLine = line => {
    if (line === shownLine) return;
    const first = !shownLine;
    shownLine = line;
    const old = shownEl();
    const fresh = old.cloneNode(true);
    fresh.querySelector('.mix').replaceChildren();
    drawWords(fresh.querySelector('.mix'), wordsOf(line, level));
    fresh.querySelector('.ja').textContent = line.ja;
    fresh.querySelector('.en').textContent = line.en;
    glide(() => {
      if (first || still()) { old.replaceWith(fresh); return; }
      old.classList.add('is-leaving');
      old.style.width = `${old.offsetWidth}px`;
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 126, easing: EASE_IN, fill: 'forwards' }).onfinish = () => old.remove();
      lines.prepend(fresh);
    });
    if (!first && !still()) fresh.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
  };
  const lineAt = time => LINES.reduce((found, line) => (line.at <= time ? line : found), LINES[LINES.length - 1]);

  // The level circle, as LevelSlider.tsx plays a swipe: pulled (stretching), pressed against the
  // side (squashing), sprung back, the old number leaving the way it was pulled and the new one
  // coming in from the other side. At either end (1 and 5) it tugs and springs back.
  const LOWEST = 1;
  let shownDigit = blob.querySelector('.level-digit');
  const HIGHEST = 5;
  const stepLevel = direction => {
    const next = Math.min(HIGHEST, Math.max(LOWEST, level + direction));
    const moved = next !== level;
    if (!still()) {
      blob.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
      if (moved) {
        blob.animate([
          { transform: 'translateX(0) scale(1, 1)', offset: 0, easing: EASE_OUT },
          { transform: `translateX(${3 * direction}px) scale(1.3, .86)`, offset: .3, easing: EASE_IN },
          { transform: `translateX(${12 * direction}px) scale(.78, 1.12)`, offset: .52, easing: SNAP },
          { transform: 'translateX(0) scale(1, 1)', offset: 1 }
        ], { duration: 480 });
      } else {
        blob.animate([
          { transform: 'translateX(0) scale(1, 1)' },
          { transform: `translateX(${4 * direction}px) scale(1.16, .92)` },
          { transform: 'translateX(0) scale(1, 1)' }
        ], { duration: 340, easing: EASE_OUT });
      }
    }
    if (!moved) return;
    level = next;
    // Only the shown number and the one leaving are ever there (quick steps cut the leaving short).
    blob.querySelectorAll('.level-digit').forEach(digit => digit !== shownDigit && digit.remove());
    const old = shownDigit;
    const digit = old.cloneNode();
    digit.textContent = String(level);
    blob.append(digit);
    shownDigit = digit;
    if (still()) old.remove();
    else {
      old.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${9 * direction}px)`, opacity: 0 }], { duration: 120, easing: EASE_IN, fill: 'forwards' });
      setTimeout(() => old.remove(), 130);
      digit.animate([{ transform: `translateX(${-9 * direction}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 180, delay: 140, easing: EASE_OUT, fill: 'backwards' });
    }
    if (shownLine) drawLevel();
  };

  // Duet: its state (the app's mascot states), and the boxes it flies to.
  // Its opening (the mark turning into Duet) plays only in the hero: on a fresh visit to the top the
  // inline script in index.html starts it before the first paint; after a refresh or Back, once the
  // page has loaded and the browser has put the scroll back, only if that is the hero.
  let opening = mascot.dataset.state === 'opening';
  let deciding = !opening;
  // At the closing Duet stays content (wasHappy, set each frame below): idle, smiling; the scene's
  // states wait.
  const setState = state => { if (!opening && (!wasHappy || state === 'idle')) mascot.dataset.state = state; };
  const endOpening = () => setTimeout(() => { opening = false; mascot.dataset.state = 'idle'; }, 2450);
  if (opening) endOpening();
  else {
    const decide = () => setTimeout(() => {
      deciding = false;
      if (!still() && scrollY <= innerHeight * .3) {
        opening = true;
        mascot.dataset.state = 'opening';
        endOpening();
      }
      mascot.style.visibility = '';
    }, 0);
    if (document.readyState === 'complete') decide();
    else addEventListener('load', decide, { once: true });
  }
  const anchor = name => document.querySelector(`[data-anchor="${name}"]`);
  const anchors = { hero: anchor('hero'), popup: anchor('popup'), panel: anchor('panel'), hub: anchor('hub'), closing: anchor('closing') };
  const BEAT_ANCHOR = ['popup', 'panel', 'popup', 'hub'];

  // Duet's voice: its own lines, said by the app's voice (media/voice). Browsers only let a page
  // play sound after the visitor has clicked, tapped or pressed a key, so until then Duet speaks
  // silently (the speaking face, for as long as the line would take). While a line plays, the mouth
  // follows its loudness as the app's does (useSpeechMouth.ts): sampled 30 times a second, eased by
  // a critically damped spring.
  const mouth = mascot.querySelector('.mouth-core');
  const clips = {};
  let sound = null;
  const unlock = () => {
    if (sound) return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(context.destination);
      sound = { context, analyser, samples: new Float32Array(256) };
      context.resume().catch(() => {});
    } catch { /* No Web Audio: Duet speaks silently. */ }
    // The line on screen was said before sound was allowed: say it now, aloud (one-line beats only;
    // Ask's answers are a conversation already moving on).
    if (sound && unheard && unheard.run === run && !unheard.name.startsWith('ask')) speak(unheard.name, 0);
    unheard = null;
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(type => window.addEventListener(type, unlock, { passive: true }));
  const clipFor = name => {
    if (!clips[name]) {
      const audio = new Audio(`./media/voice/${name}.mp3`);
      audio.preload = 'auto';
      try { sound.context.createMediaElementSource(audio).connect(sound.analyser); } catch { /* Plays without the mouth following. */ }
      clips[name] = audio;
    }
    return clips[name];
  };
  let mouthLevel = 0;
  let mouthSpeed = 0;
  let mouthTarget = 0;
  let lastSample = 0;
  let playing = null;
  const followMouth = (now, dt) => {
    if (!sound || !mouth) return;
    if (now - lastSample >= 1000 / 30) {
      lastSample = now;
      let energy = 0;
      if (playing && !playing.paused) {
        sound.analyser.getFloatTimeDomainData(sound.samples);
        for (const sample of sound.samples) energy += sample * sample;
      }
      const rms = Math.sqrt(energy / sound.samples.length);
      mouthTarget = Math.pow(clamp((rms - .008) * 6), .75);
    }
    const omega = 32;
    const offset = mouthLevel - mouthTarget;
    const impulse = mouthSpeed + omega * offset;
    const decay = Math.exp(-omega * dt);
    mouthLevel = mouthTarget + (offset + impulse * dt) * decay;
    mouthSpeed = (mouthSpeed - omega * impulse * dt) * decay;
    if (playing || mouthLevel > .002) {
      mascot.dataset.audioMouth = 'true';
      mouth.style.height = `${10 + mouthLevel * 13}px`;
      mouth.style.borderRadius = `0 0 ${50 - mouthLevel * 12}% ${50 - mouthLevel * 12}% / 0 0 ${100 - mouthLevel * 24}% ${100 - mouthLevel * 24}%`;
    } else if (mascot.dataset.audioMouth) {
      delete mascot.dataset.audioMouth;
      mouth.style.removeProperty('height');
      mouth.style.removeProperty('border-radius');
    }
  };
  let hush = () => {};
  // The last line said without sound, in which beat: said aloud once sound is allowed, if still on screen.
  let unheard = null;
  // Says a line: with sound, until it ends; silently, for `silentMs`. Resolves when done (or
  // stopped), then Duet goes back to idle.
  const speak = (name, silentMs) => new Promise(resolve => {
    hush();
    setState('speaking');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (playing === audio) playing = null;
      setState('idle');
      resolve();
    };
    let timer = 0;
    const audio = sound ? clipFor(name) : null;
    hush = () => { audio?.pause(); finish(); };
    if (audio) {
      sound.context.resume().catch(() => {});
      audio.currentTime = 0;
      audio.onended = finish;
      playing = audio;
      audio.play().catch(() => { playing = null; timer = setTimeout(finish, silentMs); });
      timer = setTimeout(finish, 15000);
    } else {
      unheard = { name, run };
      timer = setTimeout(finish, still() ? 0 : silentMs);
    }
  });

  // The checkpoint card grows up out of the strip on the app's spring, its content fading in just
  // after; it folds back the other way, content first.
  const growCard = () => {
    stripRow.classList.add('has-card');
    card.getAnimations().forEach(animation => animation.cancel());
    const height = challenge.offsetHeight + 1;
    if (still()) { card.style.height = `${height}px`; challenge.style.opacity = '1'; return; }
    card.animate([{ height: '0px' }, { height: `${height}px` }], { duration: SPRING.duration, easing: SPRING.easing, fill: 'forwards' });
    challenge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 80, easing: EASE_OUT, fill: 'forwards' });
  };
  const foldCard = () => {
    const open = stripRow.classList.contains('has-card');
    card.getAnimations().forEach(animation => animation.cancel());
    challenge.getAnimations().forEach(animation => animation.cancel());
    card.style.height = '';
    challenge.style.opacity = '';
    if (!open || still()) { stripRow.classList.remove('has-card'); return; }
    const from = card.offsetHeight || challenge.offsetHeight;
    challenge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80, fill: 'forwards' });
    card.animate([{ height: `${from}px` }, { height: '0px' }], { duration: 200, delay: 80, easing: EASE_IN }).onfinish = () => stripRow.classList.remove('has-card');
  };

  // The Today tile grows into the daily session, as the app's useSurface.ts: a solid surface covers
  // the tile (80ms), grows to fill the window by transform alone (340ms, its corners scaled the
  // other way so they keep the tile's), then thins away (200ms) under the page as it rises in (the
  // app's fadeUp(8, 0.28)).
  const FULL = { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '0px / 0px' };
  const frameOf = element => {
    const a = element.getBoundingClientRect();
    const b = hub.getBoundingClientRect();
    const x = a.width / b.width;
    const y = a.height / b.height;
    const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
    return { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${x}, ${y})`, borderRadius: `${radius / x}px / ${radius / y}px` };
  };
  const openSession = async mine => {
    sessionOpen = true;
    if (!still()) {
      const tile = frameOf(today);
      await surface.animate([{ ...tile, opacity: 0 }, { ...tile, opacity: 1 }], { duration: 80, fill: 'forwards' }).finished;
      if (mine !== run) return;
      await surface.animate([tile, FULL], { duration: 340, easing: EASE_OUT, fill: 'forwards' }).finished;
      if (mine !== run) return;
    }
    session.classList.add('is-open');
    if (still()) return;
    session.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE_OUT });
    surface.animate([{ ...FULL, opacity: 1 }, { ...FULL, opacity: 0 }], { duration: 200, fill: 'forwards' });
  };
  const closeSession = () => {
    sessionOpen = false;
    [surface, session, ...revealed].forEach(element => element.getAnimations().forEach(animation => animation.cancel()));
    session.classList.remove('is-open', 'is-revealed');
    startButton.classList.remove('is-pressed');
    revealButton.classList.remove('is-pressed');
    goodRating.classList.remove('is-picked');
  };
  // A button pressed, as a finger would: down, a moment, up.
  const press = async (button, mine) => {
    button.classList.add('is-pressed');
    await wait(200);
    if (mine === run) button.classList.remove('is-pressed');
  };

  // The beats. Each starts its own little scene; leaving it puts its pieces back.
  let beat = -1;
  let run = 0;
  let timers = [];
  let levelTimer = null;
  const later = (ms, then) => timers.push(setTimeout(then, still() ? 0 : ms));
  const wait = ms => new Promise(resolve => later(ms, resolve));
  const say = (text, ms = 500) => {
    said.classList.remove('is-on');
    if (!text) return;
    later(ms, () => { said.textContent = text; said.classList.add('is-on'); });
  };
  const reset = () => {
    run += 1;
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(levelTimer);
    levelTimer = null;
    hush();
    bubbles.forEach(bubble => bubble.classList.remove('is-on'));
    stripRow.classList.remove('is-glowing');
    foldCard();
    blank.textContent = '　　';
    blank.classList.remove('is-right');
    rightChoice.classList.remove('primary');
    frame.classList.remove('is-swiped');
    closeSession();
  };
  // Steps the level on its own, out to 5 and back to 1, until the visitor swipes it themselves.
  let autoWay = 1;
  const autoStep = () => {
    if (level >= HIGHEST) autoWay = -1;
    if (level <= LOWEST) autoWay = 1;
    stepLevel(autoWay);
  };
  const START = [
    async mine => {
      say('Orange means you know it. Swipe, and I’ll swap in more.');
      if (!still()) levelTimer = setInterval(autoStep, 1600);
      await wait(500);
      if (mine === run) speak('watch', 2400);
    },
    async mine => {
      say('');
      await wait(500);
      if (mine !== run) return;
      setState('thinking');
      await wait(600);
      if (mine !== run) return;
      bubbles[0].classList.add('is-on');
      await speak('ask-1', 3000);
      if (mine !== run) return;
      await wait(300);
      if (mine !== run) return;
      bubbles[1].classList.add('is-on');
      setState('listening');
      await wait(900);
      if (mine !== run) return;
      bubbles[2].classList.add('is-on');
      speak('ask-3', 2200);
    },
    async mine => {
      stripRow.classList.add('is-glowing');
      say('Quick one before the next scene.');
      await wait(500);
      if (mine !== run) return;
      speak('keep', 1600);
      // The card grows while Duet is still saying it.
      await wait(100);
      if (mine !== run) return;
      growCard();
      await wait(2400);
      if (mine !== run) return;
      blank.textContent = '探している';
      blank.classList.add('is-right');
      rightChoice.classList.add('primary');
      setState('success');
      await wait(1600);
      if (mine === run) setState('idle');
    },
    async mine => {
      say('');
      await wait(700);
      if (mine !== run) return;
      speak('back', 1800);
      // The session starts while Duet is still asking.
      await wait(700);
      if (mine !== run) return;
      await press(startButton, mine);
      if (mine !== run) return;
      await openSession(mine);
      await wait(1700);
      if (mine !== run) return;
      await press(revealButton, mine);
      if (mine !== run) return;
      session.classList.add('is-revealed');
      if (!still()) revealed.forEach(element => element.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT }));
      await wait(1600);
      if (mine === run) goodRating.classList.add('is-picked');
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
    if (beat > 0) {
      if (level !== 2) stepLevel(2 - level);
      showLine(HELD);
    }
    if (beat >= 0) START[beat](run);
  };
  navButtons.forEach(button => button.addEventListener('click', () => {
    const range = how.offsetHeight - innerHeight;
    scrollTo({ top: how.offsetTop + range * (Number(button.dataset.go) + .5) / 4, behavior: still() ? 'auto' : 'smooth' });
  }));

  // A real two-finger swipe on the subtitles (a trackpad, sideways) steps the level, one step a
  // swipe, as on the app's strip (wheel.ts): 40px of sideways scrolling makes a step, then the rest
  // of that swipe (and its coasting) is let go. Up and down still scroll the page.
  const STEP_PX = 40;
  const AFTER_STEP_MS = 250;
  const COASTING_MS = 120;
  let pending = 0;
  let lockedUntil = 0;
  frame.addEventListener('wheel', event => {
    if (beat !== 0) return;
    const across = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!across) return;
    event.preventDefault();
    const now = event.timeStamp;
    if (now < lockedUntil) { lockedUntil = Math.max(lockedUntil, now + COASTING_MS); return; }
    pending += event.deltaX;
    if (Math.abs(pending) < STEP_PX) return;
    const direction = Math.sign(pending);
    pending = 0;
    lockedUntil = now + AFTER_STEP_MS;
    clearInterval(levelTimer);
    levelTimer = null;
    frame.classList.add('is-swiped');
    stepLevel(direction);
  }, { passive: false });

  // In the hero, Duet calls for a click: after its opening it nudges every few seconds until it is
  // clicked or scrolled past. Clicking it (which lets the page play sound) takes you to the scene's
  // first beat, where Duet says its first line aloud.
  const heroAnchor = anchors.hero;
  let called = false;
  // Inviting: the arrow shows (still, for reduced motion); the shake only with motion.
  const inviting = () => !called && !opening && !deciding && scrollY < innerHeight * .3;
  heroAnchor?.addEventListener('pointerenter', () => flyer.classList.add('is-hovered'));
  heroAnchor?.addEventListener('pointerleave', () => flyer.classList.remove('is-hovered'));
  heroAnchor?.addEventListener('click', event => {
    event.preventDefault();
    called = true;
    flyer.classList.remove('is-calling', 'is-hovered');
    const range = how.offsetHeight - innerHeight;
    scrollTo({ top: how.offsetTop + range * .5 / 4, behavior: still() ? 'auto' : 'smooth' });
  });

  // In the hero and at the closing, Duet's eyes follow the pointer: each moves inside its socket toward it (in the
  // mascot's own units, before scaling), eased each frame; anywhere else they ease back to centre.
  const eyes = [...mascot.querySelectorAll('.eye')];
  const EYE_X = 26;
  const EYE_Y = 12;
  let pointer = null;
  const look = { x: 0, y: 0 };
  window.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; });
  const followPointer = (dt, inHero) => {
    let x = 0;
    let y = 0;
    if (inHero && pointer && !still()) {
      const box = flyer.getBoundingClientRect();
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      // Full turn about 300px away; nearer, a little less, so the eyes settle as it comes close.
      const reach = Math.min(1, Math.hypot(dx, dy) / 300);
      const angle = Math.atan2(dy, dx);
      x = Math.cos(angle) * reach;
      y = Math.sin(angle) * reach;
    }
    const k = 1 - Math.exp(-dt / .08);
    look.x += (x - look.x) * k;
    look.y += (y - look.y) * k;
    const shift = Math.abs(look.x) < .002 && Math.abs(look.y) < .002 ? '' : `${(look.x * EYE_X).toFixed(1)}px ${(look.y * EYE_Y).toFixed(1)}px`;
    eyes.forEach(eye => { eye.style.translate = shift; });
  };

  // Each frame: pick the beat from the scroll, and fly Duet toward where it should be now. Between the
  // hero and the scene, and the scene and the closing, its place is a blend of the two boxes by how
  // far you have scrolled; inside the scene it is the beat's box. It eases toward that place, so a
  // new box is a short flight and scrolling is a gentle follow.
  let wasHappy = false;
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
    if (beat <= 0 && video && !video.paused) showLine(lineAt(video.currentTime));

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

    followMouth(now, dt);
    flyer.classList.toggle('is-away', sessionOpen && out < .05);
    const invitingNow = inviting();
    flyer.classList.toggle('is-calling', invitingNow && !still());
    heroAnchor?.classList.toggle('is-calling', invitingNow);
    // At the closing ("Be first in line.") Duet is content: its idle face, still, with a smile
    // (styles.css .is-happy); as it was when it leaves.
    const happy = out > .6;
    if (happy !== wasHappy) {
      wasHappy = happy;
      flyer.classList.toggle('is-happy', happy);
      if (happy) hush();
      setState('idle');
    }
    // At rest in the hero, or at the closing ("Be first in line."): not on its way, not in the scene.
    followPointer(dt, (into < .2 && out === 0) || out > .6);
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
  showLine(lineAt(0));
  requestAnimationFrame(tick);
})();
