const book = document.getElementById("book");
const leaves = [...book.querySelectorAll(".leaf")];
const total = leaves.length;

const STAGGER = 110;    // ms between words fading in (tune to match your voice pace)

let current = 0;        // how many leaves have been flipped
let started = false;    // browsers only allow audio after the first click
let narration = null;   // the audio clip currently playing
let runId = 0;          // lets a new page turn cancel the previous reading

document.documentElement.style.setProperty("--stagger", STAGGER + "ms");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Long pages scroll ----------
   Everything on a page except its decorative tulips goes into a .pg scroller, so the gold
   frame and corners stay put while the story scrolls. Short pages just don't scroll. */
book.querySelectorAll(".face.page").forEach((face) => {
  const pg = document.createElement("div");
  pg.className = "pg";
  [...face.childNodes].forEach((n) => {
    if (!(n.nodeType === 1 && n.matches("svg.tulip"))) pg.appendChild(n);
  });
  face.appendChild(pg);
});

// soft fades at the top/bottom edge tell her there is more to read; keyboard users can focus a long page
function updateScrollCues(pg) {
  const max = pg.scrollHeight - pg.clientHeight;
  const long = max > 2;
  pg.classList.toggle("more", long && pg.scrollTop < max - 4);
  pg.classList.toggle("scrolled", long && pg.scrollTop > 4);
  if (long) { pg.tabIndex = 0; pg.setAttribute("role", "region"); pg.setAttribute("aria-label", "Page text, scrollable"); }
  else { pg.removeAttribute("tabindex"); pg.removeAttribute("role"); pg.removeAttribute("aria-label"); }
}
const pgs = [...book.querySelectorAll(".pg")];
pgs.forEach((pg) => pg.addEventListener("scroll", () => updateScrollCues(pg), { passive: true }));
if (window.ResizeObserver) {
  const ro = new ResizeObserver((entries) => entries.forEach((e) => updateScrollCues(e.target)));
  pgs.forEach((pg) => ro.observe(pg));
}
addEventListener("load", () => pgs.forEach(updateScrollCues));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pgs.forEach(updateScrollCues));

/* ---------- Decorations added to every page ---------- */
const cornerSvgs = ["tl", "tr", "bl", "br"]
  .map((c) => `<svg class="orn ${c}" aria-hidden="true"><use href="#corner"/></svg>`)
  .join("");
book.querySelectorAll(".face").forEach((face) => {
  if (face.classList.contains("page")) face.insertAdjacentHTML("afterbegin", cornerSvgs);
  face.insertAdjacentHTML("beforeend", '<i class="shade"></i>');   // darkens while turning
});

/* ---------- Split every heading/paragraph into words ---------- */
const wordCounts = new Map();
book.querySelectorAll(".face").forEach((face) => {
  let n = 0;
  face.querySelectorAll("h1, h2, p, .month").forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.innerHTML = text
      .split(/\s+/)
      .map((word) => `<span class="w" aria-hidden="true" style="--i:${n++}">${word}</span>`)
      .join(" ");
  });
  wordCounts.set(face, n);
  const first = face.matches(".chapter") && face.querySelector("p .w");
  if (first) first.classList.add("initial");
});

/* ---------- Remove photos that don't exist yet ---------- */
book.querySelectorAll("img.photo").forEach((img) => {
  const drop = () => img.remove();
  img.addEventListener("error", drop);
  if (img.complete && img.naturalWidth === 0) drop();
});

/* ---------- Page flipping ---------- */
function render() {
  leaves.forEach((leaf, i) => {
    leaf.classList.toggle("flipped", i < current);
    // swap stacking order halfway through the flip so pages overlap correctly
    setTimeout(() => {
      leaf.style.zIndex = i < current ? i + 1 : total - i;
    }, 650);
  });
  book.classList.toggle("closed", current === 0);
  book.classList.toggle("end", current === total);
  readSpread();
}

/* ---------- Paper page turn (Web Animations) ----------
   The pose is calculated along a smooth curve, so the page eases in and out,
   lifts toward you, bends a little (the free edge lags, then leads),
   and darkens as it passes edge-on. Change TURN_MS to make it faster or slower. */
