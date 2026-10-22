"use strict";
/* Station 3: control-surface servos on a fixed-wing ESP32 drone + auto-level */
(() => {
  const MAXD = 30;                 // max surface deflection in degrees (servo 60°..120°)
  const SURF = [
    { id: "aL", name: "Aileron L", gpio: 13, wingOnly: false, conv: true },
    { id: "aR", name: "Aileron R", gpio: 14, wingOnly: false, conv: true },
    { id: "el", name: "Elevator",  gpio: 27, conv: true },
    { id: "ru", name: "Rudder",    gpio: 26, conv: true },
  ];
  const slew = { aL: 0, aR: 0, el: 0, ru: 0 };       // actual deflection (deg), TE down = +
  const tgt = { aL: 0, aR: 0, el: 0, ru: 0 };
  const S = { roll: 0, pitch: 0, head: 0, rr: 0, pr: 0, dist: 0 };
  const man = { r: 0, p: 0, y: 0 };                    // manual commands -1..1 (p>0 = pull / nose up)
  const keys = new Set();
  let wing = false, auto = false, stickDown = false;
  // auto-level tuning knobs (the Tune panel edits these)
  const G = { kp: 0.035, kd: 0.008, kpP: 0.04, kdP: 0.01, noise: 0, vmax: 380 };
  let rec = null;                     // step-response recorder {t, dur, s:[[t, roll]], done}
  const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;   // ~N(0,1)

  /* ---------- top-view plane ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const plane = $("flyPlane");
  describe("flyPlane", "Top view of the drone with ailerons, elevator and rudder");
  describe("flyHorizon", "Artificial horizon showing the drone roll and pitch");
  plane.innerHTML = `
    <rect x="0" y="0" width="420" height="310" fill="none"/>
    <text x="210" y="16" text-anchor="middle" font-size="12" fill="#94a3b8">▲ nose (forward)</text>
    <ellipse cx="210" cy="140" rx="17" ry="100" fill="#cbd5e1" stroke="#64748b" stroke-width="3"/>
    <rect x="30"  y="105" width="168" height="48" rx="6" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/>
    <rect x="222" y="105" width="168" height="48" rx="6" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/>
    <rect x="160" y="222" width="100" height="22" rx="5" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/>
    <g id="sf-aL"><rect x="34"  y="154" width="82" height="16" rx="3" stroke="#334155" stroke-width="2"/></g>
    <g id="sf-aR"><rect x="304" y="154" width="82" height="16" rx="3" stroke="#334155" stroke-width="2"/></g>
    <g id="sf-el"><rect x="160" y="245" width="100" height="14" rx="3" stroke="#334155" stroke-width="2"/></g>
    <g id="sf-ru" transform="translate(210 258)"><rect id="ruRect" x="-4" y="0" width="8" height="36" rx="2" stroke="#334155" stroke-width="2"/></g>
    <text x="75"  y="196" text-anchor="middle" font-size="11" fill="#94a3b8">GPIO13</text>
    <text x="345" y="196" text-anchor="middle" font-size="11" fill="#94a3b8">GPIO14</text>
    <text x="210" y="283" font-size="11" fill="#94a3b8" text-anchor="middle" dx="62">GPIO27 ↑</text>
    <text x="210" y="304" font-size="11" fill="#94a3b8" text-anchor="middle" dx="-54">← GPIO26 rudder</text>
    <circle cx="210" cy="60" r="7" fill="#22c55e"/><text x="226" y="64" font-size="11" fill="#94a3b8">ESP32</text>`;

  const surfFill = (d) => (d > 2 ? "#3b82f6" : d < -2 ? "#f59e0b" : "#94a3b8");
  function drawPlane() {
    $("sf-aL").firstElementChild.setAttribute("fill", surfFill(slew.aL));
    $("sf-aR").firstElementChild.setAttribute("fill", surfFill(slew.aR));
    $("sf-el").firstElementChild.setAttribute("fill", surfFill(slew.el));
    // seen from above, a deflected surface looks shorter (foreshortened) around its hinge line
    const fs = (id, d, hingeY) => $(id).setAttribute("transform", `translate(0 ${hingeY}) scale(1 ${1 - Math.abs(d) / 70}) translate(0 ${-hingeY})`);
    fs("sf-aL", slew.aL, 154); fs("sf-aR", slew.aR, 154); fs("sf-el", slew.el, 245);
    $("ruRect").setAttribute("fill", Math.abs(slew.ru) > 2 ? "#a78bfa" : "#94a3b8");
    $("sf-ru").setAttribute("transform", `translate(210 258) rotate(${-slew.ru})`);
  }

  /* ---------- servo cards with airfoil cross-section ---------- */
  const cards = $("flyServos");
  cards.innerHTML = SURF.map((s) => `
    <div class="sc" id="sc-${s.id}">
      <svg viewBox="0 0 80 44"><path d="M4 24 Q26 6 54 18 L56 24 L54 27 Q26 34 4 24Z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>
        <g class="fl"><rect x="54" y="20" width="22" height="4" rx="1.5" fill="#f59e0b"/></g></svg>
      <div><b>${s.name}</b><span class="v"></span></div>
    </div>`).join("");

  function drawCards() {
    SURF.forEach((s) => {
      const d = slew[s.id], ang = 90 + d, el = $("sc-" + s.id);
      el.querySelector(".fl").setAttribute("transform", `rotate(${d * 0.9} 54 22)`);
      el.querySelector(".v").innerHTML = `<br>GPIO${s.gpio} · ${Math.round(ang)}° · ${angleToUs(ang)} µs`;
      const dead = wing && (s.id === "el" || s.id === "ru");
      el.classList.toggle("off", dead);
    });
  }

  /* ---------- horizon ---------- */
  const hz = $("flyHorizon"), hx = hz.getContext("2d");
  function drawHorizon() {
    const W = hz.width, c = W / 2, K = 2.4;
    hx.clearRect(0, 0, W, W);
    hx.save(); hx.beginPath(); hx.arc(c, c, c - 4, 0, TAU); hx.clip();
    hx.translate(c, c); hx.rotate((-S.roll * Math.PI) / 180); hx.translate(0, S.pitch * K);
    hx.fillStyle = "#38bdf8"; hx.fillRect(-300, -400, 600, 400);
    hx.fillStyle = "#a16207"; hx.fillRect(-300, 0, 600, 400);
    hx.strokeStyle = "#fff"; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(-300, 0); hx.lineTo(300, 0); hx.stroke();
    hx.fillStyle = "#fff"; hx.font = "11px Segoe UI"; hx.textAlign = "center";
    [-30, -20, -10, 10, 20, 30].forEach((a) => {
      const y = -a * K, w = Math.abs(a) % 20 === 0 ? 50 : 28;
      hx.beginPath(); hx.moveTo(-w, y); hx.lineTo(w, y); hx.stroke(); hx.fillText(String(Math.abs(a)), w + 14, y + 4);
    });
    hx.restore();
    hx.strokeStyle = "#334155"; hx.lineWidth = 4; hx.beginPath(); hx.arc(c, c, c - 4, 0, TAU); hx.stroke();
    hx.strokeStyle = "#fde047"; hx.lineWidth = 4; hx.beginPath();
    hx.moveTo(c - 60, c); hx.lineTo(c - 18, c); hx.lineTo(c, c + 14); hx.lineTo(c + 18, c); hx.lineTo(c + 60, c); hx.stroke();
    hx.textAlign = "start";
  }

  /* ---------- stick (pointer + keyboard) ---------- */
  const stick = $("stick"), knob = $("knob");
  function stickPos(e) {
    const r = stick.getBoundingClientRect(), R = r.width / 2 - 23;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; }
    man.r = dx / R; man.p = dy / R;      // stick back (down) = pull = nose up
  }
  stick.addEventListener("pointerdown", (e) => { stickDown = true; stick.setPointerCapture(e.pointerId); stickPos(e); });
  stick.addEventListener("pointermove", (e) => { if (stickDown) stickPos(e); });
  const up = () => { stickDown = false; man.r = 0; man.p = 0; };
  stick.addEventListener("pointerup", up); stick.addEventListener("pointercancel", up);
  window.addEventListener("keydown", (e) => { if (activeTab === "fly" && e.key.length && !(e.target instanceof Element && e.target.matches("input,select"))) { keys.add(e.key.toLowerCase()); if (e.key.startsWith("Arrow")) e.preventDefault(); } });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  $("flyYaw").addEventListener("input", (e) => (man.y = +e.target.value));
  $("flyYaw").addEventListener("change", (e) => { e.target.value = 0; man.y = 0; });

  $("flyWing").addEventListener("click", (e) => { wing = e.currentTarget.classList.toggle("on"); });
  $("flyAuto").addEventListener("click", (e) => { auto = e.currentTarget.classList.toggle("on"); });
  $("flyGust").addEventListener("click", () => { S.dist += (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 60); });

  /* ---------- simulation ---------- */
  function step(dt) {
    // keyboard overrides stick
    let kr = 0, kp = 0, ky = 0;
    if (keys.has("arrowleft")) kr -= 1; if (keys.has("arrowright")) kr += 1;
    if (keys.has("arrowup")) kp -= 1; if (keys.has("arrowdown")) kp += 1;
    if (keys.has("q")) ky -= 1; if (keys.has("e")) ky += 1;
    const m = { r: kr || man.r, p: kp || man.p, y: ky || man.y };

    const autoR = auto && Math.abs(m.r) < 0.06, autoP = auto && Math.abs(m.p) < 0.06;
    // the IMU is imperfect: noise in degrees (and a bigger one on the gyro rate)
    const mRoll = S.roll + G.noise * randn(), mRollRate = S.rr + G.noise * 6 * randn();
    const mPitch = S.pitch + G.noise * randn(), mPitchRate = S.pr + G.noise * 6 * randn();
    const cr = autoR ? clamp(-(mRoll * G.kp + mRollRate * G.kd), -1, 1) : m.r;
    const cp = autoP ? clamp(-(mPitch * G.kpP + mPitchRate * G.kdP), -1, 1) : m.p;
    const cy = m.y;
    S.cmd = { r: cr, p: cp, y: cy, autoR, autoP };

    // mixer: stick commands -> servo targets (TE down = +)
    if (!wing) {
      tgt.aL = MAXD * cr; tgt.aR = -MAXD * cr; tgt.el = -MAXD * cp; tgt.ru = MAXD * cy;
    } else {
      tgt.aL = clamp(MAXD * (-cp + cr), -MAXD, MAXD);
      tgt.aR = clamp(MAXD * (-cp - cr), -MAXD, MAXD);
      tgt.el = 0; tgt.ru = 0;
    }
    // servos move at a limited speed
    const vmax = G.vmax * dt;
    for (const k in slew) slew[k] += clamp(tgt[k] - slew[k], -vmax, vmax);

    // aerodynamics (very simplified)
    const rollEff = (slew.aL - slew.aR) / 2;
    const pitchEff = wing ? (slew.aL + slew.aR) / 2 : slew.el;
    const yawEff = wing ? 0 : slew.ru;
    // the airframe has inertia: rates follow the control surfaces with a lag (~0.15 s)
    const k = Math.min(1, dt / 0.15);
    S.rr += (3 * rollEff + S.dist - S.rr) * k;
    S.pr += (-2 * pitchEff - S.pr) * k;
    S.roll += S.rr * dt; S.pitch = clamp(S.pitch + S.pr * dt, -70, 70);
    if (S.roll > 180) S.roll -= 360; if (S.roll < -180) S.roll += 360;
    S.head = (S.head + (S.roll * 0.4 + 1.5 * yawEff) * dt + 360) % 360;
    S.dist *= Math.exp(-2.2 * dt);
    if (rec && !rec.done) { rec.t += dt; rec.s.push([rec.t, S.roll]); if (rec.t >= rec.dur) rec.done = true; }
  }

  function ui() {
    const c = S.cmd || { r: 0, p: 0, y: 0 };
    const R = 150 / 2 - 23;
    knob.style.left = 50 + (stickDown ? man.r : c.r) * R + "px";
    knob.style.top = 50 + (stickDown ? man.p : c.p) * R + "px";
    $("flyReadout").textContent =
      `roll ${S.roll.toFixed(0).padStart(4)}°   pitch ${S.pitch.toFixed(0).padStart(4)}°   heading ${S.head.toFixed(0).padStart(3)}°\n` +
      (c.autoR || c.autoP ? "🤖 ESP32 auto-level is steering the servos" : "🕹️ you are steering the servos");
  }

  function code() {
    const mix = wing
      ? `  // flying wing: both elevons share pitch AND roll
  float left  = constrain(-pitchCmd + rollCmd, -1.0f, 1.0f);
  float right = constrain(-pitchCmd - rollCmd, -1.0f, 1.0f);
  writeSurface(elevonL, left);
  writeSurface(elevonR, right);`
      : `  writeSurface(aileronL,  rollCmd);    // opposite directions
  writeSurface(aileronR, -rollCmd);
  writeSurface(elevator, -pitchCmd);   // pull back = trailing edge UP
  writeSurface(rudder,    yawCmd);`;
    const src = auto
      ? `  // auto-level: IMU roll/pitch (deg) and rates (deg/s) fight any disturbance
  float rollCmd  = constrain(-(roll  * ${G.kp.toFixed(3)}f + rollRate  * ${G.kd.toFixed(3)}f), -1.0f, 1.0f);
  float pitchCmd = constrain(-(pitch * ${G.kpP.toFixed(3)}f + pitchRate * ${G.kdP.toFixed(3)}f), -1.0f, 1.0f);
  float yawCmd   = 0.0f;`
      : `  float rollCmd, pitchCmd, yawCmd;           // -1.0 .. +1.0
  readCommands(rollCmd, pitchCmd, yawCmd);   // RC receiver or autopilot`;
    setCode(
`// Full sketches: sketches/02_control_surfaces and sketches/03_auto_level_mpu6050
// writeSurface(servo, cmd): cmd -1..+1  ->  servo.write(90 + 30 * cmd)
void loop() {
${src}
${mix}
  delay(10);
}`);
  }
  ["flyWing", "flyAuto"].forEach((id) => $(id).addEventListener("click", code));

  registerTab("fly", {
    show() { code(); drawCards(); },
    state: () => ({ roll: S.roll, pitch: S.pitch, head: S.head, slew: { ...slew }, tgt: { ...tgt }, wing, auto, cmd: S.cmd, G: { ...G }, rec }),
    set: (o) => {
      if ("resetSim" in o) { S.roll = 0; S.pitch = 0; S.rr = 0; S.pr = 0; S.dist = 0; for (const k in slew) { slew[k] = 0; tgt[k] = 0; } }
      if ("wing" in o) { wing = o.wing; $("flyWing").classList.toggle("on", wing); }
      if ("auto" in o) { auto = o.auto; $("flyAuto").classList.toggle("on", auto); }
      if ("man" in o) Object.assign(man, o.man);
      if ("gust" in o) S.dist += o.gust;
      if ("roll" in o) S.roll = o.roll;
      if ("pitch" in o) S.pitch = o.pitch;
      if ("G" in o) Object.assign(G, o.G);
      code();
    },
    step,
    startRec(dur) { rec = { t: 0, dur, s: [], done: false }; return rec; },
    getRec: () => rec,
    tick(dt) { step(dt); drawPlane(); drawCards(); drawHorizon(); ui(); if (typeof Tune !== "undefined") Tune.update(); },
  });
})();
