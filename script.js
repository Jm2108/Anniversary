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
  if (current < total) {
    const leaf = leaves[current];
    current++; started = true; startMusic();
    turn(leaf, "fwd");
    render();
  }
}
function prev() {
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

async function readSpread() {
  const id = ++runId;
  stopNarration();
  book.querySelectorAll(".face.reading").forEach((f) => f.classList.remove("reading"));

  await wait(current === 0 ? 400 : 900);        // let the page finish turning

  for (const face of spreadFaces()) {
    if (id !== runId) return;                   // user turned the page, stop
    face.classList.add("reading");
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
const MUSIC_VOL = 0.25;     // normal background level (0 to 1)
const DUCK_VOL = 0.08;      // level while your voice is speaking

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
  soundBtn.classList.toggle("muted", muted);
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

function setMusicLevel(v) {
  musicLevel = v;
  if (musicStarted) fadeMusicTo(v, 700);
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  music.play()
    .then(() => fadeMusicTo(musicLevel, 2500))      // slow fade-in
    .catch(() => { musicStarted = false; });
}

soundBtn.addEventListener("click", () => {
  muted = !muted;
  music.muted = muted;
  try { localStorage.setItem("bookMuted", muted ? "1" : "0"); } catch (e) {}
  showMuted();
});

/* ---------- Input ---------- */
document.getElementById("next").addEventListener("click", next);
document.getElementById("prev").addEventListener("click", prev);

book.querySelectorAll(".front").forEach((el) =>
  el.addEventListener("click", (e) => { if (!e.target.closest("video")) next(); })
);
book.querySelectorAll(".back").forEach((el) =>
  el.addEventListener("click", (e) => { if (!e.target.closest("video")) prev(); })
);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
});

/* ---------- Gentle 3D tilt that follows the pointer ---------- */
const tilt = document.getElementById("tilt");
if (!reducedMotion.matches) {
  let raf = 0;
  addEventListener("pointermove", (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      tilt.style.transform = `rotateX(${(12 - y * 5).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
    });
  });
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