const TURN_MS = 1300;
const STEPS = 60;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const flipSound = new Audio("audio/page-turn.mp3");   // optional sound effect
flipSound.volume = 0.6;

const ease = (p) => p * p * p * (p * (p * 6 - 15) + 10);   // smootherstep

function pageFrames(dir) {
  const frames = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const q = dir === "fwd" ? t : 1 - t;                 // progress of the turn
    const angle = -180 * ease(q);
    const bend = -3.5 * Math.sin(2 * Math.PI * q);
    const lift = 20 * Math.sin(Math.PI * q);
    // translateZ comes FIRST so the lift is measured in the room, not along the
    // rotated page (otherwise the second half of the turn pushes the page backward)
    frames.push({ offset: t, transform: `translateZ(${lift}px) rotateY(${angle}deg) skewY(${bend}deg)` });
  }
  return frames;
}

function shadeFrames(dir, side) {
  const frames = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const q = dir === "fwd" ? t : 1 - t;
    const a = 180 * ease(q);                             // 0 = flat right, 180 = flat left
    const s = side === "front" ? Math.min(1, a / 90) : Math.min(1, (180 - a) / 90);
    frames.push({ offset: t, opacity: +(0.9 * s * s).toFixed(3) });
  }
  return frames;
}

// tells the 3D layer where the spine is (used for the shower of hearts on the last page)
function announceTurn(type) {
  const r = book.getBoundingClientRect();
  dispatchEvent(new CustomEvent(type, { detail: { x: r.left + r.width / 2, y: r.top + r.height * 0.55 } }));
}

function turn(leaf, dir) {
  flipSound.currentTime = 0;
  flipSound.play().catch(() => {});                      // ignore if the file is missing
  if (reducedMotion.matches) return;                     // just snap

  leaf.getAnimations().forEach((a) => a.cancel());
  const opts = { duration: TURN_MS, easing: "linear" };
  // when it finishes, the .flipped class already holds the same final pose
  leaf.animate(pageFrames(dir), opts).onfinish = (e) => e.target.cancel();
  ["front", "back"].forEach((side) => {
    const shade = leaf.querySelector(`.${side} .shade`);
    shade.getAnimations().forEach((a) => a.cancel());
    shade.animate(shadeFrames(dir, side), opts);
  });
}

function next() {
  if (document.body.classList.contains("fx-modal")) return;   // letter is open
  if (current < total) {
    const leaf = leaves[current];
    current++; started = true; startMusic();
    turn(leaf, "fwd");
    render();
  }
}
function prev() {
  if (document.body.classList.contains("fx-modal")) return;
  if (current > 0) {
    current--; started = true; startMusic();
    turn(leaves[current], "back");
    render();
  }
}

/* ---------- Reading the open pages ----------
   Left page first, then right page. For each page the words fade in
   and its audio (data-audio) plays. Flip back and it replays. */
function spreadFaces() {
  const left = leaves[current - 1]?.querySelector(".back");
  const right = leaves[current]?.querySelector(".front");
  return [left, right].filter(Boolean);
}

function stopNarration() {
  if (narration) { narration.pause(); narration = null; }
}

function narrate(face) {
  return new Promise((resolve) => {
    // no audio (or not started yet): just wait long enough for the words to fade in
    const fallback = () => { setMusicLevel(MUSIC_VOL); setTimeout(resolve, wordCounts.get(face) * STAGGER + 1200); };
    const src = face.dataset.audio;
    if (!src || !started) return fallback();

    const clip = new Audio(src);
    narration = clip;
    clip.addEventListener("ended", () => { setMusicLevel(MUSIC_VOL); resolve(); });
    clip.addEventListener("error", fallback);   // file missing
    clip.play().then(() => setMusicLevel(DUCK_VOL)).catch(fallback);
  });
}

