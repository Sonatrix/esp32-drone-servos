"use strict";
/* Station 2: inside a servo – closed-loop position control (P controller) */
(() => {
  const cv = $("inCanvas"), ctx = cv.getContext("2d");
  const B = { x: 215, y: 185 };          // output gear (horn) centre
  const G = [                              // pinion, middle gear, output gear
    { x: 70,  y: 185, r: 14, teeth: 8 },
    { x: 118, y: 185, r: 34, teeth: 18 },
    { x: B.x, y: B.y, r: 54, teeth: 28 },
  ];
  let target = 90, theta = 90, omega = 0, kp = 1.5, push = 0;
  let sweep = false, sweepT = 0, dragging = false;
  const hist = []; let histT = 0, err = 0, drive = 0;
  describe("inCanvas", "Inside a servo: a motor drives a gear train to the output horn, a potentiometer reports the angle, and a control circuit drives the motor until the error between target and actual angle is zero.");

  const phi = () => ((theta + 180) * Math.PI) / 180;   // canvas angle of the horn

  function gear(g, rot, color) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.beginPath(); ctx.arc(0, 0, g.r, 0, TAU); ctx.fillStyle = color; ctx.fill();
    const rt = g.r + 3, w = (TAU * rt) / (g.teeth * 2);
    ctx.setLineDash([w, w]); ctx.lineDashOffset = -rot * rt; ctx.lineWidth = 6;
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 0, rt, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * TAU) / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * g.r * 0.8, Math.sin(a) * g.r * 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "13px Segoe UI, sans-serif";
    const ink = getComputedStyle(document.body).color;

    // housing
    ctx.fillStyle = "rgba(59,130,246,.12)"; ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(15, 70, 305, 190, 14); ctx.fill(); ctx.stroke();

    // motor behind the pinion
    ctx.fillStyle = "#475569"; ctx.beginPath(); ctx.arc(G[0].x, G[0].y, 30, 0, TAU); ctx.fill();
    // gears (pinion turns fastest)
    const p = phi();
    gear(G[2], p, "#f59e0b");
    gear(G[1], -p * (G[2].r / G[1].r), "#14b8a6");
    gear(G[0], p * (G[2].r / G[0].r), "#ef4444");
    ctx.fillStyle = ink; ctx.font = "bold 11px Segoe UI"; ctx.fillText("MOTOR", G[0].x - 20, G[0].y + 50);
    ctx.font = "12px Segoe UI"; ctx.fillText("fast motor → strong horn", 28, 90);
    ctx.fillStyle = "#94a3b8";
    ["① ESP32 sends the target angle", "② the pot reports where the horn is", "③ circuit drives the motor to close the gap"].forEach((t, i) => ctx.fillText(t, 20, 290 + i * 18));

    // potentiometer on the output shaft: arc + wiper
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(B.x, B.y, 22, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(B.x + Math.cos(p) * 22, B.y + Math.sin(p) * 22); ctx.stroke();

    // horn
    const hx = B.x + Math.cos(p) * 100, hy = B.y + Math.sin(p) * 100;
    ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 14; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#64748b"; ctx.beginPath(); ctx.arc(B.x, B.y, 8, 0, TAU); ctx.fill();
    // target marker
    const tp = ((target + 180) * Math.PI) / 180;
    ctx.strokeStyle = "#22c55e"; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(B.x + Math.cos(tp) * 60, B.y + Math.sin(tp) * 60); ctx.lineTo(B.x + Math.cos(tp) * 118, B.y + Math.sin(tp) * 118); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px Segoe UI"; ctx.fillText("pot sensor", B.x - 30, B.y + 42); ctx.font = "13px Segoe UI";
    ctx.fillStyle = "#22c55e"; ctx.fillText("target", B.x + Math.cos(tp) * 124 - 14, B.y + Math.sin(tp) * 124 - 6);
    if (dragging) { ctx.fillStyle = "#ef4444"; ctx.fillText("you are holding it!", B.x - 55, 64); }

    // control board panel
    ctx.fillStyle = "rgba(100,116,139,.15)"; ctx.beginPath(); ctx.roundRect(340, 14, 285, 192, 12); ctx.fill();
    ctx.fillStyle = ink; ctx.font = "bold 13px Segoe UI"; ctx.fillText("🧠 Control circuit", 352, 36);
    ctx.font = "13px Consolas, monospace";
    ctx.fillText(`target (from ESP32)  ${target.toFixed(1).padStart(6)}°`, 352, 62);
    ctx.fillText(`pot reads           ${theta.toFixed(1).padStart(6)}°`, 352, 84);
    ctx.fillStyle = Math.abs(err) < 1.5 ? "#22c55e" : "#f59e0b";
    ctx.fillText(`error = target − pot ${err.toFixed(1).padStart(5)}°`, 352, 106);
    ctx.fillStyle = ink;
    ctx.fillText(`drive = Kp × error  ${(drive * 100).toFixed(0).padStart(5)}%`, 352, 128);
    // drive bar -100..100 %
    ctx.strokeStyle = "#64748b"; ctx.lineWidth = 1; ctx.strokeRect(352, 142, 260, 18);
    ctx.fillStyle = drive >= 0 ? "#22c55e" : "#ef4444";
    ctx.fillRect(482, 143, 129 * drive, 16);
    ctx.fillStyle = ink; ctx.fillText("◀ motor reverse", 352, 180); ctx.fillText("forward ▶", 548, 180);
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.fillText("Pushes until error = 0, then stops.", 352, 198);

    // strip chart
    ctx.fillStyle = "rgba(100,116,139,.15)"; ctx.beginPath(); ctx.roundRect(340, 218, 285, 106, 10); ctx.fill();
    const cx0 = 350, cw = 265, cy0 = 226, ch = 90, N = 240;
    const Y = (a) => cy0 + ch - (a / 180) * ch;
    ctx.lineWidth = 2;
    [["target", "#22c55e", true], ["theta", "#f59e0b", false]].forEach(([k, c, dash]) => {
      ctx.strokeStyle = c; ctx.setLineDash(dash ? [5, 4] : []); ctx.beginPath();
      hist.forEach((h, i) => { const x = cx0 + (i / (N - 1)) * cw; i ? ctx.lineTo(x, Y(h[k])) : ctx.moveTo(x, Y(h[k])); });
      ctx.stroke();
    });
    ctx.setLineDash([]); ctx.fillStyle = "#22c55e"; ctx.font = "11px Segoe UI"; ctx.fillText("target", 356, 238);
    ctx.fillStyle = "#f59e0b"; ctx.fillText("actual", 396, 238);
  }

  function code() {
    setCode(
`// The servo's OWN circuit does this loop – you only send the target.
servo.write(${Math.round(target)});          // ESP32 -> target angle

// Inside the servo, thousands of times per second:
//   error = target - potentiometer_angle;
//   drive = Kp * error;           // Kp = ${kp.toFixed(1)}  ("stiffness")
//   motor.run(constrain(drive, -1, 1));
// error -> 0  =>  motor stops  =>  horn HOLDS position`);
  }

  function readUi() {
    $("inTargetOut").textContent = Math.round(target) + "°";
    $("inKpOut").textContent = kp.toFixed(1);
    $("inPushOut").textContent = push === 0 ? "none" : (push > 0 ? "→ " : "← ") + Math.abs(push);
  }

  // controls
  $("inTarget").addEventListener("input", (e) => { sweep = false; $("inSweep").classList.remove("on"); target = +e.target.value; readUi(); code(); });
  $("inKp").addEventListener("input", (e) => { kp = +e.target.value; readUi(); code(); });
  $("inPush").addEventListener("input", (e) => { push = +e.target.value; readUi(); });
  document.querySelectorAll("#tab-inside [data-t]").forEach((b) => b.addEventListener("click", () => {
    sweep = false; $("inSweep").classList.remove("on"); target = +b.dataset.t; $("inTarget").value = target; readUi(); code();
  }));
  $("inSweep").addEventListener("click", (e) => { sweep = e.currentTarget.classList.toggle("on"); sweepT = 0; });

  // grab the horn
  function angleFromPointer(e) {
    const p = canvasPoint(cv, e);
    let a = (Math.atan2(-(p.y - B.y), -(p.x - B.x)) * 180) / Math.PI;
    if (a < -90) a = 180; else if (a < 0) a = 0;
    return a;
  }
  cv.addEventListener("pointerdown", (e) => {
    const p = canvasPoint(cv, e);
    if (Math.hypot(p.x - B.x, p.y - B.y) < 125 && p.y < B.y + 20) { dragging = true; cv.setPointerCapture(e.pointerId); theta = angleFromPointer(e); omega = 0; }
  });
  cv.addEventListener("pointermove", (e) => { if (dragging) { theta = angleFromPointer(e); omega = 0; } });
  const release = () => (dragging = false);
  cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", release);

  registerTab("inside", {
    show() { readUi(); code(); },
    state: () => ({ target, theta, omega, kp, drive, err, push, dragging }),
    set: (o) => { if ("target" in o) { sweep = false; target = o.target; } if ("kp" in o) kp = o.kp; if ("push" in o) push = o.push; if ("theta" in o) theta = o.theta; },
    drag: (a) => { dragging = a !== null; if (a !== null) { theta = a; omega = 0; } },
    tick(dt) {
      if (sweep) { sweepT += dt; target = 90 + 80 * Math.sin(sweepT * 1.2); $("inTarget").value = target; readUi(); }
      // simulate in small steps for stability
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps; i++) {
        err = target - theta;
        drive = clamp((kp * err) / 60, -1, 1);
        if (!dragging) {
          const acc = 12000 * drive - 20 * omega + push * 6;
          omega += acc * h; theta += omega * h;
          if (theta < 0) { theta = 0; omega = 0; } if (theta > 180) { theta = 180; omega = 0; }
        }
      }
      histT += dt;
      if (histT > 1 / 60) { histT = 0; hist.push({ target, theta }); if (hist.length > 240) hist.shift(); }
      draw();
    },
  });
})();
