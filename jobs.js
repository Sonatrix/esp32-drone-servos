"use strict";
/* Station 7: other servo jobs - landing gear, payload release, tilt-rotor */
(() => {
  const slewTo = (cur, goal, v, dt) => cur + clamp(goal - cur, -v * dt, v * dt);
  let lastCode = "gear";

  /* ---------- landing gear: servo 20° = down, 160° = up ---------- */
  const GEAR_DOWN = 20, GEAR_UP = 160;
  let gearGoal = GEAR_DOWN, gearAng = GEAR_DOWN;
  $("gearSvg").innerHTML = `
    <line x1="0" y1="140" x2="240" y2="140" stroke="#94a3b8" stroke-width="3"/>
    <g id="gLeg" transform="translate(120 95)">
      <line x1="0" y1="0" x2="0" y2="34" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
      <circle cx="0" cy="40" r="10" fill="#334155" stroke="#e2e8f0" stroke-width="3"/></g>
    <ellipse cx="120" cy="82" rx="88" ry="22" fill="#cbd5e1" stroke="#64748b" stroke-width="3"/>
    <path d="M200 82 L226 70 L226 94 Z" fill="#94a3b8"/>
    <rect x="108" y="86" width="26" height="14" rx="3" fill="#3b82f6"/>
    <text x="121" y="97" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">servo</text>
    <text x="14" y="76" font-size="10" fill="#64748b">tail</text><text x="204" y="62" font-size="10" fill="#64748b">nose</text>`;
  describe("gearSvg", "Side view of a drone whose landing gear leg swings up into the fuselage when the servo turns");
  function gearText() {
    $("gearTxt").textContent = `servo ${Math.round(gearAng)}° · ${angleToUs(gearAng)} µs → ${gearAng < 60 ? "wheel DOWN" : gearAng > 120 ? "wheel UP (retracted)" : "moving…"}`;
  }
  function gearCode() {
    lastCode = "gear";
    setCode(
`// Landing gear: only two positions matter
const int GEAR_DOWN_DEG = ${GEAR_DOWN};
const int GEAR_UP_DEG   = ${GEAR_UP};

void setGear(bool down) {
  gear.write(down ? GEAR_DOWN_DEG : GEAR_UP_DEG);   // now: ${gearGoal === GEAR_DOWN ? "down" : "up"}
}
// Tip: let a switch or the altitude controller call setGear(false)
// after take-off, and setGear(true) before landing.`);
  }
  $("gearBtn").addEventListener("click", (e) => {
    const down = e.currentTarget.classList.toggle("on");
    e.currentTarget.textContent = down ? "Gear DOWN" : "Gear UP";
    gearGoal = down ? GEAR_DOWN : GEAR_UP; gearCode();
  });

  /* ---------- payload release: servo 30° = locked, 120° = open ---------- */
  const LOCK = 30, OPEN = 120;
  let dropGoal = LOCK, dropAng = LOCK, pkgY = 0, pkgV = 0, released = false;
  $("dropSvg").innerHTML = `
    <line x1="0" y1="142" x2="240" y2="142" stroke="#94a3b8" stroke-width="3"/>
    <rect x="70" y="20" width="100" height="26" rx="10" fill="#475569" stroke="#1e293b" stroke-width="3"/>
    <ellipse cx="62" cy="16" rx="26" ry="4" fill="#94a3b8"/><ellipse cx="178" cy="16" rx="26" ry="4" fill="#94a3b8"/>
    <rect x="108" y="46" width="24" height="12" rx="3" fill="#3b82f6"/>
    <g transform="translate(120 52)"><g id="dLatch"><rect x="-3" y="0" width="30" height="7" rx="3" fill="#f8fafc" stroke="#94a3b8"/></g><circle r="4" fill="#64748b"/></g>
    <g id="dPkg"><rect x="104" y="62" width="32" height="28" rx="3" fill="#f59e0b" stroke="#92400e" stroke-width="2"/>
      <line x1="104" y1="76" x2="136" y2="76" stroke="#92400e" stroke-width="2"/><line x1="120" y1="62" x2="120" y2="90" stroke="#92400e" stroke-width="2"/></g>
    <line x1="120" y1="58" x2="120" y2="62" stroke="#e2e8f0" stroke-width="3"/>`;
  describe("dropSvg", "A drone carries a package held by a latch arm on a servo. Turning the servo opens the latch and the package falls.");
  function dropText() {
    $("dropTxt").textContent = `servo ${Math.round(dropAng)}° · ${angleToUs(dropAng)} µs → ${released ? "package released" : dropAng > 80 ? "latch opening…" : "latch LOCKED"}`;
  }
  function dropCode() {
    lastCode = "drop";
    setCode(
`const int LATCH_LOCKED_DEG = ${LOCK};
const int LATCH_OPEN_DEG   = ${OPEN};

void releasePayload() {
  latch.write(LATCH_OPEN_DEG);    // arm swings away, gravity does the rest
}
void resetLatch() {
  latch.write(LATCH_LOCKED_DEG);  // lock before loading the next package
}
// Safety: only release when the pilot confirms and the drop zone is clear.`);
  }
  $("dropBtn").addEventListener("click", () => { dropGoal = OPEN; dropCode(); });
  $("dropReset").addEventListener("click", () => { dropGoal = LOCK; released = false; pkgY = 0; pkgV = 0; dropCode(); });

  /* ---------- tilt-rotor: servo angle = rotor tilt, 0° = up (hover), 90° = forward ---------- */
  let tiltGoal = 0, tiltAng = 0;
  $("tiltSvg").innerHTML = `
    <line x1="0" y1="142" x2="240" y2="142" stroke="#94a3b8" stroke-width="3"/>
    <ellipse cx="120" cy="100" rx="86" ry="14" fill="#cbd5e1" stroke="#64748b" stroke-width="3"/>
    <path d="M196 100 L222 92 L222 108 Z" fill="#94a3b8"/>
    <rect x="96" y="92" width="48" height="8" rx="3" fill="#94a3b8"/>
    <g transform="translate(120 88)">
      <g id="tRotor">
        <line x1="-34" y1="-6" x2="34" y2="-6" stroke="#e2e8f0" stroke-width="6" stroke-linecap="round"/>
        <rect x="-8" y="-4" width="16" height="22" rx="4" fill="#475569"/>
        <line id="tThrust" x1="0" y1="-12" x2="0" y2="-62" stroke="#22c55e" stroke-width="4" marker-end="url(#tArrow)"/></g>
      <circle r="5" fill="#3b82f6"/></g>
    <defs><marker id="tArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#22c55e"/></marker></defs>
    <text id="tLift" x="8" y="20" font-size="11" fill="#64748b"></text><text id="tPush" x="8" y="36" font-size="11" fill="#64748b"></text>`;
  describe("tiltSvg", "Side view of an aircraft with a rotor on a tilting servo mount. Tilting forward turns lift into forward thrust.");
  function tiltText() {
    const a = tiltAng * Math.PI / 180, lift = Math.round(Math.cos(a) * 100), push = Math.round(Math.sin(a) * 100);
    $("tiltOut").textContent = Math.round(tiltGoal) + "°";
    $("tLift").textContent = "lift " + lift + "%"; $("tPush").textContent = "forward push " + push + "%";
    const mode = tiltAng < 15 ? "HOVER: all thrust lifts" : tiltAng < 75 ? "TRANSITION: wings start to carry weight" : "CRUISE: thrust pushes forward, wing gives lift";
    $("tiltTxt").textContent = `servo ${Math.round(tiltAng)}° · ${angleToUs(tiltAng)} µs → ${mode}`;
  }
  function tiltCode() {
    lastCode = "tilt";
    setCode(
`// Tilt-rotor (VTOL): the servo tilts the whole motor
float tiltDeg = ${Math.round(tiltGoal)};                  // 0 = hover, 90 = cruise
tilt.write((int)constrain(tiltDeg, 0.0f, 90.0f));
// Move it slowly (e.g. 20 deg/s) through the transition,
// and keep the ESC throttle up so the aircraft never loses lift.`);
  }
  $("tiltAng").addEventListener("input", (e) => { tiltGoal = +e.target.value; tiltCode(); });

  const CODES = { gear: gearCode, drop: dropCode, tilt: tiltCode };
  registerTab("jobs", {
    show() { CODES[lastCode](); gearText(); dropText(); tiltText(); },
    state: () => ({ gearAng, gearGoal, dropAng, released, pkgY, tiltAng, tiltGoal }),
    set: (o) => { if ("gearGoal" in o) gearGoal = o.gearGoal; if ("dropGoal" in o) dropGoal = o.dropGoal; if ("tiltGoal" in o) tiltGoal = o.tiltGoal; },
    tick(dt) {
      gearAng = slewTo(gearAng, gearGoal, 150, dt);
      $("gLeg").setAttribute("transform", `translate(120 95) rotate(${((gearAng - GEAR_DOWN) / (GEAR_UP - GEAR_DOWN)) * 100})`);
      gearText();

      dropAng = slewTo(dropAng, dropGoal, 200, dt);
      $("dLatch").setAttribute("transform", `rotate(${(dropAng - LOCK) * 1.0})`);
      if (!released && dropGoal === OPEN && dropAng > 80) released = true;
      if (released && pkgY < 68) { pkgV += 420 * dt; pkgY = Math.min(68, pkgY + pkgV * dt); if (pkgY >= 68) pkgV = 0; }
      $("dPkg").setAttribute("transform", `translate(0 ${pkgY})`);
      dropText();

      tiltAng = slewTo(tiltAng, tiltGoal, 90, dt);
      $("tRotor").setAttribute("transform", `rotate(${tiltAng})`);
      tiltText();
    },
  });
})();