/* ---------- Last page: the tulips bloom and a big shower of hearts (GSAP) ---------- */
let finaleAt = 0;
function finale() {
  if (performance.now() - finaleAt < 4000) return;
  finaleAt = performance.now();
  announceTurn("book:finale");
  if (!window.gsap || reducedMotion.matches) return;
  gsap.fromTo(".closing-page .tulip",
    { scale: 0.15, opacity: 0, transformOrigin: "50% 100%" },
    { scale: 1, opacity: 1, duration: 1.8, ease: "elastic.out(1, 0.55)", stagger: 0.18 });
}

/* While a long page is being read aloud, the text scrolls down with the words as they appear.
   The moment she scrolls by hand, it stops following. */
function followReading(face, id) {
  const pg = face.querySelector(".pg");
  if (!pg) return;
  pg.scrollTop = 0;
  const words = [...pg.querySelectorAll(".w")];
  let manual = false, pos = 0;
  const stop = () => { manual = true; };
  ["wheel", "touchstart", "pointerdown", "keydown"].forEach((ev) => pg.addEventListener(ev, stop, { once: true, passive: true }));
  const t0 = performance.now();
  (function tick(now) {
    if (manual || id !== runId || !face.classList.contains("reading")) return;
    const max = pg.scrollHeight - pg.clientHeight;
    const i = Math.min(words.length - 1, Math.floor((now - t0) / STAGGER));
    if (max > 2 && i >= 0) {
      const w = words[i];
      const want = Math.min(max, Math.max(0, w.offsetTop + w.offsetHeight - pg.clientHeight * 0.75));
      if (want > pos) { pos = Math.min(want, pos + 2.4); pg.scrollTop = pos; }
    }
    if (now - t0 < (words.length + 8) * STAGGER) requestAnimationFrame(tick);
  })(t0);
}

async function readSpread() {
  const id = ++runId;
  stopNarration();
  book.querySelectorAll(".face.reading").forEach((f) => f.classList.remove("reading"));

  await wait(current === 0 ? 400 : 900);        // let the page finish turning
  if (id === runId && current === total - 1) finale();

  for (const face of spreadFaces()) {
    if (id !== runId) return;                   // user turned the page, stop
    face.classList.add("reading");
    followReading(face, id);
    await narrate(face);
  }
}

// Pause narration while the video is playing
book.querySelectorAll("video").forEach((v) => {
  v.addEventListener("play", () => { runId++; stopNarration(); setMusicLevel(0); });
  v.addEventListener("pause", () => setMusicLevel(MUSIC_VOL));
  v.addEventListener("ended", () => setMusicLevel(MUSIC_VOL));
});

/* ---------- Background music ----------
   Put your track at audio/FormyGf.mp3. It starts softly when she first opens
   the book, dips under your voice, goes silent during the video, and the
   speaker button mutes it (her choice is remembered). */
const MUSIC_FILE = "audio/FormyGf.mp3";
let MUSIC_VOL = 0.25;       // normal background level (0 to 1); she can change it with the volume slider
const DUCK_RATIO = 0.32;    // how far the music dips while your voice is speaking (a share of the level above)
let DUCK_VOL = MUSIC_VOL * DUCK_RATIO;
try {
  const saved = parseFloat(localStorage.getItem("bookVolume"));
  if (!isNaN(saved)) { MUSIC_VOL = Math.min(1, Math.max(0, saved)); DUCK_VOL = MUSIC_VOL * DUCK_RATIO; }
} catch (e) {}

const music = new Audio(MUSIC_FILE);
music.loop = true;
music.preload = "auto";
music.volume = 0;

const soundBtn = document.getElementById("sound");
let musicStarted = false;
let musicLevel = MUSIC_VOL;
let fadeRaf = 0;
let muted = false;
try { muted = localStorage.getItem("bookMuted") === "1"; } catch (e) {}
music.muted = muted;

function showMuted() {
  soundBtn.classList.toggle("muted", muted || MUSIC_VOL === 0);
  soundBtn.setAttribute("aria-pressed", String(muted));
  soundBtn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
}
showMuted();

// no button if the music file isn't there
music.addEventListener("error", () => { soundBtn.hidden = true; });

function fadeMusicTo(target, ms) {
  cancelAnimationFrame(fadeRaf);
  const from = music.volume;
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    music.volume = from + (target - from) * p;
    if (p < 1) fadeRaf = requestAnimationFrame(step);
  })(t0);
}

