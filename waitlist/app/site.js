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

  // The email bar. Design only for now: nothing is sent or stored; the reader gets a toast.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  document.querySelectorAll('.join').forEach(form => {
    const input = form.querySelector('input[type="email"]');
    input?.addEventListener('input', () => delete form.dataset.invalid);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!input || !EMAIL.test(input.value.trim())) {
        form.dataset.invalid = '';
        input?.focus();
        announce('Enter an email address, like you@example.com.');
        return;
      }
      announce('Thanks. Sign-ups open soon.');
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

  // Living illustrations. Each scene is a short script over the same three lines. A scene plays
  // while it is on screen and the tab is visible; under reduced motion it shows a still instead.
  // Lines are written as "{word|type}", where type is the word's job (n, v, a, p, x or g).
  const SCENE_LINES = [
    { time: '0:12', es: '¿{Dónde|p} {dejaste|v} {las|g} {llaves|n}?', en: '{Where|p} {did|g} {you|p} {leave|v} {the|g} {keys|n}?', save: 'llaves', meaning: 'keys' },
    { time: '0:15', es: '{Mi|p} {hermana|n} {vive|v} {en|g} {Madrid|x}.', en: '{My|p} {sister|n} {lives|v} {in|g} {Madrid|x}.', save: 'hermana', meaning: 'sister' },
    { time: '0:19', es: '{La|g} {noche|n} {está|v} {muy|g} {tranquila|a}.', en: '{The|g} {night|n} {is|v} {very|g} {quiet|a}.', save: 'tranquila', meaning: 'quiet' }
  ];
  const WORD = /\{([^|}]+)\|(\w)\}/g;
  const tokensOf = line => {
    const tokens = [];
    let last = 0;
    for (const match of line.matchAll(WORD)) {
      if (match.index > last) tokens.push(line.slice(last, match.index));
      tokens.push({ text: match[1], type: match[2] });
      last = match.index + match[0].length;
    }
    if (last < line.length) tokens.push(line.slice(last));
    return tokens;
  };
  const wordNode = ({ text, type }) => {
    const word = document.createElement('span');
    word.className = 'w';
    word.dataset.t = type;
    word.textContent = text;
    return word;
  };
  const fill = (element, line) => element.replaceChildren(...tokensOf(line).map(token =>
    typeof token === 'string' ? document.createTextNode(token) : wordNode(token)));
  const make = (tag, className) => Object.assign(document.createElement(tag), { className });
  const STOPPED = Symbol('stopped');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  // The cursor's tip lands at a point inside `target`, given as fractions of its box.
  const pointAt = (stage, cursor, target, fx = .5, fy = .7) => {
    const area = stage.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    cursor.style.transform = `translate(${box.left - area.left + box.width * fx}px,${box.top - area.top + box.height * fy}px)`;
  };
  const restCursor = (stage, cursor) => {
    cursor.style.transform = `translate(${stage.clientWidth - 40}px,${stage.clientHeight - 30}px)`;
  };
  const subtitleRow = (line, waiting) => {
    const row = make('div', 'scene-row');
    const es = make('p', 'es-line');
    es.lang = 'es';
    const en = make('p', waiting ? 'en-line is-waiting' : 'en-line');
    fill(en, line.en);
    row.append(es, en);
    return { row, es, en };
  };
  const wordRow = line => {
    const word = tokensOf(line.es).find(token => token.text === line.save);
    const row = document.createElement('li');
    row.dataset.t = word.type;
    const name = wordNode(word);
    row.append(make('i', ''), name, Object.assign(make('span', ''), { textContent: line.meaning }));
    return row;
  };
  const showCard = (stage, line) => {
    const word = tokensOf(line.es).find(token => token.text === line.save);
    stage.querySelector('[data-front]').replaceChildren(wordNode(word));
    stage.querySelector('[data-back]').textContent = line.meaning;
    fill(stage.querySelector('[data-context]'), line.es);
  };

  const SCENES = {
    subtitles: {
      still(stage) {
        const rows = stage.querySelector('.scene-rows');
        rows.replaceChildren(...SCENE_LINES.map((line, index) => {
          const { row, es } = subtitleRow(line, false);
          fill(es, line.es);
          if (index < SCENE_LINES.length - 1) row.classList.add('is-past');
          return row;
        }));
        stage.querySelector('[data-clock]').textContent = SCENE_LINES.at(-1).time;
      },
      async play(stage, pause) {
        const rows = stage.querySelector('.scene-rows');
        const clock = stage.querySelector('[data-clock]');
        rows.replaceChildren();
        for (let index = 0; ; index = (index + 1) % SCENE_LINES.length) {
          const line = SCENE_LINES[index];
          clock.textContent = line.time;
          rows.querySelectorAll('.scene-row').forEach(row => row.classList.add('is-past'));
          while (rows.children.length >= 3) rows.firstElementChild.remove();
          const { row, es, en } = subtitleRow(line, true);
          rows.append(row);
          // Words arrive one at a time, white, then settle into their colour.
          for (const token of tokensOf(line.es)) {
            if (typeof token === 'string') { es.append(token); continue; }
            const word = wordNode(token);
            word.classList.add('is-arriving');
            es.append(word);
            requestAnimationFrame(() => requestAnimationFrame(() => word.classList.remove('is-arriving')));
            await pause(180);
          }
          await pause(350);
          en.classList.remove('is-waiting');
          await pause(2400);
        }
      }
    },
    guess: {
      still(stage) {
        fill(stage.querySelector('[data-es]'), SCENE_LINES[0].es);
        fill(stage.querySelector('[data-en]'), SCENE_LINES[0].en);
        stage.querySelector('[data-clock]').textContent = SCENE_LINES[0].time;
      },
      async play(stage, pause) {
        const body = stage.querySelector('.scene-line');
        const es = stage.querySelector('[data-es]');
        const en = stage.querySelector('[data-en]');
        const clock = stage.querySelector('[data-clock]');
        const cursor = stage.querySelector('.scene-cursor');
        restCursor(stage, cursor);
        for (let index = 0; ; index = (index + 1) % SCENE_LINES.length) {
          const line = SCENE_LINES[index];
          body.classList.add('is-swapping');
          await pause(350);
          fill(es, line.es);
          fill(en, line.en);
          clock.textContent = line.time;
          en.classList.remove('is-peek');
          body.classList.remove('is-swapping');
          // Time to guess, then the pointer checks the English.
          await pause(1800);
          cursor.style.opacity = 1;
          pointAt(stage, cursor, en, .45, .6);
          await pause(900);
          en.classList.add('is-peek');
          await pause(2000);
          restCursor(stage, cursor);
          cursor.style.opacity = 0;
          en.classList.remove('is-peek');
          await pause(900);
        }
      }
    },
    save: {
      still(stage) {
        const line = SCENE_LINES.at(-1);
        fill(stage.querySelector('[data-es]'), line.es);
        fill(stage.querySelector('[data-en]'), line.en);
        stage.querySelector('[data-clock]').textContent = line.time;
        stage.querySelector('[data-words]').replaceChildren(...[...SCENE_LINES].reverse().map(wordRow));
        stage.querySelector('[data-count]').textContent = SCENE_LINES.length;
        showCard(stage, line);
      },
      async play(stage, pause) {
        const es = stage.querySelector('[data-es]');
        const en = stage.querySelector('[data-en]');
        const clock = stage.querySelector('[data-clock]');
        const list = stage.querySelector('[data-words]');
        const count = stage.querySelector('[data-count]');
        const card = stage.querySelector('[data-card]');
        const cursor = stage.querySelector('.scene-cursor');
        list.replaceChildren();
        count.textContent = 0;
        card.classList.add('is-empty');
        restCursor(stage, cursor);
        for (let index = 0; ; index = (index + 1) % SCENE_LINES.length) {
          const line = SCENE_LINES[index];
          if (index === 0) { list.replaceChildren(); count.textContent = 0; card.classList.add('is-empty'); }
          fill(es, line.es);
          fill(en, line.en);
          clock.textContent = line.time;
          await pause(1000);
          // Click the word.
          const target = [...es.querySelectorAll('.w')].find(word => word.textContent === line.save);
          cursor.style.opacity = 1;
          pointAt(stage, cursor, target);
          await pause(900);
          cursor.classList.add('is-pressing');
          target.classList.add('is-saved');
          await pause(180);
          cursor.classList.remove('is-pressing');
          // A copy of the word flies into My words.
          const area = stage.getBoundingClientRect();
          const from = target.getBoundingClientRect();
          const to = list.getBoundingClientRect();
          const ghost = target.cloneNode(true);
          ghost.classList.add('scene-ghost');
          ghost.style.left = `${from.left - area.left}px`;
          ghost.style.top = `${from.top - area.top}px`;
          ghost.style.fontSize = getComputedStyle(target).fontSize;
          stage.append(ghost);
          ghost.getBoundingClientRect();
          ghost.style.transform = `translate(${to.left - from.left + 14}px,${to.top - from.top}px) scale(.6)`;
          ghost.style.opacity = '.2';
          restCursor(stage, cursor);
          cursor.style.opacity = 0;
          await pause(650);
          ghost.remove();
          list.prepend(wordRow(line));
          while (list.children.length > 3) list.lastElementChild.remove();
          count.textContent = list.children.length;
          // Tomorrow's review card: the word and its line, then the meaning.
          card.classList.remove('is-flipped');
          showCard(stage, line);
          card.classList.remove('is-empty');
          await pause(1300);
          card.classList.add('is-flipped');
          await pause(1700);
          card.classList.remove('is-flipped');
          target.classList.remove('is-saved');
          await pause(800);
        }
      }
    }
  };

  document.querySelectorAll('.scene[data-scene]').forEach(figure => {
    const stage = figure.querySelector('.scene-stage');
    const scene = SCENES[figure.dataset.scene];
    if (!stage || !scene) return;
    const blank = stage.innerHTML;
    let run = 0;
    let playing = false;
    let inView = false;
    const reset = () => {
      stage.innerHTML = blank;
      scene.still(stage);
    };
    const start = () => {
      const id = ++run;
      playing = true;
      reset();
      const pause = ms => wait(ms).then(() => { if (run !== id) throw STOPPED; });
      scene.play(stage, pause).catch(error => { if (error !== STOPPED) throw error; });
    };
    const sync = () => {
      const wanted = inView && !document.hidden && !motion.matches;
      if (wanted && !playing) start();
      else if (!wanted && playing) {
        run++;
        playing = false;
        if (motion.matches) reset();
      }
    };
    reset();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .2);
        sync();
      }, { threshold: [0, .2] }).observe(stage);
    }
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
  });

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

  // The problems: a numbered list and one stage. Picking a step, or scrolling through the pinned
  // scene, shows that problem's pane; a pane plays (its parts arrive on their delays) once it is
  // on screen. On narrow screens the panes stack and each plays as it comes into view. Under
  // reduced motion everything shows at once.
  const problem = document.querySelector('.problem');
  const problemsBox = document.querySelector('[data-problems]');
  const isScrolly = () => problem?.classList.contains('is-scrolly');
  const narrowProblems = matchMedia('(max-width: 900px)');
  let showStep = () => {};
  if (problemsBox) {
    const steps = [...problemsBox.querySelectorAll('.problem-step')];
    const panes = [...problemsBox.querySelectorAll('.problem-pane')];
    const seen = panes.map(() => false);
    let active = 0;
    const play = index => {
      const pane = panes[index];
      if (!pane || pane.classList.contains('is-playing')) return;
      requestAnimationFrame(() => requestAnimationFrame(() => pane.classList.add('is-playing')));
    };
    const shouldPlay = index => seen[index] && (narrowProblems.matches || index === active);
    showStep = index => {
      if (index === active || !panes[index]) return;
      const previous = panes[active];
      active = index;
      steps.forEach((step, at) => {
        step.classList.toggle('is-on', at === index);
        step.querySelector('button')?.setAttribute('aria-pressed', String(at === index));
      });
      panes.forEach((pane, at) => {
        pane.classList.toggle('is-on', at === index);
        pane.setAttribute('aria-hidden', String(at !== index));
      });
      // The outgoing pane resets once it has faded, so it plays again from the start next time.
      setTimeout(() => { if (!previous.classList.contains('is-on')) previous.classList.remove('is-playing'); }, 450);
      if (shouldPlay(index)) play(index);
    };
    steps.forEach((step, index) => step.querySelector('button')?.addEventListener('click', () => showStep(index)));
    const setLayout = () => {
      problemsBox.classList.toggle('is-animated', !motion.matches);
      // Stacked panes are all readable; side by side, only the shown one is.
      panes.forEach((pane, at) => pane.setAttribute('aria-hidden', String(!narrowProblems.matches && at !== active)));
      panes.forEach((pane, at) => { if (shouldPlay(at)) play(at); });
    };
    if ('IntersectionObserver' in window) {
      const watcher = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const index = panes.indexOf(entry.target);
          if (!entry.isIntersecting) return;
          seen[index] = true;
          if (shouldPlay(index)) play(index);
        });
      }, { threshold: .6 });
      panes.forEach(pane => watcher.observe(pane));
    } else {
      seen.fill(true);
    }
    narrowProblems.addEventListener('change', setLayout);
    motion.addEventListener('change', setLayout);
    setLayout();
  }

  // The pinned problem scene, on wide screens with motion allowed. The track is taller than the
  // screen and the stage sticks while you scroll through it. The heading slides up from the bottom
  // of the screen to the centre, at its own size. Then progress through the track drives:
  //   0 – .28   the heading slides on up to the top while the problems rise in under it;
  //   .28 – 1   three equal stretches, one per problem; the shown step's bar fills across its stretch.
  // A snap point sits in the middle of each stretch, so a flick lands on the next problem. Picking a
  // step by hand holds until the scroll crosses into another stretch.
  const track = problem?.querySelector('.problem-track');
  const stage = problem?.querySelector('.problem-stage');
  const problemHeading = problem?.querySelector('h2');
  if (problem && track && stage && problemHeading && problemsBox) {
    const roomy = matchMedia('(min-width: 901px) and (min-height: 600px)');
    const ease = t => t * t * (3 - 2 * t);
    const span = (p, from, to) => Math.min(1, Math.max(0, (p - from) / (to - from)));
    const moving = [problemHeading, problemsBox];
    let shift = 0;
    let sceneFrame = null;
    let scrolledStep = 0;
    const STEPS = [[.28, .52], [.52, .76], [.76, 1]];
    const bars = [...problemsBox.querySelectorAll('.step-progress')];
    const snaps = STEPS.map(() => {
      const point = document.createElement('span');
      point.className = 'step-snap';
      point.setAttribute('aria-hidden', 'true');
      track.append(point);
      return point;
    });
    const clear = () => moving.forEach(element => { element.style.transform = ''; element.style.opacity = ''; });
    // How far the heading's resting place sits above the stage's centre.
    const measure = () => {
      clear();
      const box = stage.getBoundingClientRect();
      const heading = problemHeading.getBoundingClientRect();
      shift = box.top + box.height / 2 - (heading.top + heading.height / 2);
      // The page snaps a point to the scroll padding at the top, so offset each by that padding.
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const distance = track.offsetHeight - innerHeight;
      snaps.forEach((point, index) => { point.style.top = `${(STEPS[index][0] + STEPS[index][1]) / 2 * distance + padding}px`; });
    };
    const update = () => {
      sceneFrame = null;
      if (!isScrolly()) return;
      const rect = track.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
      const settling = ease(span(p, 0, .3));
      const rise = ease(span(p, .05, .28));
      problemHeading.style.transform = `translateY(${shift * (1 - settling)}px)`;
      problemsBox.style.transform = `translateY(${(1 - rise) * 60}vh)`;
      problemsBox.style.opacity = rise;
      const step = p < STEPS[1][0] ? 0 : p < STEPS[2][0] ? 1 : 2;
      if (step !== scrolledStep) { scrolledStep = step; showStep(step); }
      bars.forEach((bar, index) => bar.style.setProperty('--progress', index === step ? span(p, ...STEPS[index]).toFixed(3) : 0));
    };
    const requestScene = () => { if (!sceneFrame) sceneFrame = requestAnimationFrame(update); };
    const setMode = () => {
      const on = roomy.matches && !motion.matches;
      problem.classList.toggle('is-scrolly', on);
      if (!on) { clear(); bars.forEach(bar => bar.style.removeProperty('--progress')); return; }
      measure();
      update();
    };
    window.addEventListener('scroll', requestScene, { passive: true });
    window.addEventListener('resize', setMode);
    roomy.addEventListener('change', setMode);
    motion.addEventListener('change', setMode);
    document.fonts?.ready.then(setMode);
    setMode();
  }

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
