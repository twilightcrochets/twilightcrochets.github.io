/* =========================================================
   Twilight Crochets — scroll-driven yarn ball
   ---------------------------------------------------------
   The page is one fixed "stage". Native scroll position is
   mapped onto a timeline of chapters. Each chapter k:
     rest  – ball k sits still (hero / label visible)
     roll  – ball rolls forward (right on desktop, down on
             mobile), unspooling a yarn trail, shrinking a bit
     hold  – page k is shown beside the yarn line
             (long pages scroll inside their panel here)
     pan   – camera travels forward to where the ball stopped
   After the last page there is a final rest on a tiny ball.
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const world = $('#world');
  const yarnWorld = $('#yarnWorld');
  const skyWorld = $('#skyWorld');
  const ball = $('#ball');
  const ballSpin = $('#ballSpin');
  const ballShadow = $('#ballShadow');
  const trailBase = $('#trailBase');
  const trailPly = $('#trailPly');
  const spacer = $('#spacer');
  const nav = $('#nav');

  const pages = $$('.page').sort((a, b) => a.dataset.k - b.dataset.k);
  const intros = $$('.intro');
  const hero = $('.hero');
  const navLinks = $$('.nav-links a');
  const N = pages.length;            // number of pages
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
  const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

  /* ---------- yarn-ball artwork (unit circle, built once) ---------- */
  (function buildBall() {
    const r = rng(7);
    const bundles = 7;
    let under = '', over = '';
    for (let b = 0; b < bundles; b++) {
      const rot = b * (180 / bundles) * 2.3 + r() * 20;
      const base = 0.12 + r() * 0.25;
      const count = 8 + Math.floor(r() * 3);
      const sweep = r() > 0.5 ? 1 : 0;
      let d = '';
      for (let i = 0; i < count; i++) {
        const ry = (base + i * 0.068).toFixed(3);
        d += `M-1.02 0A1.02 ${ry} 0 0 ${sweep} 1.02 0`;
      }
      // each bundle: dark underside then light top so bundles overlap like wraps
      const g = `<g transform="rotate(${rot.toFixed(1)})">`;
      under = `${g}<path class="strand-under" stroke-width="0.058" d="${d}"/>` +
              `<path class="strand-over" stroke-width="0.03" d="${d}"/></g>`;
      ballSpin.insertAdjacentHTML('beforeend', under);
    }
  })();

  /* ---------- state built by layout() ---------- */
  let L = {};          // geometry
  let segs = [];       // timeline segments
  let total = 0;

  function layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const horiz = W >= 760 && W / H >= 1.05;
    document.documentElement.classList.toggle('is-vertical', !horiz);
    document.documentElement.classList.toggle('is-horizontal', horiz);
    const navH = nav.offsetHeight;

    const g = { W, H, horiz, navH };
    if (horiz) {
      g.R0 = Math.min(H * 0.24, W * 0.2);
      g.floor = H * 0.5 + g.R0;           // y of the floor line
      g.rest = W / 2;                     // along-position of a resting ball in view
      g.V = W;
    } else {
      g.wall = 20;                        // x of the yarn line
      g.R0 = Math.min(W / 2 - g.wall, H * 0.24);
      g.rest = H * 0.5;
      g.V = H;
    }
    g.yarnW = clamp(g.R0 * 0.045, 4, 8);

    // radii, positions, camera stops
    g.R = []; g.A = []; g.cam = []; g.travel = [];
    for (let k = 0; k <= N; k++) g.R[k] = g.R0 * Math.max(0.28, 1 - 0.17 * k);
    g.A[0] = g.rest;
    for (let k = 0; k < N; k++) {
      g.travel[k] = g.V * 1.15 + g.R[k];
      g.A[k + 1] = g.A[k] + g.travel[k];
    }
    for (let k = 0; k <= N; k++) g.cam[k] = g.A[k] - g.rest;
    L = g;

    placeWorld();
    buildSky();

    sizeProducts();

    // measure overflow of each page body (after placement)
    pages.forEach(p => {
      const body = $('.page-body', p), inner = $('.page-inner', p);
      p._overflow = Math.max(0, inner.scrollHeight - body.clientHeight);
      body.classList.toggle('overflows', p._overflow > 0);
    });

    // timeline
    segs = []; total = 0;
    const add = (type, k, len) => { segs.push({ type, k, start: total, len }); total += len; };
    for (let k = 0; k < N; k++) {
      add('rest', k, k === 0 ? H * 0.1 : H * 0.3);
      add('roll', k, H * 1.2);
      add('hold', k, H * 0.5 + pages[k]._overflow);
      add('pan', k, H * 0.9);
    }
    add('rest', N, H * 0.05);
    spacer.style.height = (total + H) + 'px';
  }

  /* position HTML elements in world coordinates */
  function placeWorld() {
    const { W, H, horiz, navH } = L;
    const set = (el, x, y, w, h) => {
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.width = w == null ? '' : w + 'px';
      el.style.height = h == null ? '' : h + 'px';
    };

    // hero occupies the first viewport
    const hw = $('.hero-word', hero), hu = $('.hero-under', hero);
    if (horiz) {
      set(hero, L.cam[0], 0, W, H);
      const fs = Math.min(W * 0.15, H * 0.2);
      hw.style.fontSize = fs + 'px';
      hw.style.top = (H * 0.5 - L.R0 - fs * 0.55) + 'px';
      hu.style.top = (L.floor + 22) + 'px';
    } else {
      set(hero, 0, L.cam[0], W, H);
      const fs = Math.min(W * 0.14, 84);
      hw.style.fontSize = fs + 'px';
      hw.style.top = Math.max(navH + 6, L.rest - L.R0 - fs * 1.15) + 'px';
      hu.style.top = (L.rest + L.R0 + 22) + 'px';
    }

    // labels next to balls 1..N
    intros.forEach(el => {
      const k = +el.dataset.k;
      if (k === 0) return;
      if (horiz) {
        const w = Math.min(520, W - 32);
        set(el, L.A[k] - w / 2, L.floor + 20, w, null);
      } else {
        const x = L.wall + 18;
        set(el, x, L.A[k] + L.R[k] + 18, W - x - 16, null);
      }
    });

    // pages
    pages.forEach(p => {
      const k = +p.dataset.k;
      const head = $('.page-head', p), body = $('.page-body', p);
      set(p, 0, 0, null, null);
      if (horiz) {
        const pad = Math.max(40, (W - 1160) / 2);
        const left = L.cam[k] + pad, width = W - pad * 2;
        set(body, left, navH + 20, width, L.floor - 34 - (navH + 20));
        set(head, left, L.floor + 26, width, null);
      } else {
        const left = L.wall + 22, width = W - left - 18;
        set(head, left, L.cam[k] + navH + 8, width, null);
        const bt = L.cam[k] + navH + 8 + head.offsetHeight + 16;
        set(body, left, bt, width, L.cam[k] + H - 20 - bt);
      }
    });
  }

  /* Products grid: choose a column width so that the first row of cards
     (lede + photo + caption) fits inside the panel without scrolling. */
  function sizeProducts() {
    const sec = $('#products'); if (!sec) return;
    const body = $('.page-body', sec), lede = $('.lede', sec);
    const narrow = L.W < 760;
    const cols = narrow ? 2 : 3, gap = narrow ? 10 : 18;
    const bw = body.clientWidth, bh = body.clientHeight;
    const caption = narrow ? 92 : 86;          // caption (label + up to 2-line name) + card padding
    const byWidth = (bw - gap * (cols - 1)) / cols;
    const byHeight = (bh - lede.offsetHeight - 14 - caption - 6) / 1.25;   // photos are 4:5
    const col = Math.max(110, Math.floor(Math.min(byWidth, narrow ? byWidth : byHeight)));
    sec.style.setProperty('--cols', cols);
    sec.style.setProperty('--gap', gap + 'px');
    sec.style.setProperty('--col-w', col + 'px');
    sec.style.setProperty('--col-w-px', col + 'px');
  }

  /* parallax star field (moves at 40% of camera speed) */
  const PARALLAX = 0.4;
  function buildSky() {
    const { W, H, horiz } = L;
    const span = L.cam[N] * PARALLAX + L.V * 1.2;
    const r = rng(42);
    const n = Math.round(span / 70);
    const star = 'M0-1C.12-.12.12-.12 1 0C.12.12.12.12 0 1C-.12.12-.12.12-1 0C-.12-.12-.12-.12 0-1Z';
    let out = '';
    for (let i = 0; i < n; i++) {
      const along = r() * span, cross = r() * (horiz ? H : W);
      const big = r() < 0.12;
      const s = big ? 6 + r() * 5 : 1.5 + r() * 2.5;
      const x = horiz ? along : cross, y = horiz ? cross : along;
      const cls = r() < 0.35 ? 's tw' : 's';
      const op = (big ? 0.55 : 0.25 + r() * 0.35).toFixed(2);
      const delay = (r() * 3).toFixed(2);
      out += `<path class="${cls}" style="animation-delay:-${delay}s" opacity="${op}" d="${star}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})"/>`;
    }
    skyWorld.innerHTML = out;
  }

  /* ---------- ball geometry as a function of its position ---------- */
  // radius and accumulated rotation for a ball whose centre is at `along`
  function ballAt(along) {
    if (along <= L.A[0]) return { R: L.R[0], theta: (along - L.A[0]) / L.R[0] };
    let th = 0;
    for (let j = 0; j < N; j++) {
      const Ravg = (L.R[j] + L.R[j + 1]) / 2;
      if (along <= L.A[j + 1]) {
        const e = (along - L.A[j]) / L.travel[j];
        return { R: lerp(L.R[j], L.R[j + 1], e), theta: th + (along - L.A[j]) / Ravg };
      }
      th += L.travel[j] / Ravg;
    }
    return { R: L.R[N], theta: th + (along - L.A[N]) / L.R[N] };
  }

  /* ---------- evaluate the timeline at scroll position s ---------- */
  function segAt(s) {
    for (const sg of segs) if (s < sg.start + sg.len) return sg;
    return segs[segs.length - 1];
  }

  function compute(s) {
    const { H } = L;
    const seg = segAt(s);
    const p = clamp((s - seg.start) / seg.len);
    const k = seg.k;
    const st = {
      cam: 0, along: 0,
      pageOp: new Array(N).fill(0), introOp: new Array(N + 1).fill(0),
      shift: pages.map((pg, i) => (i < k ? pg._overflow : 0)),
      active: -1, seg, p
    };
    switch (seg.type) {
      case 'rest':
        st.cam = L.cam[k]; st.along = L.A[k]; st.introOp[k] = 1;
        break;
      case 'roll':
        st.cam = L.cam[k]; st.along = L.A[k] + easeInOutSine(p) * L.travel[k];
        st.introOp[k] = 1 - smooth(0, 0.22, p);
        st.pageOp[k] = smooth(0.5, 0.85, p);
        if (p > 0.5) st.active = k;
        break;
      case 'hold':
        st.cam = L.cam[k]; st.along = L.A[k + 1]; st.pageOp[k] = 1; st.active = k;
        st.shift[k] = clamp(p * seg.len - H * 0.25, 0, pages[k]._overflow);
        break;
      case 'pan':
        st.cam = lerp(L.cam[k], L.cam[k + 1], easeInOutCubic(p)); st.along = L.A[k + 1];
        st.pageOp[k] = 1 - smooth(0.55, 1, p) * 0.6;
        st.introOp[k + 1] = smooth(0.55, 1, p);
        st.shift[k] = pages[k]._overflow;
        if (p < 0.5) st.active = k;
        break;
    }
    return st;
  }

  /* ---------- draw a state ---------- */
  let lastState = null;
  const pageEls = pages.map(pg => ({
    pg, body: $('.page-body', pg), head: $('.page-head', pg), inner: $('.page-inner', pg)
  }));

  function draw(st) {
    lastState = st;
    const { horiz } = L;
    const { cam, along } = st;
    const { R, theta } = ballAt(along);

    // camera
    world.style.transform = horiz ? `translate3d(${-cam}px,0,0)` : `translate3d(0,${-cam}px,0)`;
    yarnWorld.setAttribute('transform', horiz ? `translate(${-cam} 0)` : `translate(0 ${-cam})`);
    skyWorld.setAttribute('transform', horiz ? `translate(${-cam * PARALLAX} 0)` : `translate(0 ${-cam * PARALLAX})`);

    // ball
    let bx, by;
    if (horiz) { bx = along; by = L.floor - R; }
    else { bx = L.wall + R; by = along; }
    ball.setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${R.toFixed(3)})`);
    ballSpin.setAttribute('transform', `rotate(${(theta * 180 / Math.PI).toFixed(2)})`);
    if (horiz) {
      ballShadow.setAttribute('cx', bx); ballShadow.setAttribute('cy', L.floor + 2);
      ballShadow.setAttribute('rx', R * 0.85); ballShadow.setAttribute('ry', Math.max(3, R * 0.07));
      ballShadow.style.display = '';
    } else ballShadow.style.display = 'none';

    // yarn trail: a loose curled tail at the start, then a straight run to the ball
    const w = L.yarnW;
    let d;
    if (horiz) {
      const y = L.floor - w / 2, a = L.A[0];
      d = `M${a - 150} ${y}C${a - 120} ${y} ${a - 105} ${y - 34} ${a - 82} ${y - 36}` +
          `C${a - 58} ${y - 38} ${a - 60} ${y} ${a - 30} ${y}L${Math.max(a - 30, along)} ${y}`;
    } else {
      const x = L.wall + w / 2, a = L.A[0];
      // tail peeks out from behind the ball's left side
      const R0 = L.R0;
      d = `M${x + 8} ${a - R0 * 0.75}C${x + 14} ${a - R0 * 0.62} ${x - 8} ${a - R0 * 0.52} ${x - 6} ${a - R0 * 0.4}` +
          `C${x - 4} ${a - R0 * 0.28} ${x + 12} ${a - R0 * 0.22} ${x} ${a - R0 * 0.08}L${x} ${Math.max(a - R0 * 0.08, along)}`;
    }
    trailBase.setAttribute('d', d);
    trailPly.setAttribute('d', d);
    trailBase.setAttribute('stroke-width', w);
    trailPly.setAttribute('stroke-width', w * 0.42);
    trailPly.setAttribute('stroke-dasharray', `${w * 1.1} ${w * 0.9}`);

    // fades
    intros.forEach(el => {
      const o = st.introOp[+el.dataset.k];
      el.style.opacity = o;
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    });
    pageEls.forEach(({ pg, body, head, inner }, i) => {
      const o = st.pageOp[i];
      pg.style.opacity = o;
      pg.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      pg.classList.toggle('live', o > 0.9);
      if (o <= 0.001) return;
      const lift = (1 - o) * 24;
      body.style.transform = horiz ? `translateY(${lift}px)` : `translateX(${lift}px)`;
      head.style.transform = horiz ? `translateY(${-lift * 0.6}px)` : `translateX(${lift}px)`;
      const sh = st.shift[i];
      inner.style.transform = `translateY(${-sh}px)`;
      body.classList.toggle('at-end', pg._overflow > 0 && sh >= pg._overflow - 1);
      body.classList.toggle('at-start', sh <= 1);
    });

    navLinks.forEach(a => a.classList.toggle('active', +a.dataset.goto === st.active));
  }

  function render(s) { draw(compute(s)); }

  /* ---------- smoothed scroll loop ---------- */
  let current = window.scrollY, target = current, running = false;
  function tick() {
    if (jump) { running = false; return; }
    target = window.scrollY;
    current += (target - current) * 0.14;
    if (Math.abs(target - current) < 0.3) current = target;
    render(current);
    if (current !== target) requestAnimationFrame(tick); else running = false;
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }
  window.addEventListener('scroll', kick, { passive: true });

  let rt, pendingLayout = false;
  window.addEventListener('resize', () => {
    if (document.documentElement.classList.contains('modal-open')) { pendingLayout = true; return; }
    clearTimeout(rt);
    rt = setTimeout(() => {
      // keep the same relative progress across resizes
      if (jump) finishJump();
      const frac = total ? window.scrollY / total : 0;
      layout();
      window.scrollTo(0, frac * total);
      current = target = window.scrollY; render(current);
    }, 120);
  });

  /* ---------- menu travel ("follow the ball") ----------
     Clicking a menu item doesn't scroll through every page.
     Instead the ball comes to the centre and rolls along the
     yarn (forwards, or backwards winding the yarn back up)
     with the camera following it. In-between pages stay
     closed. On arrival it does the normal roll and only the
     chosen page opens. Then the scroll position is synced. */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = reduceMotion ? 0.25 : 1;     // multiplier on durations
  let jump = null;

  const holdStart = j => segs.find(s => s.type === 'hold' && s.k === j).start + 2;

  function startJump(goto) {
    const toTop = goto === 'top';
    const j = toTop ? 0 : +goto;
    const destScroll = toTop ? 0 : holdStart(j);
    const from = lastState || compute(current);
    if (!jump && Math.abs(destScroll - current) < 4) return;

    // already in this chapter's rest/roll? just finish the roll from here
    let p0 = 0, needTravel = true;
    if (!jump && !toTop && from.seg && from.seg.k === j && (from.seg.type === 'rest' || from.seg.type === 'roll')) {
      needTravel = false; p0 = from.seg.type === 'roll' ? from.p : 0;
    }

    const destAlong = L.A[j];
    const dist = Math.abs(destAlong - from.along);
    const T1 = needTravel ? clamp(800 + (dist / L.V) * 900, 1200, 5000) * SPEED : 0;
    const T2 = toTop ? 0 : 1500 * (1 - p0) * SPEED;

    jump = {
      j, toTop, destScroll, from, p0, T1, T2, destAlong,
      dir: Math.sign(destAlong - from.along) || 1,
      D: Math.max(0, (from.along - from.cam) - L.rest),  // how far right of centre the ball starts
      t0: performance.now()
    };
    requestAnimationFrame(jumpFrame);
  }

  function jumpFrame(now) {
    if (!jump) return;
    const J = jump, t = now - J.t0;
    if (t < J.T1) {
      const u = t / J.T1;
      const along = lerp(J.from.along, J.destAlong, easeInOutSine(u));
      // keep the ball centred; if it started off to the right, bring it in gently
      let offset;
      if (J.dir > 0) {
        offset = L.rest + J.D * (1 - smooth(0, 0.75, u));
      } else {
        // going back: the camera waits while the ball rolls into view, then follows
        const travelled = Math.abs(along - J.from.along);
        const span = Math.max(1, Math.min(1.6 * J.D, Math.abs(J.destAlong - J.from.along)));
        offset = J.D ? L.rest + J.D * (1 - smooth(0, 1, travelled / span)) : L.rest;
      }
      const cam = along - offset;
      const fadeOut = 1 - smooth(0, 0.18, u);
      const st = {
        cam, along,
        pageOp: J.from.pageOp.map(o => o * fadeOut),
        introOp: J.from.introOp.map(o => o * fadeOut),
        shift: J.from.shift.slice(),
        active: J.toTop ? -1 : J.j
      };
      // the destination label (or the hero, for "back to top") fades in as we arrive
      st.introOp[J.j] = Math.max(st.introOp[J.j], smooth(0.78, 1, u));
      draw(st);
      requestAnimationFrame(jumpFrame);
      return;
    }
    if (!J.toTop && t < J.T1 + J.T2) {
      const v = (t - J.T1) / J.T2;
      const rollSeg = segs.find(s => s.type === 'roll' && s.k === J.j);
      const st = compute(rollSeg.start + lerp(J.p0, 1, v) * rollSeg.len);
      st.active = J.j;
      draw(st);
      requestAnimationFrame(jumpFrame);
      return;
    }
    finishJump();
  }

  function finishJump() {
    const J = jump; jump = null;
    window.scrollTo({ top: J.destScroll, behavior: 'instant' });
    current = target = window.scrollY;
    render(current);
  }

  // while travelling, ignore wheel / touch / key scrolling so nothing fights the animation
  const block = e => { if (jump) e.preventDefault(); };
  window.addEventListener('wheel', block, { passive: false });
  window.addEventListener('touchmove', block, { passive: false });
  window.addEventListener('keydown', e => {
    if (jump && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) e.preventDefault();
  });

  /* ---------- navigation ---------- */
  $$('[data-goto]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    startJump(a.dataset.goto);
    $('#navLinks').classList.remove('open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }));
  $('#menuBtn').addEventListener('click', () => {
    const open = $('#navLinks').classList.toggle('open');
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  });

  /* ---------- discounts: reward steps switch the loyalty card image ---------- */
  const tierBtns = $$('#discounts .tier');
  const cardImgs = $$('#discounts .card-stack img');
  function showCard(i) {
    tierBtns.forEach((b, j) => { b.classList.toggle('is-active', j === i); b.setAttribute('aria-pressed', String(j === i)); });
    cardImgs.forEach((im, j) => im.classList.toggle('is-active', j === i));
  }
  tierBtns.forEach((b, i) => {
    b.addEventListener('click', () => showCard(i));
    b.addEventListener('mouseenter', () => showCard(i));
    b.addEventListener('focus', () => showCard(i));
  });

  /* ---------- order form (pop-up) ----------
     Orders are emailed through Web3Forms (free).  To connect it:
       1. Go to https://web3forms.com, type the email that should receive orders,
          and they email you an "Access Key".
       2. Paste that key below between the quotes.                              */
  const WEB3FORMS_ACCESS_KEY = 'eafb4be4-7db6-4401-aa45-7d6000e26b35';
  const INSTAGRAM_URL = 'https://www.instagram.com/twilight_crochet.s/';

  const dlg = $('#orderDialog'), form = $('#orderForm');
  const sel = $('#orderProduct'), thumb = $('#orderThumb'), priceEl = $('#orderPrice');
  const statusEl = $('#orderStatus'), submitBtn = $('#orderSubmit'), doneEl = $('#orderDone');

  // product info (photo + base price) read straight from the product cards
  const productInfo = {};
  $$('#products .product').forEach(card => {
    const name = $('.prod-name', card).textContent.trim();
    const img = $('.product-img img', card);
    productInfo[name] = { img: img ? img.getAttribute('src') : '', price: $('.price', card).textContent.trim() };
  });
  function showProduct(name) {
    const info = productInfo[name];
    thumb.style.backgroundImage = info && info.img ? `url("${info.img}")` : '';
    thumb.classList.toggle('custom', !info || !info.img);
    priceEl.textContent = info ? `Base price: ${info.price}` : 'Price depends on the design';
  }
  sel.addEventListener('change', () => showProduct(sel.value));

  function openOrder(product) {
    if (product && [...sel.options].some(o => o.value === product)) sel.value = product;
    showProduct(sel.value);
    statusEl.textContent = ''; statusEl.className = 'order-status';
    doneEl.hidden = true; form.classList.remove('is-done');
    document.documentElement.classList.add('modal-open');
    dlg.showModal();
    setTimeout(() => (product ? form.elements.Name : sel).focus({ preventScroll: true }), 50);
  }
  function closeOrder() { dlg.close(); }
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('modal-open');
    if (pendingLayout) { pendingLayout = false; window.dispatchEvent(new Event('resize')); }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) closeOrder(); });   // click on the backdrop
  $('#orderClose').addEventListener('click', closeOrder);
  $('#orderDoneClose').addEventListener('click', closeOrder);
  $$('[data-order]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openOrder(b.dataset.order); }));
  // tapping a product photo also opens the form (the button is the visible hint)
  $$('#products .product').forEach(card => {
    const btn = $('.order-btn', card); if (!btn) return;
    $('.product-img', card).addEventListener('click', e => { if (e.target !== btn) openOrder(btn.dataset.order); });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ig = form.elements.Instagram;
    ig.value = ig.value.trim().replace(/^@?/, '@').replace(/\s+/g, '');
    if (ig.value === '@') ig.value = '';
    if (!form.checkValidity()) {
      form.classList.add('tried');
      statusEl.textContent = 'Please fill in your name, Instagram username and the details.';
      statusEl.className = 'order-status error';
      const bad = form.querySelector(':invalid'); if (bad) bad.focus();
      return;
    }
    if (form.elements.botcheck.checked) return;              // spam bot
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY.startsWith('PASTE_')) {
      statusEl.innerHTML = `The order form isn’t connected yet. Please <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener">message us on Instagram</a> for now.`;
      statusEl.className = 'order-status error';
      return;
    }
    const data = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `New order: ${sel.value} — ${form.elements.Name.value.trim()} (${ig.value})`,
      from_name: 'Twilight Crochets website',
      'Product': sel.value,
      'Base price': productInfo[sel.value] ? productInfo[sel.value].price : 'Custom',
      'Name': form.elements.Name.value.trim(),
      'Instagram': ig.value,
      'Instagram link': 'https://www.instagram.com/' + ig.value.slice(1) + '/',
      'Customisation details': form.elements['Customisation details'].value.trim(),
      botcheck: false
    };
    submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
    statusEl.textContent = ''; statusEl.className = 'order-status';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.success === false) throw new Error(out.message || res.status);
      form.reset(); form.classList.remove('tried');
      form.classList.add('is-done'); doneEl.hidden = false;
    } catch (err) {
      statusEl.innerHTML = `Sorry, something went wrong sending your request. Please try again, or <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener">message us on Instagram</a>.`;
      statusEl.className = 'order-status error';
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Send order request';
    }
  });

  /* ---------- boot ---------- */
  history.scrollRestoration = 'manual';
  layout();
  render(current);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!jump) { layout(); render(current); } });
  // deep links like #about roll there from the start
  const hashIdx = { '#products': 0, '#shop': 0, '#instructions': 1, '#custom': 1, '#discounts': 2, '#about': 2, '#contact': 3 }[location.hash];
  if (hashIdx != null) setTimeout(() => startJump(hashIdx), 300);

  // debug hooks used for testing
  window.__yarn = { segs: () => segs, total: () => total, jump: g => startJump(g), state: () => lastState, jumping: () => !!jump };
})();