let musicMode = "normal";                 // "normal", or "duck" while a voice is playing
const levelFor = (mode) => (mode === "duck" ? DUCK_VOL : MUSIC_VOL);
function setMusicLevel(v) {
  musicMode = v === DUCK_VOL && DUCK_VOL !== MUSIC_VOL ? "duck" : "normal";
  musicLevel = levelFor(musicMode);
  if (musicStarted) fadeMusicTo(musicLevel, 700);
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  music.play()
    .then(() => fadeMusicTo(musicLevel, 2500))      // slow fade-in
    .catch(() => { musicStarted = false; });
}

function saveMuted() { try { localStorage.setItem("bookMuted", muted ? "1" : "0"); } catch (e) {} }

function toggleMute() {
  if (MUSIC_VOL === 0) { setVolume(0.25); muted = false; }     // slider was at zero: bring the music back
  else muted = !muted;
  music.muted = muted;
  saveMuted();
  showMuted();
  syncMixer();
}

/* ---------- Volume mixer: hover (or tap) the speaker to slide the music up or down ---------- */
function setVolume(v) {
  MUSIC_VOL = Math.min(1, Math.max(0, v));
  DUCK_VOL = MUSIC_VOL * DUCK_RATIO;
  musicLevel = levelFor(musicMode);
  if (musicStarted) fadeMusicTo(musicLevel, 120);
  try { localStorage.setItem("bookVolume", String(MUSIC_VOL)); } catch (e) {}
}

const soundWrap = document.createElement("span");
soundWrap.className = "sound-wrap";
soundBtn.replaceWith(soundWrap);
soundWrap.appendChild(soundBtn);

const mixer = document.createElement("div");
mixer.className = "mixer";
mixer.innerHTML = `
  <button type="button" class="mix-mute" aria-label="Mute music">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="waves" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/><path class="slash" d="M17 9l5 6M22 9l-5 6"/>
    </svg>
  </button>
  <input type="range" min="0" max="100" step="1" aria-label="Music volume">
  <output aria-hidden="true"></output>`;
soundWrap.appendChild(mixer);
const slider = mixer.querySelector("input");
const mixOut = mixer.querySelector("output");
const mixMute = mixer.querySelector(".mix-mute");

function syncMixer() {
  const silent = muted || MUSIC_VOL === 0;
  const pct = silent ? 0 : Math.round(MUSIC_VOL * 100);
  slider.value = pct;
  slider.style.setProperty("--fill", pct + "%");
  mixOut.textContent = pct + "%";
  mixMute.classList.toggle("muted", silent);
  mixMute.setAttribute("aria-label", silent ? "Unmute music" : "Mute music");
}
slider.addEventListener("input", () => {
  const v = slider.value / 100;
  if (v > 0 && muted) { muted = false; music.muted = false; saveMuted(); }
  setVolume(v);
  showMuted();
  syncMixer();
  keepMixerOpen();
});
mixMute.addEventListener("click", () => { toggleMute(); keepMixerOpen(); });
music.addEventListener("error", () => { soundWrap.hidden = true; });
syncMixer();

// open on mouse hover or keyboard focus; on touch screens a tap on the speaker opens it
let mixTimer = 0, lastPointer = "";
const openMixer = () => { clearTimeout(mixTimer); soundWrap.classList.add("open"); };
const closeMixer = (ms) => { clearTimeout(mixTimer); mixTimer = setTimeout(() => soundWrap.classList.remove("open"), ms); };
function keepMixerOpen() { if (lastPointer !== "mouse") closeMixer(5000); }
soundWrap.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") openMixer(); });
soundWrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") closeMixer(400); });
soundWrap.addEventListener("focusin", openMixer);
soundWrap.addEventListener("focusout", () => closeMixer(250));
let openAtDown = false;
soundBtn.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; openAtDown = soundWrap.classList.contains("open"); });
soundBtn.addEventListener("keydown", () => { lastPointer = ""; });
document.addEventListener("pointerdown", (e) => { if (!soundWrap.contains(e.target)) closeMixer(0); });

