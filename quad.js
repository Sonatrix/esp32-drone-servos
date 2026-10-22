"use strict";
/* Station 6: quadcopter motor mixing through ESCs (no servos) */
(() => {
  // X layout, nose up. dir: +1 = props spin clockwise (viewed from above), -1 = counter-clockwise
  const MOTORS = [
    { name: "M1 front-right", x: 310, y: 80,  dir: -1 },
    { name: "M2 rear-right",  x: 310, y: 260, dir: +1 },
    { name: "M3 rear-left",   x: 110, y: 260, dir: -1 },
    { name: "M4 front-left",  x: 110, y: 80,  dir: +1 },
  ];
  const ctl = { thr: 0, roll: 0, pitch: 0, yaw: 0 };
  let armed = false, out = [0, 0, 0, 0];
  const angle = [0, 0, 0, 0];
  let refused = "";

  // mixer: throttle 0..1, roll right/nose up/yaw right = positive
  function mix(t, r, p, y) {
    return [
      t - r + p + y,   // M1
      t - r - p - y,   // M2
      t + r - p + y,   // M3
      t + r + p - y,   // M4
    ].map((v) => clamp(v, 0, 1));
  }
  const us = (v) => Math.round(1000 + 1000 * v);

  const svg = $("quadSvg");
  svg.innerHTML = `
    <text x="210" y="16" text-anchor="middle" font-size="12" fill="#94a3b8">▲ front</text>
    <line x1="110" y1="80" x2="310" y2="260" stroke="#64748b" stroke-width="10" stroke-linecap="round"/>
    <line x1="310" y1="80" x2="110" y2="260" stroke="#64748b" stroke-width="10" stroke-linecap="round"/>
    <rect x="175" y="135" width="70" height="70" rx="14" fill="#334155" stroke="#94a3b8" stroke-width="3"/>
    <text x="210" y="165" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="700">ESP32</text>
    <text x="210" y="182" text-anchor="middle" fill="#94a3b8" font-size="10">flight ctrl</text>
    ${MOTORS.map((m, i) => `
      <g transform="translate(${m.x} ${m.y})">
        <circle r="54" fill="rgba(148,163,184,.12)" stroke="${m.dir > 0 ? "#3b82f6" : "#f59e0b"}" stroke-width="3" stroke-dasharray="5 4"/>
        <g id="qp${i}"><line x1="-46" y1="0" x2="46" y2="0" stroke="#e2e8f0" stroke-width="7" stroke-linecap="round"/>
          <line x1="0" y1="-46" x2="0" y2="46" stroke="#e2e8f0" stroke-width="7" stroke-linecap="round" opacity=".55"/></g>
        <circle r="9" fill="#475569"/>
        <text y="76" text-anchor="middle" font-size="11" fill="#94a3b8">${m.name.split(" ")[0]} ${m.dir > 0 ? "↻ CW" : "↺ CCW"}</text>
      </g>`).join("")}
  `;
  describe("quadSvg", "Top view of a quadcopter with four motors and propellers whose speeds change with the controls");

  $("quadMotors").innerHTML = MOTORS.map((m, i) =>
    `<div class="mrow"><span>${m.name.split(" ")[0]} ESC</span><div class="mbar"><i id="qb${i}"></i></div><span id="qu${i}">1000 µs</span></div>`).join("");

  function readUi() {
    $("quadThrOut").textContent = Math.round(ctl.thr * 100) + "%";
    $("quadRollOut").textContent = ctl.roll.toFixed(2);
    $("quadPitchOut").textContent = ctl.pitch.toFixed(2);
    $("quadYawOut").textContent = ctl.yaw.toFixed(2);
    const b = $("quadArm");
    b.classList.toggle("on", armed);
    b.textContent = armed ? "🔓 ARMED (props live!)" : "🔒 Disarmed: press to ARM";
  }

  function say() {
    const parts = [];
    if (refused) parts.push("⛔ " + refused);
    else if (!armed) parts.push("The ESCs are disarmed: they hold the motors off and ignore the throttle. ESC pulse stays at 1000 µs.");
    else {
      if (ctl.thr < 0.02) parts.push("Armed at zero throttle: motors idle.");
      if (ctl.roll > 0.05) parts.push("Roll right → right motors slower, left motors faster.");
      if (ctl.roll < -0.05) parts.push("Roll left → left motors slower, right motors faster.");
      if (ctl.pitch > 0.05) parts.push("Nose up → front motors faster, rear slower.");
      if (ctl.pitch < -0.05) parts.push("Nose down → rear motors faster, front slower.");
      if (ctl.yaw > 0.05) parts.push("Yaw right → the counter-clockwise props speed up; their extra reaction torque turns the whole drone clockwise.");
      if (ctl.yaw < -0.05) parts.push("Yaw left → the clockwise props speed up and twist the drone counter-clockwise.");
      if (ctl.thr >= 0.02 && Math.abs(ctl.roll) + Math.abs(ctl.pitch) + Math.abs(ctl.yaw) < 0.05) parts.push("All four motors at the same speed: the drone climbs or hovers level.");
    }
    $("quadSay").textContent = parts.join(" ");
  }

  function code() {
    const o = out.map((v) => v.toFixed(2));
    setCode(
`// Full sketch: sketches/06_quad_mixer_esc/06_quad_mixer_esc.ino   (PROPS OFF when testing!)
esc[i].attach(MOTOR_PINS[i], 1000, 2000);   // ESC range: 1000..2000 us
esc[i].writeMicroseconds(1000);             // ARM: hold minimum for ~3 s

void mix(float t, float roll, float pitch, float yaw, float out[4]) {
  out[0] = t - roll + pitch + yaw;   // M1 front-right
  out[1] = t - roll - pitch - yaw;   // M2 rear-right
  out[2] = t + roll - pitch + yaw;   // M3 rear-left
  out[3] = t + roll + pitch - yaw;   // M4 front-left
  for (int i = 0; i < 4; i++) out[i] = constrain(out[i], 0.0f, 1.0f);
}
// now: throttle ${ctl.thr.toFixed(2)}, stick roll ${ctl.roll.toFixed(2)} pitch ${ctl.pitch.toFixed(2)} yaw ${ctl.yaw.toFixed(2)} (x0.25 authority)
//   -> out = [${o.join(", ")}]  ->  ${out.map(us).join(", ")} us`);
  }

  function update() {
    out = armed ? mix(ctl.thr, ctl.roll * 0.25, ctl.pitch * 0.25, ctl.yaw * 0.25) : [0, 0, 0, 0];
    out.forEach((v, i) => { $("qb" + i).style.width = v * 100 + "%"; $("qu" + i).textContent = us(v) + " µs"; });
    readUi(); say(); code();
  }

  [["quadThr", "thr"], ["quadRoll", "roll"], ["quadPitch", "pitch"], ["quadYaw", "yaw"]].forEach(([id, k]) =>
    $(id).addEventListener("input", (e) => { ctl[k] = +e.target.value; refused = ""; update(); }));
  $("quadArm").addEventListener("click", () => {
    if (!armed && ctl.thr > 0.05) { refused = "Safety: lower the throttle to 0 before arming. Real ESCs refuse to arm otherwise."; update(); return; }
    armed = !armed; refused = ""; update();
  });

  registerTab("quad", {
    show: update,
    state: () => ({ armed, out: [...out], us: out.map(us), ctl: { ...ctl }, refused }),
    set: (o) => { Object.assign(ctl, o.ctl || {}); if ("armed" in o) armed = o.armed; refused = ""; update(); },
    press: () => $("quadArm").click(),
    tick(dt) {
      out.forEach((v, i) => {
        angle[i] += MOTORS[i].dir * v * 640 * dt * (REDUCED ? 0.2 : 1);
        $("qp" + i).setAttribute("transform", `rotate(${angle[i]})`);
      });
    },
  });
})();
