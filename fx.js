/* fx.js: day/night lamp, hover labels, and the four clickable things on the table
   (lamp, paper birds, tulips, envelope). Needs vendor/gsap.min.js.
   Everything still works without GSAP; it just appears instead of animating. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const hasGsap = !!window.gsap;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const sparkle = (x, y, n, power) =>
    dispatchEvent(new CustomEvent("fx:sparkle", { detail: { x, y, n, power } }));

  const lamp = $(".lamp");
  if (!lamp) return;                       // props are hidden on small screens
  const glow = $(".light-wrap", lamp);
  const lampSvg = $("svg", lamp);
  const cranes = $$(".crane");
  const vase = $(".vase");
  const envelope = $(".letter");
  const tip = $("#fx-tip");

  /* ===================== Hover labels + shared wiring ===================== */
  function showTip(el) {
    const text = el.dataset.tip;
    if (!text || !tip) return;
    tip.innerHTML = text;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = clamp(r.left + r.width / 2 - t.width / 2, 8, innerWidth - t.width - 8);
    let top = r.top - t.height - 12;
    if (top < 8) top = r.bottom + 12;
    tip.style.transform = `translate(${left}px, ${top}px)`;
    tip.classList.add("on");
  }
  const hideTip = () => tip && tip.classList.remove("on");

  function wire(el, onClick, onHover) {
    el.addEventListener("click", (e) => { e.stopPropagation(); hideTip(); onClick(e); });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hideTip(); onClick(e); }
    });
    el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "mouse") return; showTip(el); onHover && onHover(true); });
    el.addEventListener("pointerleave", (e) => { if (e.pointerType !== "mouse") return; hideTip(); onHover && onHover(false); });
    el.addEventListener("focus", () => { if (el.matches(":focus-visible")) showTip(el); });
    el.addEventListener("blur", hideTip);
  }

  /* ===================== Day / night ===================== */
  // night: 0 = day, 1 = night. scene.js reads this each frame to turn
  // sunrays into moonlight and to change the colour of the 3D lighting.
  const TOD = (window.TOD = { night: 0 });
  const dayEl = $(".tod-day");
  const nightEl = $(".tod-night");
  let theme = "day";
  try { if (localStorage.getItem("bookTheme") === "night") theme = "night"; } catch (e) {}

  function paint() {
    const n = TOD.night;
    nightEl.style.opacity = n.toFixed(3);
    dayEl.style.opacity = (1 - n).toFixed(3);
    glow.style.opacity = (0.2 + 0.8 * n).toFixed(3);
    const shadow = body.classList.contains("lite") ? "" : " drop-shadow(2px 5px 4px rgba(0,0,0,.55))";
    lampSvg.style.filter = `brightness(${(0.66 + 0.34 * n).toFixed(3)}) saturate(${(0.8 + 0.2 * n).toFixed(3)})${shadow}`;
    body.dataset.theme = n > 0.5 ? "night" : "day";
  }

  function setTheme(mode, animate) {
    theme = mode;
    lamp.setAttribute("aria-checked", String(mode === "night"));
    try { localStorage.setItem("bookTheme", mode); } catch (e) {}
    const to = mode === "night" ? 1 : 0;
    if (!animate || !hasGsap || calm) { TOD.night = to; paint(); return; }
    gsap.to(TOD, { night: to, duration: 2.4, ease: "sine.inOut", overwrite: true, onUpdate: paint });
  }
  TOD.night = theme === "night" ? 1 : 0;
  lamp.setAttribute("aria-checked", String(theme === "night"));
  paint();

  /* ----- Lamp: sways on hover, squashes and sends out a ring of light on click ----- */
  let sway = null;
  function lampHover(on) {
    if (!hasGsap || calm) return;
    if (on) {
      sway = gsap.timeline({ repeat: -1, yoyo: true })
        .to(lamp, { rotation: 1.7, transformOrigin: "50% 100%", duration: 0.75, ease: "sine.inOut" });
      gsap.to(glow, { scale: 1.07, duration: 0.5, ease: "power2.out", overwrite: "auto" });
    } else {
      if (sway) sway.kill();
      gsap.to(lamp, { rotation: 0, duration: 0.9, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
      gsap.to(glow, { scale: 1, duration: 0.6, ease: "power2.out", overwrite: "auto" });
    }
  }
  function ripple(toNight) {
    const r = lamp.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "fx-ripple";
    el.style.setProperty("--ripple", toNight ? "rgba(255,200,130,.65)" : "rgba(255,236,170,.6)");
    el.style.left = r.left + r.width / 2 + "px";
    el.style.top = r.top + r.height * 0.45 + "px";
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.2, opacity: 0.9 },
      { scale: Math.max(innerWidth, innerHeight) / 26, opacity: 0, duration: 1.7, ease: "power2.out", onComplete: () => el.remove() });
  }
  wire(lamp, () => {
    const toNight = theme !== "night";
    if (hasGsap && !calm) {
      ripple(toNight);
      gsap.timeline()
        .to(lamp, { scaleY: 0.92, scaleX: 1.06, transformOrigin: "50% 100%", duration: 0.11, ease: "power2.in" })
        .to(lamp, { scaleX: 1, scaleY: 1, duration: 1, ease: "elastic.out(1.1, 0.35)" });
    }
    if (navigator.vibrate) navigator.vibrate(8);
    setTheme(toNight ? "night" : "day", true);
  }, lampHover);

  /* ===================== Tulips: a glass note from the vase base ===================== */
  const note = $("#fx-note");
  const noteP = $("p", note);
  let noteOpen = false;

  // split into words (text stays exactly as written) so they can fade in one by one
  const noteWords = noteP.textContent.trim().split(/\s+/);
  noteP.innerHTML = noteWords.map((w) => `<span class="word">${w}</span>`).join(" ");
  const words = $$(".word", noteP);

  function placeNote() {
    const r = $("svg", vase).getBoundingClientRect();
    const w = note.offsetWidth, h = note.offsetHeight;
    let left = r.left - w - 16;
    let top = r.bottom - h - 6;
    note.classList.remove("above");
    if (left < 12) {                         // narrow screens: put it above the vase
      left = clamp(r.right - w, 12, innerWidth - w - 12);
      top = r.top - h - 16;
      note.classList.add("above");
    }
    top = clamp(top, 12, innerHeight - h - 12);
    note.style.setProperty("--tail", clamp(r.left + r.width / 2 - left - 8, 18, w - 34) + "px");
    note.style.transform = `translate(${left}px, ${top}px)`;
    return { left, top, w, h, r };
  }
  function noteOrigin(p) {                   // grow out of the base of the vase
    const ox = clamp(p.r.left + p.r.width / 2 - p.left, 0, p.w);
    const oy = clamp(p.r.bottom - p.top, 0, p.h);
    return `${ox}px ${oy}px`;
  }
  let vaseSway = null;
  function vaseHover(on) {
    if (!hasGsap || calm || noteOpen) return;
    const g = $(".t-sway", vase);
    if (on) {
      vaseSway = gsap.timeline({ repeat: -1, yoyo: true })
        .to(g, { rotation: 2.6, svgOrigin: "50 98", duration: 0.6, ease: "sine.inOut" });
    } else {
      if (vaseSway) vaseSway.kill();
      gsap.to(g, { rotation: 0, svgOrigin: "50 98", duration: 0.8, ease: "elastic.out(1, 0.35)" });
    }
  }
  function openNote() {
    noteOpen = true;
    vase.setAttribute("aria-expanded", "true");
    note.hidden = false;
    const p = placeNote();
    const r = vase.getBoundingClientRect();
    sparkle(r.left + r.width / 2, r.top + r.height * 0.25, 7, 0.5);
    if (!hasGsap || calm) return;
    if (vaseSway) vaseSway.kill();
    const g = $(".t-sway", vase);
    gsap.fromTo(g, { rotation: -5 }, { rotation: 0, svgOrigin: "50 98", duration: 1.4, ease: "elastic.out(1, 0.3)" });
    gsap.killTweensOf([note, ...words]);
    gsap.set(note, { transformOrigin: noteOrigin(p) });
    gsap.fromTo(note, { scale: 0.15, opacity: 0, filter: "blur(10px)" },
      { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.9, ease: "elastic.out(1, 0.7)", clearProps: "filter" });
    gsap.fromTo(words, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.07, delay: 0.25 });
  }
  function closeNote() {
    if (!noteOpen) return;
    noteOpen = false;
    vase.setAttribute("aria-expanded", "false");
    if (!hasGsap || calm) { note.hidden = true; return; }
    gsap.killTweensOf(note);
    gsap.to(note, { scale: 0.2, opacity: 0, duration: 0.35, ease: "power2.in", onComplete: () => { note.hidden = true; } });
  }
  wire(vase, () => (noteOpen ? closeNote() : (closeLetter(), openNote())), vaseHover);
  $(".fx-x", note).addEventListener("click", closeNote);
  document.addEventListener("click", (e) => {
    if (noteOpen && !note.contains(e.target) && !vase.contains(e.target)) closeNote();
  });
  addEventListener("resize", () => { if (noteOpen) placeNote(); });

  /* ===================== Paper birds: pop up in 3D, fly across the screen, leave ===================== */
  const sky = $("#fx-sky");

  // Catmull-Rom spline through points: t in 0..1
  function spline(pts, t) {
    const n = pts.length - 1;
    const seg = Math.min(n - 1, Math.floor(t * n));
    const u = t * n - seg;
    const p0 = pts[Math.max(seg - 1, 0)], p1 = pts[seg], p2 = pts[seg + 1], p3 = pts[Math.min(seg + 2, n)];
    const f = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }

  function craneHover(g, on) {
    if (!hasGsap || calm || g.dataset.flying) return;
    // only the picture moves; the invisible hit area stays put so the pointer never slips off
    gsap.to($(".hop", g), on
      ? { y: -7, rotation: -6, duration: 0.35, ease: "back.out(2.2)", overwrite: "auto" }
      : { y: 0, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
  }

  function flyCrane(g) {
    if (g.dataset.flying) return;
    const hop = $(".hop", g);
    const r = hop.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!hasGsap || calm) { sparkle(cx, cy, 4, 0.4); return; }

    g.dataset.flying = "1";
    const shape = $("g", hop);                                 // the paper paths, without the table pose
    const flier = document.createElement("div");
    flier.className = "fx-flier";
    flier.style.width = r.width * 1.05 + "px";
    flier.style.height = r.width * 1.05 * (48 / 76) + "px";
    flier.innerHTML = `<svg viewBox="2 4 76 48" aria-hidden="true">${shape.innerHTML}</svg>`;
    sky.appendChild(flier);
    const fw = flier.offsetWidth, fh = flier.offsetHeight;
    const wing = $("svg", flier);

    gsap.killTweensOf(hop);
    gsap.set(hop, { opacity: 0, y: 0, rotation: 0 });
    gsap.set(flier, { x: cx - fw / 2, y: cy - fh / 2, transformPerspective: 900, transformOrigin: "50% 50%", scale: 1 });
    gsap.set(wing, { transformPerspective: 500, transformOrigin: "50% 60%" });

    const W = innerWidth, H = innerHeight;
    const popY = cy - 90;
    const popX = cx - Math.min(W * 0.16, 260);            // rises toward the middle so it never clips the edge
    const path = [
      { x: popX, y: popY },
      { x: W * 0.74, y: H * 0.3 },
      { x: W * 0.56, y: H * 0.64 },
      { x: W * 0.3, y: H * 0.4 },
      { x: W * 0.16, y: H * 0.7 },
      { x: W * 0.3, y: H * 0.14 },
      { x: -W * 0.14, y: -H * 0.06 },
    ];
    const st = { p: 0 };
    let lastSpark = 0, prev = { x: popX, y: popY };

    const tl = gsap.timeline({
      onComplete: () => {
        flier.remove();
        delete g.dataset.flying;
        // a new bird folds itself on the table a moment later
        gsap.fromTo(hop, { opacity: 0, scale: 0.3, y: 0, rotation: 0 },
          { opacity: 1, scale: 1, duration: 1.5, ease: "back.out(2.4)", delay: 1.6 });
      },
    });
    // 1) pops up toward you
    tl.fromTo(flier,
      { rotationY: -75, rotationX: 28 },
      { scale: 2.7, z: 200, x: popX - fw / 2, y: popY - fh / 2, rotationY: 0, rotationX: 0, duration: 0.95, ease: "back.out(1.7)" });
    sparkle(cx, cy, 5, 0.45);
    // 2) glides across the screen, shrinking into the distance
    tl.to(flier, { z: -220, duration: 5.4, ease: "sine.inOut" }, 0.95);
    tl.to(st, {
      p: 1, duration: 5.4, ease: "power1.inOut",
      onUpdate() {
        const pt = spline(path, st.p);
        const vx = pt.x - prev.x, vy = pt.y - prev.y;
        prev = pt;
        const facing = vx / (Math.abs(vx) + 1.6);                // -1..1, passes through 0 when it turns
        const roll = Math.atan2(vy, Math.abs(vx) + 2.5) * (180 / Math.PI) * 0.55;
        const s = 2.7 - 1.3 * st.p + 0.28 * Math.sin(st.p * Math.PI * 3);
        gsap.set(flier, { x: pt.x - fw / 2, y: pt.y - fh / 2, scaleX: s * (facing || 1), scaleY: s, rotation: roll });
        gsap.set(wing, { rotationX: Math.sin(performance.now() * 0.017) * 24 });
        const now = performance.now();
        if (now - lastSpark > 120) { lastSpark = now; sparkle(pt.x, pt.y, 1, 0.16); }
      },
    }, 0.95);
    tl.to(flier, { opacity: 0, duration: 0.4 }, ">-0.35");
  }

  cranes.forEach((g) => wire(g, () => flyCrane(g), (on) => craneHover(g, on)));

  /* ===================== Envelope: the flap opens, a sheet slides out and unfolds into a pop-up ===================== */
  const letter = $("#fx-letter");
  const backdrop = $("#fx-backdrop");
  const flap = $(".env-flap", envelope);
  const seal = $(".env-seal", envelope);
  const cavity = $(".env-in", envelope);
  const pocket = $(".env-pocket", envelope);
  const card = $(".env-card", envelope);
  const FLAP = { tip: 62 };                       // y of the flap's point; goes above the top edge when open
  const RISE = -44;                               // how far the sheet slides out of the envelope
  const drawFlap = () => {
    flap.setAttribute("d", `M6 12 L80 ${FLAP.tip.toFixed(1)} L154 12Z`);
    flap.setAttribute("fill", FLAP.tip < 12 ? "#f6ecda" : "#e6d3b4");
  };
  let letterOpen = false, letterBusy = false, unfoldTl = null;

  function envelopeHover(on) {
    if (!hasGsap || calm || letterOpen) return;
    gsap.to(envelope, on
      ? { y: -7, rotation: 2.2, duration: 0.35, ease: "back.out(2)", overwrite: "auto" }
      : { y: 0, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.45)", overwrite: "auto" });
    gsap.to(FLAP, { tip: on ? 54 : 62, duration: 0.3, ease: "power2.out", onUpdate: drawFlap, overwrite: "auto" });
  }

  // Put the pop-up exactly over the sheet that is sticking out of the envelope, clipped to the sheet's shape.
  function sheetPose() {
    const r = card.getBoundingClientRect();
    const lw = letter.offsetWidth, lh = letter.offsetHeight;
    const keep = Math.min(1, (r.height / r.width) * (lw / lh));      // fraction of the letter's height that fits the sheet
    return {
      x: r.left + r.width / 2 - innerWidth / 2,
      y: r.top + r.height / 2 - innerHeight / 2,
      scale: r.width / lw,
      clip: `inset(0% 0% ${((1 - keep) * 100).toFixed(2)}% 0% round 2px)`,
    };
  }
  const FULL = "inset(0% 0% 0% 0% round 2px)";

  /* ----- Voice message: a play button inside the letter. Put your recording at the path below. ----- */
  const LETTER_AUDIO = "audio/envelope-letter.mp3";
  const voice = document.createElement("div");
  voice.className = "fx-voice";
  voice.hidden = true;                                           // shown only once the file is found
  voice.innerHTML = `
    <button type="button" class="fx-play" aria-label="Play my voice message">
      <svg class="ic-play" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
      <svg class="ic-pause" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
    </button>
    <div class="fx-voice-meta"><span class="fx-voice-label">Listen to my voice</span><div class="fx-bar"><i></i></div></div>
    <span class="fx-time">0:00</span>`;
  const heading = $("h2", letter);
  heading.after(voice);
  const playBtn = $(".fx-play", voice), bar = $(".fx-bar", voice), fill = $("i", bar), timeEl = $(".fx-time", voice);
  const letterAudio = new Audio();
  letterAudio.preload = "metadata";
  letterAudio.src = LETTER_AUDIO;
  const fmt = (s) => (isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00");
  letterAudio.addEventListener("loadedmetadata", () => { voice.hidden = false; timeEl.textContent = fmt(letterAudio.duration); });
  letterAudio.addEventListener("error", () => { voice.hidden = true; });           // no file yet: no player
  letterAudio.addEventListener("timeupdate", () => {
    const d = letterAudio.duration || 1;
    fill.style.width = (letterAudio.currentTime / d) * 100 + "%";
    timeEl.textContent = fmt(letterAudio.currentTime);
  });

  // while the voice plays, the page's own narration waits and the music dips
  let pausedNarration = null;
  function pauseNarration() {
    // only a clip that is really playing (a missing audio file never counts)
    const n = typeof narration !== "undefined" ? narration : null;
    if (n && !n.paused && !n.ended && !n.error && n.readyState > 2 && n.currentTime > 0) { n.pause(); pausedNarration = n; }
  }
  function resumeNarration() {
    const n = pausedNarration;
    pausedNarration = null;
    if (n && typeof narration !== "undefined" && n === narration) n.play().catch(() => {});
  }
  const settleMusic = () => { if (typeof setMusicLevel === "function") setMusicLevel(pausedNarration ? DUCK_VOL : MUSIC_VOL); };
  letterAudio.addEventListener("play", () => {
    voice.classList.add("playing"); playBtn.setAttribute("aria-label", "Pause my voice message");
    if (typeof setMusicLevel === "function") setMusicLevel(DUCK_VOL);
  });
  const stopped = () => { voice.classList.remove("playing"); playBtn.setAttribute("aria-label", "Play my voice message"); settleMusic(); };
  letterAudio.addEventListener("pause", stopped);
  letterAudio.addEventListener("ended", () => { letterAudio.currentTime = 0; fill.style.width = "0%"; timeEl.textContent = fmt(letterAudio.duration); stopped(); });
  playBtn.addEventListener("click", () => { if (letterAudio.paused) letterAudio.play().catch(() => {}); else letterAudio.pause(); });
  const seek = (e) => {
    const r = bar.getBoundingClientRect();
    if (letterAudio.duration) letterAudio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * letterAudio.duration;
  };
  bar.addEventListener("pointerdown", (e) => { seek(e); bar.setPointerCapture && bar.setPointerCapture(e.pointerId); bar.onpointermove = seek; });
  bar.addEventListener("pointerup", () => { bar.onpointermove = null; });
  function stopLetterAudio() { letterAudio.pause(); letterAudio.currentTime = 0; fill.style.width = "0%"; if (letterAudio.duration) timeEl.textContent = fmt(letterAudio.duration); }

  function openLetter() {
    if (letterOpen || letterBusy) return;
    letterOpen = letterBusy = true;
    body.classList.add("fx-modal");
    envelope.setAttribute("aria-expanded", "true");
    closeNote();
    hideTip();
    pauseNarration();
    backdrop.hidden = false;
    letter.hidden = false;
    $(".fx-paper", letter).scrollTop = 0;

    if (!hasGsap || calm) {
      letter.style.transform = "translate(-50%, -50%)";
      cavity.setAttribute("opacity", 1); pocket.setAttribute("opacity", 1); seal.style.opacity = 0;
      letterBusy = false;
      $(".fx-x", letter).focus();
      return;
    }
    gsap.set(letter, { opacity: 0 });
    gsap.set(backdrop, { opacity: 0 });
    gsap.killTweensOf([envelope, FLAP]);

    // 1) the envelope settles, the seal cracks off, the flap swings open, the sheet slides out
    const tl = gsap.timeline({ onComplete: unfold });
    tl.to(envelope, { y: 0, rotation: 0, duration: 0.4, ease: "power2.out" }, 0)
      .to(seal, { x: 1.6, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, 0.1)
      .to(seal, { y: 26, rotation: 28, opacity: 0, duration: 0.5, ease: "power2.in" }, 0.35)
      .to(FLAP, { tip: -38, duration: 0.85, ease: "power3.inOut", onUpdate: drawFlap }, 0.45)
      .to([cavity, pocket], { attr: { opacity: 1 }, duration: 0.3 }, 0.6)
      .to(backdrop, { opacity: 1, duration: 0.8, ease: "power1.out" }, 0.8)
      .set(card, { opacity: 1 }, 0.9)
      .to(card, { y: RISE, duration: 0.75, ease: "power3.out" }, 1.0);
    const b = envelope.getBoundingClientRect();
    sparkle(b.left + b.width / 2, b.top + b.height * 0.2, 9, 0.5);

    // 2) the pop-up takes over from the sheet and unfolds toward you like paper
    function unfold() {
      const s = sheetPose();
      gsap.set(letter, {
        xPercent: -50, yPercent: -50, x: s.x, y: s.y, scale: s.scale, rotation: -8,
        opacity: 1, clipPath: s.clip, transformPerspective: 1200, transformOrigin: "50% 50%",
      });
      gsap.set(card, { opacity: 0 });
      letterBusy = false;                                      // from here the letter can already be closed again
      unfoldTl = gsap.timeline({ onComplete: () => { letter.style.clipPath = "none"; $(".fx-x", letter).focus({ preventScroll: true }); } })
        .to(letter, { x: 0, y: 0, scale: 1, rotation: 0, clipPath: FULL, duration: 1.2, ease: "power3.inOut" }, 0)
        .fromTo(letter, { rotationX: 52 }, { rotationX: 0, duration: 1.05, ease: "power3.out" }, 0)
        .to(letter, { rotation: 0.9, duration: 0.18, ease: "sine.out" }, 1.05)
        .to(letter, { rotation: 0, duration: 0.8, ease: "elastic.out(1, 0.45)" }, 1.23);
    }
  }

  function closeLetter() {
    if (!letterOpen || letterBusy) return;
    letterOpen = false;
    envelope.setAttribute("aria-expanded", "false");
    stopLetterAudio();
    const done = () => {
      resumeNarration();
      letter.hidden = true; backdrop.hidden = true;
      body.classList.remove("fx-modal");
      envelope.focus({ preventScroll: true });
    };
    if (!hasGsap || calm) {
      cavity.setAttribute("opacity", 0); pocket.setAttribute("opacity", 0); seal.style.opacity = 1;
      done(); return;
    }
    letterBusy = true;
    if (unfoldTl) { unfoldTl.kill(); unfoldTl = null; }
    gsap.killTweensOf([letter, card]);
    gsap.set(card, { y: RISE });
    const s = sheetPose();
    // the paper folds back down onto the sheet, the sheet slides in, the flap closes and the seal returns
    gsap.timeline({ onComplete: () => { done(); letterBusy = false; } })
      .to(letter, { x: s.x, y: s.y, scale: s.scale, rotation: -8, rotationX: 38, clipPath: s.clip, duration: 0.9, ease: "power3.inOut" }, 0)
      .to(backdrop, { opacity: 0, duration: 0.7 }, 0.25)
      .set(letter, { opacity: 0 }, 0.9)
      .set(card, { opacity: 1 }, 0.9)
      .to(card, { y: 0, duration: 0.6, ease: "power2.inOut" }, 0.95)
      .to(FLAP, { tip: 62, duration: 0.75, ease: "power3.inOut", onUpdate: drawFlap }, 1.45)
      .set(card, { opacity: 0 }, 1.6)
      .to([cavity, pocket], { attr: { opacity: 0 }, duration: 0.3 }, 2.0)
      .to(seal, { y: 0, rotation: 0, x: 0, opacity: 1, duration: 0.5, ease: "back.out(2)" }, 2.05);
  }
  wire(envelope, () => (letterOpen ? closeLetter() : openLetter()), envelopeHover);
  $(".fx-x", letter).addEventListener("click", closeLetter);
  backdrop.addEventListener("click", closeLetter);

  // keep Tab inside the open letter
  letter.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); $(".fx-x", letter).focus(); }
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (letterOpen) closeLetter(); else closeNote();
  });

  // tidy the scene when the page loses focus mid-animation
  addEventListener("blur", hideTip);
})();