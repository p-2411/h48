(() => {
  const root = document.documentElement;
  const toast = document.querySelector('.toast');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let toastTimer;
  let frame;

  const announce = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
  };

  const updateScroll = () => {
    frame = null;
    const thumb = document.querySelector('.scroll-thumb');
    if (!thumb) return;
    const height = document.documentElement.scrollHeight;
    const thumbHeight = Math.max(28, Math.min(160, window.innerHeight / height * 160));
    const progress = Math.max(0, Math.min(1, window.scrollY / Math.max(1, height - window.innerHeight)));
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${progress * (160 - thumbHeight)}px)`;
  };
  const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(updateScroll); };
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  motion.addEventListener('change', requestUpdate);

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

  // Hover (or focus) a word and its partner in the other lines lights up; the rest steps back.
  // Listeners sit on the scope, not the words, so they keep working when a panel redraws its lines.
  document.querySelectorAll('[data-pairs]').forEach(scope => {
    const light = key => {
      scope.classList.add('is-linking');
      scope.querySelectorAll('.w[data-k]').forEach(word => word.classList.toggle('is-lit', word.dataset.k === key));
    };
    const clear = () => {
      scope.classList.remove('is-linking');
      scope.querySelectorAll('.is-lit').forEach(word => word.classList.remove('is-lit'));
    };
    const wordAt = event => event.target.closest?.('.w[data-k]');
    scope.addEventListener('pointerover', event => { const word = wordAt(event); if (word) light(word.dataset.k); });
    scope.addEventListener('pointerout', event => { if (wordAt(event)) clear(); });
    scope.addEventListener('focusin', event => { const word = wordAt(event); if (word) light(word.dataset.k); });
    scope.addEventListener('focusout', clear);
  });

  // Sparks: specks in the word colours rise and fade around the heading in focus, the one
  // nearest the reader's eye line. When focus moves, the old heading's specks finish and fade
  // while the new one's fade in. Nothing runs under reduced motion or in a hidden tab.
  const SPARK_COLOURS = ['#4da3ff', '#ff9f0a', '#32d74b', '#da8fff', '#ff6482'];
  const SPARK_PAD = 40;
  const fields = [...document.querySelectorAll('h1, h2')].map(heading => {
    const canvas = document.createElement('canvas');
    canvas.className = 'sparks';
    canvas.setAttribute('aria-hidden', 'true');
    heading.append(canvas);
    return { heading, canvas, ctx: canvas.getContext('2d'), count: heading.tagName === 'H1' ? 40 : 18,
      specks: [], active: false, width: 0, height: 0, text: null };
  });
  // The text's own box inside the canvas, so specks gather where the words are, not across the column.
  const measureField = field => {
    const box = field.heading.getBoundingClientRect();
    const range = document.createRange();
    range.setStart(field.heading, 0);
    range.setEnd(field.heading, field.heading.childNodes.length - 1);
    const text = range.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    field.width = box.width + SPARK_PAD * 2;
    field.height = box.height + SPARK_PAD * 2;
    field.canvas.width = Math.round(field.width * ratio);
    field.canvas.height = Math.round(field.height * ratio);
    field.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    field.text = { x: text.left - box.left + SPARK_PAD, y: text.top - box.top + SPARK_PAD, w: text.width, h: text.height };
  };
  const newSpeck = field => {
    const { x, y, w, h } = field.text;
    return {
      x: x - 12 + Math.random() * (w + 24), y: y + Math.random() * h,
      vx: (Math.random() - .5) * .15, vy: -(.08 + Math.random() * .22),
      r: .6 + Math.random() * 1.4, life: 0, max: 200 + Math.random() * 260,
      colour: SPARK_COLOURS[Math.random() * SPARK_COLOURS.length | 0]
    };
  };
  // A heading coming into focus starts its specks at staggered moments, so they fade in rather than pop.
  const wake = field => {
    measureField(field);
    field.specks.push(...Array.from({ length: field.count }, () => {
      const speck = newSpeck(field);
      speck.life = -Math.random() * 90;
      return speck;
    }));
  };
  const sparksAllowed = () => !motion.matches && !document.hidden;
  let sparkFrame = null;
  const drawSparks = () => {
    sparkFrame = null;
    fields.forEach(field => {
      if (!field.specks.length) return;
      const { ctx } = field;
      ctx.clearRect(0, 0, field.width, field.height);
      field.specks = field.specks.filter(speck => {
        // Out of focus, specks age three times as fast, so the old heading clears in a second or two.
        speck.life += field.active ? 1 : 3;
        if (speck.life < 0) return true;
        if (speck.life >= speck.max) {
          if (!field.active) return false;
          Object.assign(speck, newSpeck(field));
        }
        speck.x += speck.vx;
        speck.y += speck.vy;
        const progress = speck.life / speck.max;
        const fade = progress < .2 ? progress / .2 : progress > .7 ? (1 - progress) / .3 : 1;
        ctx.globalAlpha = fade * .9;
        ctx.fillStyle = speck.colour;
        ctx.shadowColor = speck.colour;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
    });
    if (fields.some(field => field.specks.length)) sparkFrame = requestAnimationFrame(drawSparks);
  };
  const syncSparks = () => {
    if (!sparksAllowed()) {
      if (sparkFrame) cancelAnimationFrame(sparkFrame);
      sparkFrame = null;
      fields.forEach(field => { field.specks = []; field.active = false; field.ctx.clearRect(0, 0, field.width, field.height); });
      return;
    }
    if (!sparkFrame && fields.some(field => field.specks.length)) sparkFrame = requestAnimationFrame(drawSparks);
  };
  // Focus is the on-screen heading whose middle sits nearest 40% down the viewport.
  let focusFrame = null;
  const pickFocus = () => {
    focusFrame = null;
    if (!sparksAllowed()) { syncSparks(); return; }
    const eyeLine = innerHeight * .4;
    let focus = null;
    let nearest = Infinity;
    fields.forEach(field => {
      const rect = field.heading.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - eyeLine);
      if (distance < nearest) { focus = field; nearest = distance; }
    });
    fields.forEach(field => {
      const active = field === focus;
      if (active && !field.active) wake(field);
      field.active = active;
    });
    syncSparks();
  };
  const requestFocus = () => { if (!focusFrame) focusFrame = requestAnimationFrame(pickFocus); };
  if (fields.length) {
    window.addEventListener('scroll', requestFocus, { passive: true });
    window.addEventListener('resize', () => {
      fields.forEach(field => { if (field.specks.length) measureField(field); });
      requestFocus();
    });
    document.addEventListener('visibilitychange', requestFocus);
    motion.addEventListener('change', requestFocus);
    document.fonts?.ready.then(() => fields.forEach(field => { if (field.specks.length) measureField(field); }));
    requestFocus();
  }

  // The hero's video: a muted scene from Sintel (an open film, CC BY) plays inside the frame, and
  // the Duet panel beside it follows the film line by line. The player reports its time over
  // postMessage; the scene loops between SINTEL.from and SINTEL.to. Without the player (blocked,
  // reduced motion, offline) the drawn still and the first line stay in place.
  const heroWatch = document.querySelector('.hero-demo .watch');
  const heroScreen = heroWatch?.querySelector('.video-still');
  const heroPanel = heroWatch?.querySelector('.panel');
  const film = window.SINTEL;
  if (heroScreen && heroPanel && film?.lines?.length) {
    const PLAYER = 'https://www.youtube-nocookie.com';
    const clock = heroPanel.querySelector('.eyebrow');
    const mixLine = heroPanel.querySelector('.mix');
    const esLine = heroPanel.querySelector('.es-line');
    const enLine = heroPanel.querySelector('.en-line');
    const timeLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const word = (text, type, key) => {
      const element = document.createElement('span');
      element.className = 'w';
      element.dataset.t = type;
      if (key !== undefined && key >= 0) element.dataset.k = String(key);
      element.textContent = text;
      return element;
    };
    // Lay a line out in three rows: English with its things and actions swapped into Spanish,
    // the full Spanish line, and the English line.
    const showLine = line => {
      const mix = [];
      const en = [];
      line.pairs.forEach(([english, punct, spanish, type], index) => {
        const swap = spanish && (type === 'n' || type === 'v');
        const mixed = word(swap ? spanish : english, type, index);
        if (swap) mixed.classList.add('sw');
        mix.push(mixed, punct + ' ');
        en.push(word(english, type, index), punct + ' ');
      });
      const es = line.es.flatMap(([text, index, type, punct]) => [word(text, type, index), punct + ' ']);
      mixLine.replaceChildren(...mix);
      esLine.replaceChildren(...es);
      enLine.replaceChildren(...en);
    };
    // The script tab: every line of the scene, the one being spoken highlighted and kept in view.
    const script = heroPanel.querySelector('[data-script]');
    const rows = film.lines.map(line => {
      const row = document.createElement('li');
      const time = document.createElement('time');
      time.textContent = timeLabel(line.start);
      const text = document.createElement('div');
      line.es.forEach(([word_, index, type, punct]) => text.append(word(word_, type), punct + ' '));
      const english = document.createElement('span');
      english.className = 'en';
      english.textContent = line.pairs.map(([en, punct]) => en + punct).join(' ');
      text.append(english);
      row.append(time, text);
      return row;
    });
    script?.replaceChildren(...rows);
    let shown = null;
    const showAt = seconds => {
      const line = [...film.lines].reverse().find(item => item.start <= seconds + .2) || film.lines[0];
      clock.lastChild.textContent = `Now · ${timeLabel(seconds)}`;
      if (line === shown) return;
      shown = line;
      showLine(line);
      const index = film.lines.indexOf(line);
      rows.forEach((row, at) => row.classList.toggle('is-now', at === index));
      if (script && rows[index]) script.scrollTo({ top: Math.max(0, rows[index].offsetTop - script.offsetTop - 4), behavior: motion.matches ? 'auto' : 'smooth' });
    };
    // The eyebrow's text node after the live dot carries the time.
    clock.replaceChildren(clock.querySelector('.live-dot'), document.createTextNode(''));
    showAt(film.lines[0].start);

    const quiet = motion.matches || navigator.connection?.saveData;
    if (!quiet) {
      const player = document.createElement('iframe');
      const query = new URLSearchParams({
        autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0,
        playsinline: 1, start: film.from, enablejsapi: 1, origin: location.origin
      });
      player.src = `${PLAYER}/embed/${film.videoId}?${query}`;
      player.className = 'hero-player';
      player.title = 'Sintel, playing muted';
      player.allow = 'autoplay; encrypted-media';
      player.tabIndex = -1;
      player.setAttribute('aria-hidden', 'true');
      const send = (func, args = []) => player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), PLAYER);
      player.addEventListener('load', () => {
        player.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'duet-hero', channel: 'widget' }), PLAYER);
      });
      window.addEventListener('message', event => {
        if (event.origin !== PLAYER || event.source !== player.contentWindow) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        const seconds = message?.info?.currentTime;
        if (typeof seconds !== 'number') return;
        heroWatch.classList.add('is-live');
        if (seconds >= film.to || seconds < film.from - 1) { send('seekTo', [film.from, true]); return; }
        showAt(seconds);
      });
      // Pause while the hero is off screen; play again when it returns.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          send(entries.some(entry => entry.isIntersecting) ? 'playVideo' : 'pauseVideo');
        }).observe(heroScreen);
      }
      heroScreen.prepend(player);
    }
  }

  // Hero parallax, on wide screens with motion allowed: the video frame behind the heading drifts
  // down at under half the scroll speed and fades, and the heading eases up and fades a little
  // faster, so the hero recedes while the next heading rises into its place.
  const hero = document.querySelector('.hero');
  const heroDemo = hero?.querySelector('.hero-demo');
  const heroText = hero ? [hero.querySelector('h1'), hero.querySelector('.hero-copy')].filter(Boolean) : [];
  if (hero && heroDemo) {
    const heroWide = matchMedia('(min-width: 901px)');
    let heroFrame = null;
    const clearHero = () => [heroDemo, ...heroText].forEach(element => { element.style.transform = ''; element.style.opacity = ''; });
    const updateHero = () => {
      heroFrame = null;
      if (!heroWide.matches || motion.matches) { clearHero(); return; }
      const y = Math.min(Math.max(0, scrollY), innerHeight * 1.5);
      const fade = Math.min(1, y / (innerHeight * .6));
      heroDemo.style.transform = `translate3d(0,${y * .45}px,0)`;
      heroDemo.style.opacity = .6 * (1 - fade);
      heroText.forEach(element => {
        element.style.transform = `translate3d(0,${y * .2}px,0)`;
        element.style.opacity = Math.max(0, 1 - fade * 1.15);
      });
    };
    const requestHero = () => { if (!heroFrame) heroFrame = requestAnimationFrame(updateHero); };
    window.addEventListener('scroll', requestHero, { passive: true });
    window.addEventListener('resize', requestHero);
    heroWide.addEventListener('change', requestHero);
    motion.addEventListener('change', requestHero);
    updateHero();
  }

  // Steppers (the problems, then the fixes): a numbered list beside one stage. Picking an item shows
  // its pane; a pane plays (its parts arrive on their delays) once it is on screen. On narrow screens
  // the panes stack and each plays as it comes into view. Under reduced motion everything shows.
  //
  // On wide screens with motion allowed the section pins: its track is taller than the screen and
  // the stage sticks while you scroll through it. The heading slides up from the bottom of the screen
  // to the centre, then on up to the top while the list and stage rise in under it (the intro). The
  // rest of the track is one equal stretch per item: the shown item's bar fills across its stretch,
  // and a snap point in the middle of each lets a flick land on the next item. Picking an item by hand
  // holds until the scroll crosses into another stretch.
  const narrowSteppers = matchMedia('(max-width: 900px)');
  const roomySteppers = matchMedia('(min-width: 901px) and (min-height: 600px)');
  const ease = t => t * t * (3 - 2 * t);
  const span = (p, from, to) => Math.min(1, Math.max(0, (p - from) / (to - from)));
  document.querySelectorAll('.stepper').forEach(section => {
    const box = section.querySelector('[data-stepper]');
    const track = section.querySelector('.stepper-track');
    const stage = section.querySelector('.stepper-stage');
    const heading = section.querySelector('h2');
    if (!box || !track || !stage || !heading) return;
    const items = [...box.querySelectorAll('.stepper-item')];
    const panes = [...box.querySelectorAll('.stepper-pane')];
    const bars = items.map(item => item.querySelector('.step-progress'));
    const seen = panes.map(() => false);
    let active = 0;

    const play = index => {
      const pane = panes[index];
      if (!pane || pane.classList.contains('is-playing')) return;
      requestAnimationFrame(() => requestAnimationFrame(() => pane.classList.add('is-playing')));
    };
    const shouldPlay = index => seen[index] && (narrowSteppers.matches || index === active);
    const showStep = index => {
      if (index === active || !panes[index]) return;
      const previous = panes[active];
      active = index;
      items.forEach((item, at) => {
        item.classList.toggle('is-on', at === index);
        item.querySelector('button')?.setAttribute('aria-pressed', String(at === index));
      });
      panes.forEach((pane, at) => {
        pane.classList.toggle('is-on', at === index);
        pane.setAttribute('aria-hidden', String(at !== index));
      });
      // The outgoing pane resets once it has faded, so it plays again from the start next time.
      setTimeout(() => { if (!previous.classList.contains('is-on')) previous.classList.remove('is-playing'); }, 450);
      if (shouldPlay(index)) play(index);
    };
    items.forEach((item, index) => item.querySelector('button')?.addEventListener('click', () => showStep(index)));
    const setLayout = () => {
      box.classList.toggle('is-animated', !motion.matches);
      // Stacked panes are all readable; side by side, only the shown one is.
      panes.forEach((pane, at) => pane.setAttribute('aria-hidden', String(!narrowSteppers.matches && at !== active)));
      panes.forEach((pane, at) => { if (shouldPlay(at)) play(at); });
    };
    if ('IntersectionObserver' in window) {
      const watcher = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const index = panes.indexOf(entry.target);
          seen[index] = true;
          if (shouldPlay(index)) play(index);
        });
      }, { threshold: .6 });
      panes.forEach(pane => watcher.observe(pane));
    } else {
      seen.fill(true);
    }
    narrowSteppers.addEventListener('change', setLayout);
    motion.addEventListener('change', setLayout);
    setLayout();

    // The pinned scene. The intro takes a fixed share of the scroll; each item gets its own stretch.
    track.style.setProperty('--steps', panes.length);
    const INTRO_VH = 34;
    const ITEM_VH = 29;
    const intro = INTRO_VH / (INTRO_VH + ITEM_VH * panes.length);
    const stretch = (1 - intro) / panes.length;
    const STEPS = panes.map((_, index) => [intro + index * stretch, intro + (index + 1) * stretch]);
    const snaps = STEPS.map(() => {
      const point = document.createElement('span');
      point.className = 'step-snap';
      point.setAttribute('aria-hidden', 'true');
      track.append(point);
      return point;
    });
    let shift = 0;
    let frame = null;
    let scrolledStep = 0;
    const isScrolly = () => section.classList.contains('is-scrolly');
    const clear = () => [heading, box].forEach(element => { element.style.transform = ''; element.style.opacity = ''; });
    // How far the heading's resting place sits above the stage's centre, and where the snap points go.
    const measure = () => {
      clear();
      const area = stage.getBoundingClientRect();
      const title = heading.getBoundingClientRect();
      shift = area.top + area.height / 2 - (title.top + title.height / 2);
      // The page snaps a point to the scroll padding at the top, so offset each by that padding.
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const distance = track.offsetHeight - innerHeight;
      snaps.forEach((point, index) => { point.style.top = `${(STEPS[index][0] + STEPS[index][1]) / 2 * distance + padding}px`; });
    };
    const update = () => {
      frame = null;
      if (!isScrolly()) return;
      const rect = track.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
      const settling = ease(span(p, 0, intro));
      const rise = ease(span(p, intro * .18, intro));
      heading.style.transform = `translateY(${shift * (1 - settling)}px)`;
      box.style.transform = `translateY(${(1 - rise) * 60}vh)`;
      box.style.opacity = rise;
      const step = Math.max(0, STEPS.findIndex(([, end]) => p < end));
      const current = p >= 1 ? panes.length - 1 : step;
      if (current !== scrolledStep) { scrolledStep = current; showStep(current); }
      bars.forEach((bar, index) => bar?.style.setProperty('--progress', index === current ? span(p, ...STEPS[index]).toFixed(3) : 0));
    };
    const requestScene = () => { if (!frame) frame = requestAnimationFrame(update); };
    const setMode = () => {
      const on = roomySteppers.matches && !motion.matches;
      section.classList.toggle('is-scrolly', on);
      if (!on) { clear(); bars.forEach(bar => bar?.style.removeProperty('--progress')); return; }
      measure();
      update();
    };
    window.addEventListener('scroll', requestScene, { passive: true });
    window.addEventListener('resize', setMode);
    roomySteppers.addEventListener('change', setMode);
    motion.addEventListener('change', setMode);
    document.fonts?.ready.then(setMode);
    setMode();
  });

  // The sticky email bar steps aside while the final sign-up section is on screen. The header's
  // Join button puts you in whichever email field is showing.
  const dock = document.querySelector('.join-dock');
  const finalJoin = document.querySelector('.join-large');
  if (dock && finalJoin && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      dock.classList.toggle('is-hidden', entries.some(entry => entry.isIntersecting));
    }, { threshold: .2 }).observe(finalJoin.closest('section') || finalJoin);
  }
  document.querySelectorAll('[data-join-focus]').forEach(link => {
    link.addEventListener('click', event => {
      const form = dock && !dock.classList.contains('is-hidden') ? dock : finalJoin;
      const input = form?.querySelector('input');
      if (!input) return;
      event.preventDefault();
      if (form === finalJoin) form.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: 'center' });
      input.focus({ preventScroll: true });
    });
  });

  // FAQ: the answer is revealed by the item growing (and hidden by it shrinking), like a
  // curtain. Opening pushes the page down with the item's bottom edge so the edge holds its
  // place on screen; closing winds that scroll back.
  document.querySelectorAll('.faq details').forEach(details => {
    const summary = details.querySelector('summary');
    const answer = details.querySelector('p');
    if (!summary || !answer) return;
    const timing = { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' };
    const margin = 24;
    let animation = null;
    let opening = false;
    let opened = null;
    summary.addEventListener('click', event => {
      if (motion.matches) return;
      event.preventDefault();
      opening = animation ? !opening : !details.open;
      const rect = details.getBoundingClientRect();
      const from = rect.height;
      animation?.cancel();
      details.open = true;
      details.classList.toggle('is-closing', !opening);
      details.style.overflow = 'hidden';
      details.style.height = `${from}px`;
      const borders = details.offsetHeight - details.clientHeight;
      const to = borders + summary.offsetHeight + (opening ? answer.offsetHeight : 0);
      const current = details.animate({ height: [`${from}px`, `${to}px`] }, timing);
      animation = current;
      // The bottom edge's distance from the viewport bottom eases from `gap` to `goal` with
      // the height. Each frame corrects the measured position, so the browser clamping the
      // scroll at the end of the page is absorbed rather than doubled.
      const gap = innerHeight - rect.bottom;
      let goal = gap;
      if (opening) {
        opened ??= { before: gap, after: gap < 0 ? margin : gap };
        goal = opened.after;
      } else if (opened && Math.abs(gap - opened.after) < 1) goal = opened.before;
      const push = () => {
        const now = details.getBoundingClientRect();
        const progress = to === from ? 1 : Math.min(1, (now.height - from) / (to - from));
        const drift = now.bottom + gap + (goal - gap) * progress - innerHeight;
        if (Math.abs(drift) >= .5) scrollBy({ top: drift, behavior: 'instant' });
      };
      current.onfinish = () => {
        details.open = opening;
        details.classList.remove('is-closing');
        details.style.overflow = '';
        details.style.height = '';
        animation = null;
        push();
        if (!opening) opened = null;
      };
      const follow = () => {
        if (animation !== current) return;
        push();
        requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    });
  });

  // The primary button fills from where the pointer enters and retracts toward where it leaves.
  document.querySelectorAll('.button').forEach(button => {
    const setOrigin = event => {
      const rect = button.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      button.style.setProperty('--mx', `${x}px`);
      button.style.setProperty('--my', `${y}px`);
      // End at the farthest corner so the visible fill uses the full transition.
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      button.style.setProperty('--fill-diameter', `${Math.ceil(radius * 2)}px`);
    };
    button.addEventListener('pointerenter', setOrigin);
    button.addEventListener('pointerleave', setOrigin);
  });

  // Keep body copy and secondary controls readable beneath a solid cursor.
  const blend = document.querySelector('.cursor-blend');
  const solid = document.querySelector('.cursor-solid');
  if (matchMedia('(pointer: fine)').matches && blend && solid) {
    root.classList.add('cursor-hidden');
    const blendPath = blend.querySelector('path');
    const solidPath = solid.querySelector('path');
    const solidTargets = 'p, input, .nav-secondary, .faq summary, .footer-inner, .legend h3';
    const blendTargets = '.faq summary>span';
    let lastMode = null;
    const setMode = mode => {
      if (mode === lastMode) return;
      blendPath.style.fill = mode === 'blend' ? '#fff' : 'transparent';
      solidPath.style.fill = mode === 'blend' ? 'transparent' : '#fff';
      lastMode = mode;
    };
    const updateMode = event => {
      const target = event.target;
      setMode(target?.closest?.(solidTargets) && !target.closest(blendTargets) ? 'solid' : 'blend');
    };
    // pointerrawupdate fires at the input device's rate, ahead of the frame-aligned pointermove.
    const follow = event => {
      const shift = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
      blend.style.transform = shift;
      solid.style.transform = shift;
      updateMode(event);
    };
    window.addEventListener('pointerover', updateMode, { passive: true });
    window.addEventListener('onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove', follow, { passive: true });
  }

  root.classList.add('js');
  requestUpdate();
})();