soundBtn.addEventListener("click", () => {
  if (lastPointer === "touch" || lastPointer === "pen") {      // no hover on touch: tap opens the slider
    if (openAtDown) { closeMixer(0); } else { openMixer(); keepMixerOpen(); }     // (focus already opened it, so judge by how it was before the tap)
    return;
  }
  toggleMute();
});

/* ---------- Input ---------- */
document.getElementById("next").addEventListener("click", next);
document.getElementById("prev").addEventListener("click", prev);

function onScrollbar(e) {
  const pg = e.target.closest(".pg");
  if (!pg) return false;
  const bar = pg.offsetWidth - pg.clientWidth;
  return bar > 0 && e.clientX > pg.getBoundingClientRect().right - bar - 2;
}
book.querySelectorAll(".front").forEach((el) =>
  el.addEventListener("click", (e) => { if (!e.target.closest("video") && !onScrollbar(e)) next(); })
);
book.querySelectorAll(".back").forEach((el) =>
  el.addEventListener("click", (e) => { if (!e.target.closest("video") && !onScrollbar(e)) prev(); })
);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
});

/* ---------- Gentle 3D tilt that follows the pointer ----------
   With GSAP the book eases toward the pointer, so it feels weighted instead of twitchy. */
const tilt = document.getElementById("tilt");
if (!reducedMotion.matches) {
  const pose = { rx: 12, ry: 0 };
  let dirty = false, lastRx = NaN, lastRy = NaN;
  const apply = () => {
    if (!dirty) return;
    dirty = false;
    tilt.style.transform = `rotateX(${pose.rx.toFixed(2)}deg) rotateY(${pose.ry.toFixed(2)}deg)`;
  };
  if (window.gsap) {
    tilt.style.transition = "none";
    const toRx = gsap.quickTo(pose, "rx", { duration: 1.1, ease: "power3.out" });
    const toRy = gsap.quickTo(pose, "ry", { duration: 1.1, ease: "power3.out" });
    gsap.ticker.add(() => {
      if (pose.rx === lastRx && pose.ry === lastRy) return;     // nothing moved, skip the style write
      lastRx = pose.rx; lastRy = pose.ry;
      dirty = true; apply();
    });
    addEventListener("pointermove", (e) => {
      toRx(12 - (e.clientY / innerHeight - 0.5) * 5);
      toRy((e.clientX / innerWidth - 0.5) * 8);
    }, { passive: true });
  } else {
    let raf = 0;
    addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        pose.rx = 12 - (e.clientY / innerHeight - 0.5) * 5;
        pose.ry = (e.clientX / innerWidth - 0.5) * 8;
        dirty = true; apply();
      });
    });
  }
}

/* ---------- Opening scene (GSAP): the table fades up and the book settles in ---------- */
if (window.gsap && !reducedMotion.matches) {
  const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro
    .from(".mat-wrap", { opacity: 0, duration: 1.6, clearProps: "opacity" }, 0)
    .from(".branch", { opacity: 0, duration: 2, stagger: 0.25, clearProps: "opacity" }, 0.3)
    .from(".prop", { opacity: 0, duration: 1.6, stagger: 0.18, clearProps: "opacity" }, 0.5)
    .from(".stage", { opacity: 0, y: 40, duration: 1.8, clearProps: "opacity,transform" }, 0.35);
}

/* ---------- Falling petals (cherry blossom + tulip) and petals on the table ----------
   Each petal gets two animations with plain numbers: it falls, and it flutters. */
const rand = (a, b) => a + Math.random() * (b - a);

