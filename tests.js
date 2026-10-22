"use strict";
/* In-page behaviour tests. Open index.html?test (results appear at the bottom) or run
   run-tests.ps1 / run-tests.sh for a headless pass/fail. The simulation is stepped manually. */
(() => {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push(["PASS", name]); }
    catch (e) { results.push(["FAIL", `${name} :: ${e.message}`]); }
  };
  const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
  const near = (a, b, tol, m) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m || "value"}: expected ${b} ±${tol}, got ${a}`); };
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const setRange = (id, v) => { $(id).value = v; fire($(id), "input"); };
  const run = (id, sec, each) => {
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(sec / dt); i++) { if (TABS[id].tick) TABS[id].tick(dt); if (activeTab === id) Missions.tick(dt); if (each) each(i); }
  };

  window.__paused = true;
  const ids = Object.keys(TABS);

  test("all 9 stations are registered", () => ok(ids.length === 9, "got " + ids.join(",")));
  Missions.setGuided(false); Missions.reset();   // clean slate, nothing locked while the tests drive things

  ids.forEach((id) => test(`station '${id}' shows, ticks and has code`, () => {
    showTab(id);
    ok(!$("tab-" + id).hidden, "section hidden");
    ok($("code").textContent.length > 20, "empty code panel");
    run(id, 0.5);
    ok(document.querySelector(`#tabs button[data-tab="${id}"]`).getAttribute("aria-current") === "page", "aria-current");
  }));

  /* ---------- PWM ---------- */
  test("pwm: angle -> pulse width (500..2500 µs)", () => {
    showTab("pwm");
    setRange("pwmAngle", 0); near(TABS.pwm.state().us, 500, 0);
    setRange("pwmAngle", 90); near(TABS.pwm.state().us, 1500, 0);
    setRange("pwmAngle", 180); near(TABS.pwm.state().us, 2500, 0);
    setRange("pwmAngle", 90);
    ok($("pwmMath").textContent.includes("7.5 %"), "duty 7.5 % missing");
    ok($("pwmServo").querySelector(".horn").getAttribute("transform").startsWith("rotate(0 "), "horn not vertical at 90°");
  });
  test("pwm: 1000-2000 µs servo type changes the mapping and code", () => {
    showTab("pwm");
    $("pwmRange").value = "1000,2000"; fire($("pwmRange"), "change");
    setRange("pwmAngle", 0); near(TABS.pwm.state().us, 1000, 0);
    setRange("pwmAngle", 180); near(TABS.pwm.state().us, 2000, 0);
    ok($("code").textContent.includes("attach(13, 1000, 2000)"), "code not updated");
    $("pwmRange").value = "500,2500"; fire($("pwmRange"), "change");
    near(angleToUs(90), 1500, 0);
  });
  test("pwm: code panel is a complete sketch", () => {
    showTab("pwm");
    const c = $("code").textContent;
    ok(c.includes("#include <ESP32Servo.h>") && c.includes("void setup()") && c.includes("void loop()"), "not complete");
  });

  /* ---------- inside a servo ---------- */
  test("inside: servo reaches its target", () => {
    showTab("inside");
    TABS.inside.set({ target: 150, kp: 1.5, push: 0, theta: 90 });
    run("inside", 3);
    near(TABS.inside.state().theta, 150, 2, "theta");
  });
  test("inside: higher Kp overshoots more than low Kp", () => {
    showTab("inside");
    const peak = (kp) => { TABS.inside.set({ target: 150, kp, push: 0, theta: 30 }); let m = 0; run("inside", 2, () => { m = Math.max(m, TABS.inside.state().theta); }); return m - 150; };
    const lo = peak(0.5), hi = peak(12);
    ok(hi > lo + 5, `overshoot hi=${hi.toFixed(1)} lo=${lo.toFixed(1)}`);
    ok(hi > 5, "Kp=12 should visibly overshoot");
  });
  test("inside: pushing on the horn leaves a steady error; holding then releasing recovers", () => {
    showTab("inside");
    TABS.inside.set({ target: 90, kp: 1.5, push: 300, theta: 90 });
    run("inside", 3);
    const err = Math.abs(TABS.inside.state().theta - 90);
    ok(err > 2, "no droop under load: " + err);
    TABS.inside.set({ push: 0 });
    TABS.inside.drag(40); run("inside", 0.5);
    near(TABS.inside.state().theta, 40, 0.5, "held horn");
    TABS.inside.drag(null); run("inside", 3);
    near(TABS.inside.state().theta, 90, 2, "returns to target");
  });

  /* ---------- fly ---------- */
  const flyReset = () => {
    TABS.fly.set({ wing: false, auto: false, roll: 0, pitch: 0, man: { r: 0, p: 0, y: 0 } });
    run("fly", 1);
    TABS.fly.set({ roll: 0, pitch: 0 });
  };
  test("fly: roll command moves ailerons in OPPOSITE directions and rolls right", () => {
    showTab("fly"); flyReset();
    TABS.fly.set({ man: { r: 1 } }); run("fly", 0.6);
    const s = TABS.fly.state();
    ok(s.slew.aL > 10 && s.slew.aR < -10, `ailerons ${s.slew.aL.toFixed(1)} / ${s.slew.aR.toFixed(1)}`);
    ok(s.roll > 5, "roll " + s.roll);
    TABS.fly.set({ man: { r: 0 } });
  });
  test("fly: pull = elevator trailing edge UP and nose rises; yaw uses rudder", () => {
    showTab("fly"); flyReset();
    TABS.fly.set({ man: { p: 1, y: 1 } }); run("fly", 0.8);
    const s = TABS.fly.state();
    ok(s.slew.el < -10, "elevator " + s.slew.el); ok(s.pitch > 5, "pitch " + s.pitch);
    ok(s.slew.ru > 10, "rudder " + s.slew.ru);
    TABS.fly.set({ man: { p: 0, y: 0 } });
  });
  test("fly: keyboard arrows steer (synthetic keydown)", () => {
    showTab("fly"); flyReset();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    run("fly", 0.5);
    const a = TABS.fly.state().slew.aL;
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    ok(a > 8, "aileron did not move: " + a);
  });
  test("fly: gust upsets the plane, auto-level recovers it", () => {
    showTab("fly"); flyReset();
    TABS.fly.set({ auto: false, gust: 150 }); run("fly", 1.5);
    ok(Math.abs(TABS.fly.state().roll) > 20, "gust did not upset it: " + TABS.fly.state().roll);
    flyReset();
    TABS.fly.set({ auto: true, gust: 150 }); run("fly", 6);
    near(TABS.fly.state().roll, 0, 3, "auto-level roll");
    ok($("code").textContent.includes("rollRate"), "auto-level code not shown");
    flyReset();
  });
  test("fly: flying-wing mixer shares pitch+roll and saturates at the end stop", () => {
    showTab("fly"); flyReset();
    TABS.fly.set({ wing: true, man: { p: 1 } }); run("fly", 1);
    let s = TABS.fly.state();
    near(s.slew.aL, s.slew.aR, 1, "elevons equal for pure pitch"); ok(s.slew.aL < -20, "elevons up " + s.slew.aL);
    near(s.slew.el, 0, 0.5, "elevator locked in wing mode");
    TABS.fly.set({ man: { r: 1, p: 1 } }); TABS.fly.step(1 / 60);
    s = TABS.fly.state();
    near(s.tgt.aL, 0, 0.01, "L cancels"); near(s.tgt.aR, -30, 0.01, "R saturates at -30");
    ok($("code").textContent.includes("elevonL"), "wing code not shown");
    flyReset();
  });

  /* ---------- gimbal ---------- */
  test("gimbal: stabilise keeps the camera level, off lets it tilt", () => {
    showTab("gimbal");
    TABS.gimbal.set({ tilt: 30, stab: true, speed: 600 }); run("gimbal", 2);
    near(TABS.gimbal.state().camAbs, 0, 2, "stabilised");
    near(TABS.gimbal.state().servo, 60, 2, "servo = 90 - tilt");
    TABS.gimbal.set({ stab: false }); run("gimbal", 2);
    near(TABS.gimbal.state().camAbs, 30, 1, "unstabilised");
  });
  test("gimbal: a slow servo lags in turbulence", () => {
    showTab("gimbal");
    const avgErr = (speed) => {
      TABS.gimbal.set({ tilt: 0, stab: true, speed, wobble: true });
      let sum = 0, n = 0; run("gimbal", 6, () => { sum += Math.abs(TABS.gimbal.state().camAbs); n++; });
      return sum / n;
    };
    const fast = avgErr(600), slow = avgErr(40);
    TABS.gimbal.set({ wobble: false, tilt: 0, speed: 300 });
    ok(slow > fast * 2, `fast=${fast.toFixed(1)} slow=${slow.toFixed(1)}`);
  });

  /* ---------- wiring ---------- */
  test("wiring: correct BEC setup never browns out", () => {
    showTab("wiring"); TABS.wiring.set({ mode: "bec", moving: true });
    let frozen = false; run("wiring", 12, () => { if (TABS.wiring.state().frozen) frozen = true; });
    ok(!frozen, "unexpected brownout"); ok($("wrStatus").className.includes("good"), "status not green");
  });
  test("wiring: 3V3 and VIN supplies brown out", () => {
    ["3v3", "vin"].forEach((m) => {
      showTab("wiring"); TABS.wiring.set({ mode: m, moving: true });
      let frozen = false; run("wiring", 14, () => { if (TABS.wiring.state().frozen) frozen = true; });
      ok(frozen, m + " never browned out");
    });
  });
  test("wiring: no common ground makes servos jitter", () => {
    showTab("wiring"); TABS.wiring.set({ mode: "nogd", moving: true });
    const seen = new Set(); run("wiring", 2, () => seen.add(Math.round(TABS.wiring.state().ang[0])));
    ok(seen.size > 8, "only " + seen.size + " distinct angles");
    ok($("wrSvg").innerHTML.includes("no common GND"), "missing-ground marker");
    TABS.wiring.set({ mode: "bec" });
  });
  test("wiring: wires are keyboard-focusable and explain themselves", () => {
    showTab("wiring"); TABS.wiring.set({ mode: "bec" });
    const wires = $("wrSvg").querySelectorAll('.wire[tabindex="0"]');
    ok(wires.length > 10, "wires " + wires.length);
    const sig = $("wrSvg").querySelector('.wire[data-w="signal"]');
    sig.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    ok($("wrWire").textContent.includes("SIGNAL"), "no explanation");
  });

  /* ---------- quadcopter ---------- */
  test("quad: disarmed ESCs ignore throttle; arming needs zero throttle", () => {
    showTab("quad"); TABS.quad.set({ armed: false, ctl: { thr: 0.5, roll: 0, pitch: 0, yaw: 0 } });
    ok(TABS.quad.state().us.every((u) => u === 1000), "motors not at 1000 µs while disarmed");
    TABS.quad.press();
    ok(!TABS.quad.state().armed && $("quadSay").textContent.includes("Safety"), "armed with throttle up");
    TABS.quad.set({ ctl: { thr: 0 } }); TABS.quad.press();
    ok(TABS.quad.state().armed, "could not arm at zero throttle");
  });
  test("quad: mixer produces roll, pitch and yaw patterns (M1 FR, M2 RR, M3 RL, M4 FL)", () => {
    showTab("quad");
    TABS.quad.set({ armed: true, ctl: { thr: 0.5, roll: 0, pitch: 0, yaw: 0 } });
    TABS.quad.state().us.forEach((u) => near(u, 1500, 0, "equal motors"));
    TABS.quad.set({ ctl: { roll: 1 } }); let o = TABS.quad.state().out;
    ok(o[0] < o[3] && o[1] < o[2], "roll right: right motors should be slower");
    TABS.quad.set({ ctl: { roll: 0, pitch: 1 } }); o = TABS.quad.state().out;
    ok(o[0] > o[1] && o[3] > o[2], "nose up: front motors faster");
    TABS.quad.set({ ctl: { pitch: 0, yaw: 1 } }); o = TABS.quad.state().out;
    ok(o[0] > o[1] && o[2] > o[3], "yaw right: CCW props (M1,M3) faster");
    TABS.quad.set({ ctl: { thr: 1, yaw: 0, roll: 1 } });
    ok(TABS.quad.state().us.every((u) => u >= 1000 && u <= 2000), "outputs outside 1000..2000");
    TABS.quad.set({ armed: false, ctl: { thr: 0, roll: 0 } });
  });

  /* ---------- more jobs ---------- */
  test("jobs: gear retracts, payload drops, rotor tilts to cruise", () => {
    showTab("jobs");
    $("gearBtn").click(); run("jobs", 2);
    near(TABS.jobs.state().gearAng, 160, 1, "gear up");
    $("gearBtn").click(); run("jobs", 2);
    near(TABS.jobs.state().gearAng, 20, 1, "gear down");
    $("dropBtn").click(); run("jobs", 2);
    ok(TABS.jobs.state().released && TABS.jobs.state().pkgY >= 60, "package did not fall");
    $("dropReset").click(); run("jobs", 1);
    ok(!TABS.jobs.state().released, "reset failed");
    setRange("tiltAng", 90); run("jobs", 2);
    near(TABS.jobs.state().tiltAng, 90, 1, "tilt"); ok($("tiltTxt").textContent.includes("CRUISE"), "mode text");
    setRange("tiltAng", 0); run("jobs", 2);
  });

  /* ---------- picker ---------- */
  test("picker: default plane is fine with a micro servo; torque grows with airspeed²", () => {
    showTab("picker");
    TABS.picker.set({ pkChord: 40, pkSpan: 300, pkV: 20, pkDefl: 30, pkSh: 12, pkCh: 15, pkN: 4, pkBec: 3 });
    const a = TABS.picker.state();
    ok(a.torqueCls === "good" && a.needKgcm > 0.05 && a.needKgcm < 2, "default need " + a.needKgcm);
    TABS.picker.set({ pkV: 40 });
    near(TABS.picker.state().needKgcm / a.needKgcm, 4, 0.05, "V² scaling");
  });
  test("picker: big fast surface overwhelms a micro servo; small BEC is flagged", () => {
    showTab("picker");
    $("pkServo").value = "micro"; fire($("pkServo"), "change");
    TABS.picker.set({ pkV: 40, pkChord: 80, pkSpan: 500, pkN: 8, pkBec: 1 });
    const s = TABS.picker.state();
    ok(s.torqueCls === "bad", "torque class " + s.torqueCls); ok(s.becCls === "bad", "bec class " + s.becCls);
    TABS.picker.set({ pkV: 18, pkChord: 40, pkSpan: 300, pkN: 4, pkBec: 3 });
  });

  /* ---------- quiz ---------- */
  test("quiz: answering all correctly gives full marks; wrong answers explain", () => {
    showTab("quiz"); TABS.quiz.restart();
    TABS.quiz.data.forEach((q) => ok(q.o.includes(q.a), "answer missing from options: " + q.q));
    const cur = TABS.quiz.state().current;
    const wrong = [...$("quizBox").querySelectorAll(".opts button")].find((b) => b.textContent !== cur.a);
    wrong.click();
    ok($("quizBox").querySelector(".why").textContent.includes("Not quite"), "no explanation for wrong answer");
    TABS.quiz.restart();
    for (let i = 0; i < TABS.quiz.data.length; i++) {
      const c = TABS.quiz.state().current;
      [...$("quizBox").querySelectorAll(".opts button")].find((b) => b.textContent === c.a).click();
      $("qzNext").click();
    }
    ok($("quizBox").textContent.includes(`Score: ${TABS.quiz.data.length} / ${TABS.quiz.data.length}`), "final score: " + $("quizBox").textContent.slice(0, 60));
  });

  /* ---------- accessibility ---------- */
  test("a11y: pictures have accessible names", () => {
    ["pwmCanvas", "inCanvas", "flyPlane", "flyHorizon", "gmDrone", "gmCam", "quadSvg", "gearSvg", "dropSvg", "tiltSvg"].forEach((id) => {
      const el = $(id); ok(el && el.getAttribute("role") === "img" && el.getAttribute("aria-label").length > 10, id + " lacks role/label");
    });
  });
  test("a11y: nav is labelled and every slider sits in a label", () => {
    ok($("tabs").getAttribute("aria-label"), "nav label");
    document.querySelectorAll('input[type="range"]').forEach((i) => ok(i.closest("label"), "unlabelled slider " + i.id));
  });

  /* ---------- sketches referenced by the UI exist as full snippets ---------- */
  test("code panels mention the sketch file they correspond to", () => {
    const need = { fly: "sketches/02_control_surfaces", gimbal: "sketches/04_gimbal_mpu6050", wiring: "sketches/05_four_servos_power", quad: "sketches/06_quad_mixer_esc" };
    Object.entries(need).forEach(([id, p]) => { showTab(id); ok($("code").textContent.includes(p), id + " code does not mention " + p); });
  });


  /* ---------- tuning ---------- */
  test("tune: default gains work; more Kp is excellent; weak Kp is sluggish; slow servo + high Kp oscillates", () => {
    showTab("fly");
    const r0 = Tune.runSync({ kp: 0.035, kd: 0.008, vmax: 380, noise: 0 });
    ok(r0.verdict === "ok" && r0.settle > 0.8 && r0.settle < 1.6, "default: " + r0.verdict + " " + r0.settle);
    ok(Tune.runSync({ kp: 0.08, kd: 0.008, vmax: 380, noise: 0 }).verdict === "excellent", "kp .08 should be excellent");
    ok(Tune.runSync({ kp: 0.01, kd: 0.008, vmax: 380, noise: 0 }).verdict === "sluggish", "kp .01 should be sluggish");
    const o = Tune.runSync({ kp: 0.3, kd: 0, vmax: 150, noise: 0 });
    ok(o.verdict === "oscillating" && o.crossings >= 3, "slow servo high Kp: " + o.verdict + " crossings " + o.crossings);
    Tune.runSync({ ...Tune.DEFAULTS });
  });
  test("tune: sensor noise makes the servos jitter", () => {
    showTab("fly");
    const jitter = (noise) => {
      TABS.fly.set({ G: { ...Tune.DEFAULTS, noise }, auto: true, resetSim: true, man: { r: 0, p: 0, y: 0 } });
      let sum = 0, sq = 0, n = 0;
      for (let i = 0; i < 120; i++) { TABS.fly.step(1 / 60); const v = TABS.fly.state().tgt.aL; sum += v; sq += v * v; n++; }
      return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    };
    const quiet = jitter(0), noisy = jitter(6);
    TABS.fly.set({ G: { ...Tune.DEFAULTS }, auto: false, resetSim: true });
    ok(noisy > quiet + 1.5, `jitter quiet=${quiet.toFixed(2)} noisy=${noisy.toFixed(2)}`);
  });
  test("tune: the Run button records a live test and shows a verdict", () => {
    showTab("fly"); TABS.fly.set({ G: { ...Tune.DEFAULTS } }); $("tnRun").click();
    ok($("tnVerdict").textContent === "Testing…", "should say testing");
    run("fly", 4.3);
    ok(Tune.last && $("tnVerdict").textContent.length > 20 && !$("tnVerdict").textContent.startsWith("Testing"), "verdict: " + $("tnVerdict").textContent);
    TABS.fly.set({ auto: false, resetSim: true });
  });

  /* ---------- missions ---------- */
  test("missions: guided mode locks later stations until a star is earned", () => {
    Missions.reset(); Missions.setGuided(true);
    ok(Missions.canOpen("pwm") && !Missions.canOpen("inside") && !Missions.canOpen("quiz"), "initial locks");
    ok(document.querySelector('#tabs button[data-tab="inside"]').classList.contains("locked"), "nav lock icon");
    Missions.setGuided(false); ok(Missions.canOpen("quiz"), "free explore opens everything");
    Missions.setGuided(true);
    Missions.complete("pwm-2000");
    ok(Missions.canOpen("inside") && !Missions.canOpen("fly"), "one star unlocks exactly the next station");
    Missions.setGuided(false); Missions.reset();
  });

  test("missions: every mission can be completed by driving the simulation", () => {
    Missions.reset();
    const stage = (st, f) => { showTab(st); f(); };
    stage("pwm", () => {
      TABS.pwm.set(135); run("pwm", 0.1);
      $("pwmRange").value = "1000,2000"; fire($("pwmRange"), "change"); TABS.pwm.set(45); run("pwm", 0.1);
      $("pwmRange").value = "500,2500"; fire($("pwmRange"), "change");
    });
    stage("inside", () => {
      TABS.inside.set({ target: 90, kp: 0.6, push: 0, theta: 90 }); run("inside", 1);
      TABS.inside.set({ target: 150 }); run("inside", 6);
      TABS.inside.set({ target: 90, kp: 4, push: 300, theta: 90 }); run("inside", 4);
      TABS.inside.set({ push: 0, kp: 1.5 });
    });
    stage("fly", () => {
      flyReset(); TABS.fly.set({ man: { r: 1 } }); run("fly", 1.5); TABS.fly.set({ man: { r: 0 } });
      flyReset(); TABS.fly.set({ auto: false, gust: 150 }); run("fly", 1.5); TABS.fly.set({ auto: true }); run("fly", 6);
      flyReset(); TABS.fly.set({ wing: true, man: { r: 1, p: 1 } }); run("fly", 0.3); flyReset();
      Tune.runSync({ kp: 0.08, kd: 0.008, vmax: 380, noise: 0 }); run("fly", 0.1);
      Tune.runSync({ kp: 0.3, kd: 0, vmax: 150, noise: 0 }); run("fly", 0.1);
      Tune.runSync({ ...Tune.DEFAULTS }); TABS.fly.set({ auto: false, resetSim: true });
    });
    stage("gimbal", () => {
      TABS.gimbal.set({ tilt: 0, stab: true, speed: 600, wobble: true }); run("gimbal", 7);
      TABS.gimbal.set({ wobble: false, tilt: 0, stab: true, speed: 60 }); run("gimbal", 0.3);
      TABS.gimbal.set({ tilt: 60 }); run("gimbal", 0.5); TABS.gimbal.set({ tilt: 0, speed: 300 });
    });
    stage("wiring", () => {
      TABS.wiring.set({ mode: "bec", moving: true }); run("wiring", 6);
      TABS.wiring.set({ mode: "3v3", moving: true }); run("wiring", 5); TABS.wiring.set({ mode: "bec" });
    });
    stage("quad", () => {
      TABS.quad.set({ armed: false, ctl: { thr: 0, roll: 0, pitch: 0, yaw: 0 } }); TABS.quad.press();
      TABS.quad.set({ ctl: { thr: 0.6, roll: 0.6 } }); run("quad", 0.3);
      TABS.quad.set({ armed: false, ctl: { thr: 0, roll: 0 } });
    });
    stage("jobs", () => {
      $("dropReset").click(); run("jobs", 1); $("dropBtn").click(); run("jobs", 2);
      if (TABS.jobs.state().gearGoal !== 160) $("gearBtn").click();
      setRange("tiltAng", 90); run("jobs", 2.5);
    });
    stage("picker", () => {
      $("pkServo").value = "micro"; fire($("pkServo"), "change");
      TABS.picker.set({ pkV: 40, pkChord: 80, pkSpan: 500 }); run("picker", 0.1);
      $("pkServo").value = "digital"; fire($("pkServo"), "change");
      TABS.picker.set({ pkV: 30, pkChord: 60, pkSpan: 300 }); run("picker", 0.1);
      $("pkServo").value = "micro"; fire($("pkServo"), "change");
      TABS.picker.set({ pkV: 18, pkChord: 40, pkSpan: 300, pkN: 4, pkBec: 3 });
    });
    stage("quiz", () => {
      TABS.quiz.restart();
      for (let i = 0; i < TABS.quiz.data.length; i++) {
        const c = TABS.quiz.state().current;
        [...$("quizBox").querySelectorAll(".opts button")].find((b) => b.textContent === c.a).click();
        $("qzNext").click();
      }
      run("quiz", 0.1);
    });
    const missing = Missions.DEFS.filter((d) => !Missions.isDone(d.id)).map((d) => d.id);
    ok(missing.length === 0, "not completed: " + missing.join(", "));
  });

  /* ---------- predictions ---------- */
  Predict.list.forEach((p) => test(`predict '${p.id}': the answer we teach is what the simulation does`, () => {
    ok(p.opts.length >= 2 && p.answer >= 0 && p.answer < p.opts.length, "bad option setup");
    const truth = Predict.runSync(p, (sec) => run(p.st, sec));
    ok(truth === p.answer, `simulation says option ${truth} (${p.opts[truth]}), we teach ${p.answer} (${p.opts[p.answer]})`);
  }));
  test("predict: UI offers the question, hides on stations without one, stars are earned by answering", () => {
    Missions.reset(); showTab("pwm");
    ok(!$("mPredictBtn").hidden, "predict button should show on the PWM station");
    $("mPredictBtn").click();
    ok(!$("predictBox").hidden && $("predictBox").querySelectorAll(".opts button").length === 3, "options not shown");
    showTab("quiz"); ok($("mPredictBtn").hidden && $("predictBox").hidden, "no predictions on the quiz station");
    showTab("pwm");
    Predict.runSync(Predict.list[0], (sec) => run("pwm", sec));
    ok(Missions.stars("pwm") === 0, "runSync alone must not award a star");
    Missions.complete("pred-pwm");
    ok(Missions.isDone("pred-pwm"), "prediction star");
    Missions.reset();
  });
  test("missions: the mission list renders with progress and stars", () => {
    Missions.reset(); showTab("pwm");
    ok($("mList").querySelectorAll("li").length >= 3, "list items: " + $("mList").querySelectorAll("li").length);
    ok($("mStars").textContent.includes("/"), "star counter");
    Missions.complete("pwm-2000");
    ok($("mList").querySelector('li[data-m="pwm-2000"]').classList.contains("done"), "done styling");
    Missions.reset();
  });

  // ---- report ----
  const failed = results.filter((r) => r[0] === "FAIL").length;
  const out = document.createElement("pre");
  out.id = "testOut";
  out.textContent = results.map((r) => `${r[0]}  ${r[1]}`).join("\n") + `\n\nTESTS: ${results.length - failed} passed, ${failed} failed`;
  out.style.cssText = "background:#111;color:#0f0;padding:12px;margin:12px;white-space:pre-wrap;font:12px Consolas,monospace";
  document.body.appendChild(out);
  window.__paused = false;
  showTab("pwm");
})();
