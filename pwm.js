"use strict";
/* Station 1: PWM pulse width -> servo angle */
(() => {
  const icon = createServoIcon($("pwmServo"), 240);
  describe("pwmCanvas", "PWM waveform");
  const cv = $("pwmCanvas"), ctx = cv.getContext("2d");
  let angle = 90, sweep = false, sweepT = 0, scan = 0;

  function refresh() {
    const us = angleToUs(angle);
    icon.set(angle);
    $("pwmAngle").value = angle;
    $("pwmAngleOut").textContent = Math.round(angle) + "°";
    const duty = us / 20000;
    $("pwmMath").textContent =
      `pulse  = ${us} µs      period = 20 000 µs (50 Hz)\n` +
      `duty   = ${us} / 20000 = ${(duty * 100).toFixed(1)} %\n` +
      `ESP32 LEDC 14-bit timer: ${(duty * 100).toFixed(1)} % × 16383 = ${Math.round(duty * 16383)}`;
    $("pwmCanvas").setAttribute("aria-label", `PWM waveform: a ${us} microsecond pulse every 20 milliseconds, which points the servo at ${Math.round(angle)} degrees.`);
    setCode(
`#include <ESP32Servo.h>

Servo servo;

void setup() {
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);               // 50 Hz = one pulse every 20 ms
  servo.attach(13, ${SERVO.min}, ${SERVO.max});          // GPIO13, pulse range in us
}

void loop() {
  servo.write(${Math.round(angle)});                       // -> ${us} us pulse
  delay(20);
}`);
  }

  function draw() {
    const W = cv.width, H = cv.height, L = 50, R = 20, hi = 70, lo = 180, win = 60;
    const X = (ms) => L + (ms / win) * (W - L - R);
    const us = angleToUs(angle), pw = us / 1000;
    const css = getComputedStyle(document.body);
    const ink = css.color, muted = "#94a3b8";
    ctx.clearRect(0, 0, W, H);
    ctx.font = "13px Segoe UI, sans-serif";

    // grid + time axis
    ctx.strokeStyle = "rgba(148,163,184,.35)"; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (let ms = 0; ms <= win; ms += 20) {
      ctx.beginPath(); ctx.moveTo(X(ms), hi - 25); ctx.lineTo(X(ms), lo + 25); ctx.stroke();
      ctx.fillText(ms + " ms", X(ms) - 14, lo + 62);
    }
    ctx.setLineDash([]);
    ctx.fillText("5 V", 12, hi + 4); ctx.fillText("0 V", 12, lo + 4);

    // waveform: 3 periods
    ctx.beginPath(); ctx.moveTo(X(0), lo);
    for (let p = 0; p < 3; p++) {
      ctx.lineTo(X(p * 20), hi); ctx.lineTo(X(p * 20 + pw), hi);
      ctx.lineTo(X(p * 20 + pw), lo); ctx.lineTo(X((p + 1) * 20), lo);
    }
    ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "rgba(37,99,235,.25)";
    for (let p = 0; p < 3; p++) ctx.fillRect(X(p * 20), hi, X(p * 20 + pw) - X(p * 20), lo - hi);

    // annotations
    ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.strokeStyle = "#f59e0b";
    ctx.beginPath(); ctx.moveTo(X(0), hi - 12); ctx.lineTo(X(pw), hi - 12); ctx.stroke();
    ctx.fillStyle = "#f59e0b"; ctx.fillText(`pulse = ${us} µs  → ${Math.round(angle)}°`, X(0) + 70, hi - 18);
    ctx.strokeStyle = "#0d9488"; ctx.beginPath(); ctx.moveTo(X(0), lo + 36); ctx.lineTo(X(20), lo + 36); ctx.stroke();
    ctx.fillStyle = "#0d9488"; ctx.fillText("period = 20 ms (50 times a second)", X(0) + 8, lo + 30);

    // playhead + GPIO state
    const x = X(scan), high = scan % 20 < pw;
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, hi - 10); ctx.lineTo(x, lo + 10); ctx.stroke();
    ctx.fillStyle = high ? "#22c55e" : "#64748b";
    ctx.beginPath(); ctx.arc(W - 120, 22, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = ink; ctx.fillText("GPIO13: " + (high ? "HIGH" : "LOW"), W - 106, 27);
  }

  $("pwmAngle").addEventListener("input", (e) => { sweep = false; $("pwmSweep").classList.remove("on"); angle = +e.target.value; refresh(); });
  document.querySelectorAll("#tab-pwm [data-a]").forEach((b) => b.addEventListener("click", () => {
    sweep = false; $("pwmSweep").classList.remove("on"); angle = +b.dataset.a; refresh();
  }));
  $("pwmSweep").addEventListener("click", (e) => { sweep = e.currentTarget.classList.toggle("on"); sweepT = 0; });
  $("pwmRange").addEventListener("change", (e) => {
    const [a, b] = e.target.value.split(",").map(Number); SERVO.min = a; SERVO.max = b; refresh();
  });

  registerTab("pwm", {
    show: refresh,
    state: () => ({ angle, us: angleToUs(angle), sweep }),
    set: (a) => { sweep = false; angle = a; refresh(); },
    tick(dt) {
      if (!REDUCED) scan = (scan + dt * 14) % 60;
      if (sweep) { sweepT += dt; angle = 90 + 90 * Math.sin(sweepT * 1.3); refresh(); }
      draw();
    },
  });
})();