function addPetal(layer, kind, size, dur) {
  const el = document.createElement("div");
  el.className = "fp";
  el.style.left = rand(0, 100) + "%";
  el.style.width = size + "px";
  el.style.height = size * 1.2 + "px";
  el.innerHTML = `<svg viewBox="0 0 20 24" aria-hidden="true"><use href="#${kind}"/></svg>`;
  layer.appendChild(el);

  const drift = rand(-140, 140);
  el.animate(
    [
      { transform: "translate3d(0, -8vh, 0)", opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 1, offset: 0.92 },
      { transform: `translate3d(${drift}px, 112vh, 0)`, opacity: 0, offset: 1 },
    ],
    { duration: dur * 1000, iterations: Infinity, delay: -rand(0, dur) * 1000 }
  );

  const sway = rand(10, 18);
  el.firstChild.animate(
    [
      { transform: `translateX(${-sway}px) rotate3d(1, 0.4, 0, 0deg) rotate(${rand(-40, 40)}deg)` },
      { transform: `translateX(${sway}px) rotate3d(1, 0.6, 0.2, 160deg) rotate(${rand(-120, 120)}deg)` },
    ],
    { duration: rand(1600, 3400), iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -rand(0, 3000) }
  );
}

if (!reducedMotion.matches) {
  const back = document.getElementById("petals-back");
  const front = document.getElementById("petals-front");
  for (let i = 0; i < 10; i++) addPetal(back, "sakura", rand(11, 22), rand(13, 24));
  for (let i = 0; i < 6; i++)  addPetal(back, "tpetal", rand(16, 28), rand(14, 26));
  for (let i = 0; i < 3; i++)  addPetal(front, "sakura", rand(24, 38), rand(9, 14));
  for (let i = 0; i < 2; i++)  addPetal(front, "tpetal", rand(30, 44), rand(10, 15));
}

const litter = document.getElementById("litter");
[[5, 14], [11, 42], [4, 70], [9, 91], [27, 93], [73, 94], [91, 88], [95, 62], [90, 33], [94, 9], [41, 5], [63, 4]]
  .forEach(([x, y], i) => {
    const p = document.createElement("div");
    p.className = "lp";
    p.style.left = x + "%";
    p.style.top = y + "%";
    p.style.setProperty("--r", rand(0, 360) + "deg");
    const size = rand(16, 26);
    p.innerHTML = `<svg width="${size}" height="${size * 1.2}" viewBox="0 0 20 24" aria-hidden="true"><use href="#${i % 3 === 0 ? "tpetal" : "sakura"}"/></svg>`;
    litter.appendChild(p);
  });

/* ---------- Fireflies ---------- */
if (!reducedMotion.matches) {
  const fireflies = document.getElementById("fireflies");
  for (let i = 0; i < 14; i++) {
    const f = document.createElement("i");
    f.className = "ff";
    const s = rand(3, 6);
    f.style.cssText = `left:${rand(2, 98)}%;top:${rand(8, 92)}%;width:${s}px;height:${s}px`;
    fireflies.appendChild(f);
    f.animate(
      [{ transform: "translate(0, 0)" }, { transform: `translate(${rand(-80, 80)}px, ${rand(-60, 60)}px)` }],
      { duration: rand(7000, 15000), iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -rand(0, 10000) }
    );
    f.animate([{ opacity: 0.12 }, { opacity: 1 }, { opacity: 0.12 }],
      { duration: rand(2200, 5000), iterations: Infinity, delay: -rand(0, 5000) });
  }
}

/* ---------- When the 3D layer (scene.js) is running, drop the flat 2D petals and fireflies ---------- */
addEventListener("scene3d:ready", () => {
  document.querySelectorAll(".petals, .fireflies").forEach((el) => el.remove());
});

/* ---------- Only load the custom background layer if the image exists ---------- */
const bgProbe = new Image();
bgProbe.onload = () => document.body.classList.add("has-bg");
bgProbe.src = "images/background.jpg";

/* ---------- Lite mode on slow devices ----------
   Watches the frame rate for a few seconds. If most frames are slower than
   about 30 per second, it turns off the extras (front petals, fireflies, steam,
   half the petals, soft shadows) so the book itself stays smooth. */
setTimeout(() => {
  let last = performance.now(), slow = 0, count = 0;
  function tick(now) {
    const dt = now - last;
    last = now;
    if (dt < 500) { count++; if (dt > 34) slow++; }
    if (count >= 120) {
      if (slow > 40) { document.body.classList.add("lite"); return; }
      slow = 0; count = 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}, 2500);

render();
