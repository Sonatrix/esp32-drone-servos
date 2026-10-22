"use strict";
/* Predict, then reveal: commit to an answer first, then watch the real simulation decide.
   Each prediction knows how to run itself (steps) and how to read the true answer from the simulation (truth),
   so the tests can check that the "correct answer" we teach is really what the simulation does. */
const Predict = (() => {
  const wait = (ms) => ms;
  const list = [
    { id: "pred-pwm", st: "pwm", title: "longer pulse",
      q: "The pulse gets LONGER. Which way does the horn turn?",
      opts: ["toward 0° (left)", "toward 180° (right)", "it doesn't move"], answer: 1,
      explain: "A longer pulse means a bigger angle, so the horn turns toward 180°.",
      steps: [{ do: () => TABS.pwm.set(90), wait: 700 }, { do: () => TABS.pwm.set(150), wait: 900 }],
      truth: () => (TABS.pwm.state().angle > 90 ? 1 : 0) },

    { id: "pred-inside", st: "inside", title: "let go of the horn",
      q: "You drag the horn away from its target and let go. It…",
      opts: ["stays where you left it", "springs back to the target", "keeps drifting away"], answer: 1,
      explain: "The feedback loop sees the error and drives the motor until the error is zero, so the horn returns.",
      steps: [
        { do: () => { TABS.inside.set({ target: 90, kp: 1.5, push: 0, theta: 90 }); TABS.inside.drag(40); }, wait: 900 },
        { do: () => TABS.inside.drag(null), wait: 2200 }],
      truth: () => { const t = TABS.inside.state().theta; return Math.abs(t - 90) < 4 ? 1 : Math.abs(t - 40) < 5 ? 0 : 2; } },

    (() => { let snap = 0; return { id: "pred-fly-aileron", st: "fly", title: "left aileron on a right roll",
      q: "Roll RIGHT. What does the LEFT aileron's trailing edge do?",
      opts: ["goes UP", "goes DOWN", "stays centred"], answer: 1,
      explain: "Ailerons work in opposite directions: the left goes down (more lift), the right goes up (less lift), so the right wing drops.",
      steps: [
        { do: () => { TABS.fly.set({ auto: false, wing: false, resetSim: true, man: { r: 1, p: 0, y: 0 } }); }, wait: 900 },
        { do: () => { snap = TABS.fly.state().slew.aL; TABS.fly.set({ man: { r: 0 } }); }, wait: 300 }],
      truth: () => (snap > 5 ? 1 : snap < -5 ? 0 : 2) }; })(),

    { id: "pred-fly-gust", st: "fly", title: "gust with no auto-level",
      q: "A gust tips the plane and Auto-level is OFF. After 3 seconds it…",
      opts: ["levels itself", "stays tilted or keeps rolling"], answer: 1,
      explain: "Nothing is correcting it. Levelling needs a controller: the ESP32 reading a tilt sensor and commanding the servos.",
      steps: [{ do: () => TABS.fly.set({ auto: false, wing: false, resetSim: true, man: { r: 0, p: 0, y: 0 }, gust: 150 }), wait: 3000 }],
      truth: () => (Math.abs(TABS.fly.state().roll) > 15 ? 1 : 0) },

    { id: "pred-gimbal", st: "gimbal", title: "gimbal servo angle",
      q: "The drone tilts 30°. For a level camera the gimbal servo should go to…",
      opts: ["120°", "90°", "60°"], answer: 2,
      explain: "The servo turns the opposite way: 90° − 30° = 60°.",
      steps: [{ do: () => TABS.gimbal.set({ tilt: 30, stab: true, speed: 600, wobble: false }), wait: 1500 }],
      truth: () => { const v = TABS.gimbal.state().servo; return v < 75 ? 2 : v > 105 ? 0 : 1; } },

    (() => { let r0 = 0; return { id: "pred-wiring", st: "wiring", title: "servos on the 3V3 pin",
      q: "Four servos move while powered from the ESP32's 3V3 pin. What happens?",
      opts: ["smooth movement", "the ESP32 keeps resetting (brownout)", "the servos move faster"], answer: 1,
      explain: "The 3.3 V regulator can't supply motor current. The voltage sags and the ESP32 reboots. Servos need their own 5 V supply.",
      steps: [{ do: () => { TABS.wiring.set({ mode: "bec", moving: true }); r0 = TABS.wiring.state().resets; TABS.wiring.set({ mode: "3v3", moving: true }); }, wait: 4600 },
        { do: () => {}, wait: 0 }],
      truth: () => (TABS.wiring.state().resets > r0 ? 1 : 0),
      after: () => TABS.wiring.set({ mode: "bec" }) }; })(),

    { id: "pred-quad", st: "quad", title: "roll right",
      q: "Roll RIGHT: which motors speed up?",
      opts: ["the left motors", "the right motors", "the two front motors"], answer: 0,
      explain: "Faster motors on the left lift the left side, so the quad banks to the right.",
      steps: [
        { do: () => TABS.quad.set({ armed: false, ctl: { thr: 0, roll: 0, pitch: 0, yaw: 0 } }), wait: 100 },
        { do: () => TABS.quad.set({ armed: true }), wait: 200 },
        { do: () => TABS.quad.set({ ctl: { thr: 0.5, roll: 1 } }), wait: 1300 }],
      truth: () => { const o = TABS.quad.state().out; const L = o[2] + o[3], R = o[0] + o[1]; return L > R ? 0 : R > L ? 1 : 2; },
      after: () => TABS.quad.set({ armed: false, ctl: { thr: 0, roll: 0 } }) },

    { id: "pred-jobs", st: "jobs", title: "tilt-rotor lift",
      q: "Tilt the rotor from hover (0°) to cruise (90°). The straight-up lift…",
      opts: ["drops to zero", "doubles", "stays the same"], answer: 0,
      explain: "At 90° all the thrust pushes forward. The wing must carry the weight, which is why VTOL needs a careful transition.",
      steps: [{ do: () => TABS.jobs.set({ tiltGoal: 0 }), wait: 800 }, { do: () => TABS.jobs.set({ tiltGoal: 90 }), wait: 1900 }],
      truth: () => (Math.cos((TABS.jobs.state().tiltAng * Math.PI) / 180) < 0.15 ? 0 : 2) },

    (() => { let n0 = 1; return { id: "pred-picker", st: "picker", title: "double the airspeed",
      q: "You double the airspeed. The servo torque you need becomes…",
      opts: ["2× more", "4× more", "the same"], answer: 1,
      explain: "Air load grows with speed squared: twice the speed means four times the push on the control surface.",
      steps: [
        { do: () => { TABS.picker.set({ pkV: 18 }); n0 = TABS.picker.state().needKgcm; }, wait: 900 },
        { do: () => TABS.picker.set({ pkV: 36 }), wait: 700 }],
      truth: () => { const r = TABS.picker.state().needKgcm / n0; return Math.abs(r - 4) < 0.3 ? 1 : Math.abs(r - 2) < 0.2 ? 0 : 2; },
      after: () => TABS.picker.set({ pkV: 18 }) }; })(),
  ];

  const box = $("predictBox");
  const cursor = {};
  let open = false, busy = false;
  const forStation = (st) => list.filter((p) => p.st === st);

  function ask() {
    const ps = forStation(activeTab);
    if (!ps.length) { box.hidden = true; return; }
    const p = ps[(cursor[activeTab] || 0) % ps.length];
    box.hidden = false;
    box.innerHTML = `<b>🔮 Predict first</b> <small class="pr">(${(cursor[activeTab] || 0) % ps.length + 1} of ${ps.length})</small>
      <p>${p.q}</p><div class="opts" role="group" aria-label="Your prediction"></div><p class="out" aria-live="polite"></p><div class="row"><button class="small toggle" id="prNext" hidden>Next prediction</button></div>`;
    const opts = box.querySelector(".opts");
    p.opts.forEach((o, i) => { const b = document.createElement("button"); b.textContent = o; b.addEventListener("click", () => choose(p, i, b)); opts.appendChild(b); });
    $("prNext").addEventListener("click", () => { cursor[activeTab] = (cursor[activeTab] || 0) + 1; ask(); });
  }

  function choose(p, i, btn) {
    if (busy) return;
    busy = true;
    box.querySelectorAll(".opts button").forEach((b) => (b.disabled = true));
    btn.classList.add("picked");
    box.querySelector(".out").textContent = "Running the real simulation…";
    let k = 0;
    const next = () => {
      if (k >= p.steps.length) return reveal(p, i);
      const s = p.steps[k++]; s.do(); setTimeout(next, s.wait);
    };
    next();
  }

  function reveal(p, i) {
    busy = false;
    const t = p.truth(), ok = i === t;
    if (p.after) p.after();
    const buttons = [...box.querySelectorAll(".opts button")];
    buttons[i].classList.add(ok ? "right" : "wrong"); buttons[t].classList.add("right");
    box.querySelector(".out").textContent = (ok ? "✅ You predicted it! " : `❌ Reality: “${p.opts[t]}”. `) + p.explain;
    $("prNext").hidden = false;
    if (ok) Missions.complete(p.id);
  }

  // test helper: run a prediction instantly, ticking the simulation between steps
  function runSync(p, tick) {
    TABS[p.st].show && showTab(p.st);
    p.steps.forEach((s) => { s.do(); tick(s.wait / 1000); });
    const t = p.truth();
    if (p.after) p.after();
    return t;
  }

  $("mPredictBtn").addEventListener("click", () => { if (box.hidden) { cursor[activeTab] = cursor[activeTab] || 0; ask(); } else box.hidden = true; });
  function hide() { box.hidden = true; busy = false; }
  return { list, ask, hide, runSync, forStation };
})();
