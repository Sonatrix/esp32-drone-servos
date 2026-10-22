"use strict";
/* Station 4: camera gimbal – servo counter-rotates against drone tilt */
(() => {
  const drone = $("gmDrone"), cam = $("gmCam");
  let tilt = 0, servo = 90, stab = true, wobble = false, wt = 0, speed = 300;
  const CX = 210, CY = 95;
  describe("gmDrone", "A drone body tilts while a gimbal servo swings a camera arm the opposite way"); describe("gmCam", "Camera view of the horizon");

  drone.innerHTML = `
    <line x1="0" y1="95" x2="420" y2="95" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 6"/>
    <text x="8" y="88" font-size="11" fill="#38bdf8">true horizon</text>
    <g id="gmBody">
      <rect x="150" y="80" width="120" height="30" rx="10" fill="#475569" stroke="#1e293b" stroke-width="3"/>
      <line x1="150" y1="84" x2="90" y2="70" stroke="#475569" stroke-width="6" stroke-linecap="round"/>
      <line x1="270" y1="84" x2="330" y2="70" stroke="#475569" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="82" cy="66" rx="34" ry="5" fill="#94a3b8"/><ellipse cx="338" cy="66" rx="34" ry="5" fill="#94a3b8"/>
      <circle cx="210" cy="95" r="6" fill="#22c55e"/>
      <rect x="196" y="110" width="28" height="14" rx="3" fill="#2563eb"/>
            <g id="gmArm" transform="translate(210 122)">
        <line x1="0" y1="0" x2="0" y2="46" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>
        <g transform="translate(0 46)"><rect x="-24" y="0" width="48" height="30" rx="6" fill="#0f172a" stroke="#cbd5e1" stroke-width="3"/>
          <circle cx="0" cy="15" r="9" fill="#38bdf8" stroke="#e2e8f0" stroke-width="2"/></g>
      </g>
    </g>
    <line id="gmCamAxis" x1="210" y1="170" x2="210" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 4"/>
    <text id="gmSvLbl" x="210" y="236" text-anchor="middle" font-size="12" font-weight="700" fill="#2563eb"></text>
    <text x="210" y="258" text-anchor="middle" font-size="12" fill="#94a3b8">Servo (blue) swings the camera arm opposite to the tilt</text>`;

  cam.innerHTML = `
    <clipPath id="gmClip"><rect width="160" height="120"/></clipPath>
    <g clip-path="url(#gmClip)"><g id="gmWorld" transform="translate(80 60)">
      <rect x="-300" y="-300" width="600" height="300" fill="#38bdf8"/>
      <rect x="-300" y="0" width="600" height="300" fill="#65a30d"/>
      <polygon points="-60,0 -40,-24 -20,0" fill="#475569"/><polygon points="30,0 55,-34 80,0" fill="#475569"/>
      <line x1="-300" y1="0" x2="300" y2="0" stroke="#fff" stroke-width="2"/></g></g>
    <path d="M70 60h20M80 50v20" stroke="#fff" stroke-width="1.5" opacity=".8"/>`;

  function readUi() {
    $("gmTiltOut").textContent = Math.round(tilt) + "°";
    $("gmSpeedOut").textContent = speed + "°/s";
  }

  function code() {
    setCode(
`// Full sketch: sketches/04_gimbal_mpu6050/04_gimbal_mpu6050.ino
// Core of loop() with the current numbers:
roll   = 0.98f * (roll + gyroX * dt) + 0.02f * accelRoll;   // IMU tilt, degrees
float target = ${stab ? "90.0f - roll" : "90.0f"};                // ${stab ? "opposite direction" : "stabilise OFF: camera follows the drone"}
target = constrain(target, 0.0f, 180.0f);                   // servo stops
gimbal.write((int)target);                                  // now: tilt ${Math.round(tilt)}° -> servo ${Math.round(clamp(stab ? 90 - tilt : 90, 0, 180))}°`);
  }

  $("gmTilt").addEventListener("input", (e) => { wobble = false; $("gmWobble").classList.remove("on"); tilt = +e.target.value; readUi(); });
  $("gmSpeed").addEventListener("input", (e) => { speed = +e.target.value; readUi(); });
  $("gmStab").addEventListener("click", (e) => {
    stab = e.currentTarget.classList.toggle("on"); e.currentTarget.textContent = "Stabilise " + (stab ? "ON" : "OFF");
  });
  $("gmWobble").addEventListener("click", (e) => { wobble = e.currentTarget.classList.toggle("on"); wt = 0; });

  registerTab("gimbal", {
    show() { readUi(); code(); },
    state: () => ({ tilt, servo, camAbs: tilt + (servo - 90), stab, speed, wobble }),
    set: (o) => { if ("tilt" in o) { wobble = false; tilt = o.tilt; } if ("stab" in o) stab = o.stab; if ("speed" in o) speed = o.speed; if ("wobble" in o) { wobble = o.wobble; wt = 0; } },
    tick(dt) {
      if (wobble) {
        wt += dt;
        tilt = 28 * Math.sin(wt * 1.7) + 14 * Math.sin(wt * 3.9 + 1) + 6 * Math.sin(wt * 7.3);
        $("gmTilt").value = tilt; readUi();
      }
      const want = clamp(stab ? 90 - tilt : 90, 0, 180);
      servo += clamp(want - servo, -speed * dt, speed * dt);        // limited servo speed
      const rel = servo - 90;                                         // arm angle relative to body
      const camAbs = tilt + rel;                                      // what the camera really does

      $("gmBody").setAttribute("transform", `rotate(${tilt} ${CX} ${CY})`);
      $("gmArm").setAttribute("transform", `translate(210 122) rotate(${rel})`);
      $("gmSvLbl").textContent = `servo ${Math.round(servo)}° · ${angleToUs(servo)} µs`;
      $("gmWorld").setAttribute("transform", `translate(80 60) rotate(${-camAbs})`);
      const ok = Math.abs(camAbs) < 3;
      $("gmReadout").textContent =
        `drone tilt   ${tilt.toFixed(0).padStart(4)}°\nservo angle  ${servo.toFixed(0).padStart(4)}°  (90° = centre)\ncamera tilt  ${camAbs.toFixed(0).padStart(4)}°  ${ok ? "✅ level" : "⚠️ tilted"}`;
      code();
    },
  });
})();
