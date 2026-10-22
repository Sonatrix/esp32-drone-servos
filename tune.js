"use strict";
/* Tune the roll auto-level: sliders -> step test -> response chart + verdict.
   Works on top of the fly station (fly.js owns the simulation and the recorder). */
const Tune = (() => {
  const DEFAULTS = { kp: 0.035, kd: 0.008, vmax: 380, noise: 0 };
  const BAND = 3;                       // "levelled" means within ±3°
  const cv = $("tnChart"), ctx = cv.getContext("2d");
  describe("tnChart", "Chart of the plane's roll angle over four seconds after a 30 degree tip, showing how well the auto-level settles");
  let last = null, shown = null, running = false;

  // Turn recorded [t, roll] samples into numbers and a plain-language verdict.
  function analyze(samples) {
    const roll = samples.map((s) => s[1]);
    const undershoot = Math.max(0, -Math.min(...roll));                 // went past level to the other side
    let settle = 0;
    samples.forEach(([t, r]) => { if (Math.abs(r) > BAND) settle = t; });
    let crossings = 0, lastSign = 0;                                    // sign changes between "clearly positive" and "clearly negative"
    roll.forEach((r) => { if (Math.abs(r) > 1) { const sg = Math.sign(r); if (lastSign && sg !== lastSign) crossings++; lastSign = sg; } });
    const tEnd = samples.length ? samples[samples.length - 1][0] : 0;
    const lateAmp = Math.max(0, ...samples.filter(([t]) => t > tEnd - 1).map(([, r]) => Math.abs(r)));
    let verdict, text;
    if (crossings >= 3 || (crossings >= 2 && lateAmp > BAND)) { verdict = "oscillating"; text = "🌀 Oscillating: it rings back and forth around level. Lower Kp, raise Kd (damping) or use a faster servo."; }
    else if (settle >= tEnd - 0.05 && lateAmp > BAND) { verdict = "sluggish"; text = "🐌 Sluggish: it hasn't levelled in time. Raise Kp (or a faster servo helps)."; }
    else if (undershoot > 10) { verdict = "overshoots"; text = `↩️ Overshoots by ${undershoot.toFixed(0)}°. Add some Kd (damping).`; }
    else if (settle <= 1.0 && undershoot <= 5) { verdict = "excellent"; text = `✅ Excellent: levelled in ${settle.toFixed(2)} s with only ${undershoot.toFixed(1)}° overshoot.`; }
    else { verdict = "ok"; text = `👍 Works: levelled in ${settle.toFixed(2)} s, overshoot ${undershoot.toFixed(1)}°. Can you make it faster than 1 s?`; }
    return { settle, over: undershoot, crossings, lateAmp, verdict, ok: verdict === "ok" || verdict === "excellent", text };
  }

  function draw(samples) {
    const W = cv.width, H = cv.height, L = 46, R = 12, T = 14, B = 34, dur = 4, ymin = -20, ymax = 35;
    const X = (t) => L + (t / dur) * (W - L - R), Y = (a) => T + ((ymax - a) / (ymax - ymin)) * (H - T - B);
    ctx.clearRect(0, 0, W, H);
    ctx.font = "12px Segoe UI, sans-serif";
    const ink = getComputedStyle(document.body).color;
    // ±3° target band
    ctx.fillStyle = "rgba(34,197,94,.22)"; ctx.fillRect(L, Y(BAND), W - L - R, Y(-BAND) - Y(BAND));
    // grid
    ctx.strokeStyle = "rgba(148,163,184,.4)"; ctx.lineWidth = 1; ctx.fillStyle = "#94a3b8";
    [-20, -10, 0, 10, 20, 30].forEach((a) => { ctx.beginPath(); ctx.moveTo(L, Y(a)); ctx.lineTo(W - R, Y(a)); ctx.stroke(); ctx.fillText(a + "°", 8, Y(a) + 4); });
    for (let t = 0; t <= dur; t++) { ctx.fillText(t + " s", X(t) - 8, H - 12); }
    ctx.fillStyle = "#16a34a"; ctx.fillText("levelled (±3°)", L + 6, Y(BAND) - 5);
    if (!samples || !samples.length) { ctx.fillStyle = ink; ctx.fillText("Press “Run step test”", W / 2 - 60, H / 2); return; }
    ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 3; ctx.beginPath();
    samples.forEach(([t, r], i) => { const x = X(t), y = Y(clamp(r, ymin, ymax)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }

  function readUi() {
    const g = TABS.fly.state().G;
    $("tnKpOut").textContent = g.kp.toFixed(3);
    $("tnKdOut").textContent = g.kd.toFixed(3);
    $("tnSpeedOut").textContent = Math.round(g.vmax) + "°/s";
    $("tnNoiseOut").textContent = g.noise.toFixed(1) + "°";
  }
  const fromSliders = () => ({ kp: +$("tnKp").value, kd: +$("tnKd").value, vmax: +$("tnSpeed").value, noise: +$("tnNoise").value });
  function pushSliders(g) { $("tnKp").value = g.kp; $("tnKd").value = g.kd; $("tnSpeed").value = g.vmax; $("tnNoise").value = g.noise; }

  // Start a step test: tip the plane 30° with auto-level on and record 4 s.
  function start() {
    TABS.fly.set({ auto: true, wing: false, resetSim: true, roll: 30, man: { r: 0, p: 0, y: 0 } });
    TABS.fly.startRec(4); running = true; shown = null;
    $("tnVerdict").textContent = "Testing…";
  }
  // Called by fly.js every frame: draw live, finish when the recorder is done.
  function update() {
    const rec = TABS.fly.getRec();
    if (!rec || !running) return;
    draw(rec.s);
    if (rec.done) { running = false; last = analyze(rec.s); shown = last; $("tnVerdict").textContent = last.text; draw(rec.s); }
  }
  // Synchronous version (used by tests): runs the whole test without waiting for frames.
  function runSync(gains) {
    if (gains) { TABS.fly.set({ G: gains }); pushSliders({ ...TABS.fly.state().G }); }
    start();
    for (let i = 0; i < 4 / (1 / 60) + 2; i++) TABS.fly.step(1 / 60);
    update();
    return last;
  }

  $("tnRun").addEventListener("click", () => { TABS.fly.set({ G: fromSliders() }); start(); });
  $("tnReset").addEventListener("click", () => { TABS.fly.set({ G: DEFAULTS }); pushSliders(DEFAULTS); readUi(); });
  ["tnKp", "tnKd", "tnSpeed", "tnNoise"].forEach((id) => $(id).addEventListener("input", () => { TABS.fly.set({ G: fromSliders() }); readUi(); }));

  draw(null);
  readUi();
  return { update, runSync, analyze, start, readUi, DEFAULTS, get last() { return last; } };
})();
