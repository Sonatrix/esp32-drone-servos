"use strict";
/* Missions: each station has goals the page checks live. Earn stars, unlock the next station.
   Guided mode (default) needs one star in a station before the next one opens; Free explore opens all. */
const Missions = (() => {
  const ORDER = ["pwm", "inside", "fly", "gimbal", "wiring", "quad", "jobs", "picker", "quiz"];
  const KEY = "servoLab.stars.v1";

  // check(state, ctx, dt) -> { done, text }. ctx persists per mission; use it for timers and history.
  const hold = (ctx, ok, dt) => (ctx.t = ok ? (ctx.t || 0) + dt : 0);
  const DEFS = [
    { id: "pwm-2000", st: "pwm", title: "Make the pulse exactly 2000 µs",
      check: (s) => ({ done: Math.abs(s.us - 2000) <= 10, text: s.us + " µs" }) },
    { id: "pwm-45", st: "pwm", title: "Choose the 1000–2000 µs servo type and point it at 45°", hint: "Change “Servo type” first.",
      check: (s) => ({ done: SERVO.min === 1000 && SERVO.max === 2000 && Math.abs(s.angle - 45) <= 2, text: `${SERVO.min}–${SERVO.max} µs · ${Math.round(s.angle)}°` }) },

    { id: "inside-150", st: "inside", title: "Move to 150° with under 5° overshoot", hint: "Start below 120°, then aim for 150°. Try lowering Kp.",
      check: (s, c, dt) => {
        const aimed = Math.abs(s.target - 150) < 1;
        if (!aimed) { c.low = false; c.peak = -1e9; c.t = 0; return { done: false, text: "set the target to 150°" }; }
        if (s.theta < 120) c.low = true;
        c.peak = Math.max(c.peak, s.theta);
        hold(c, Math.abs(s.theta - 150) < 1.5, dt);
        const over = Math.max(0, c.peak - 150);
        return { done: !!c.low && c.t > 1 && over < 5, text: `overshoot ${over.toFixed(1)}°${c.low ? "" : " · start below 120°"}` };
      } },
    { id: "inside-hold", st: "inside", title: "Hold within 4° of target while pushing with 200+ for 1.5 s", hint: "Raise the stiffness (Kp).",
      check: (s, c, dt) => {
        const ok = Math.abs(s.push) >= 200 && !s.dragging && Math.abs(s.theta - s.target) < 4;
        hold(c, ok, dt);
        return { done: c.t > 1.5, text: `push ${s.push} · error ${Math.abs(s.theta - s.target).toFixed(1)}°` };
      } },

    { id: "fly-roll30", st: "fly", title: "Roll the plane right past 30°",
      check: (s) => ({ done: s.roll > 30, text: `roll ${Math.round(s.roll)}°` }) },
    { id: "fly-recover", st: "fly", title: "Knock it over with a Gust, then let Auto-level recover it", hint: "Gust first (Auto-level off), then switch Auto-level on.",
      check: (s, c, dt) => {
        if (Math.abs(s.roll) > 20 && !s.auto) c.up = true;
        hold(c, !!c.up && s.auto && Math.abs(s.roll) < 3, dt);
        return { done: c.t > 1, text: c.up ? (s.auto ? `roll ${Math.round(s.roll)}°` : "now switch Auto-level on") : "tip it over first" };
      } },
    { id: "fly-stop", st: "fly", title: "Make a flying-wing elevon hit its end stop", hint: "Flying-wing mix on, then push roll AND pitch together.",
      check: (s) => {
        const m = s.cmd || { r: 0, p: 0 };
        const sat = s.wing && (Math.abs(-m.p + m.r) > 1.01 || Math.abs(-m.p - m.r) > 1.01);
        return { done: sat, text: s.wing ? "push roll and pitch together" : "switch on Flying-wing mix" };
      } },
    { id: "fly-tune-fast", st: "fly", title: "Tune the auto-level to level in ≤ 1 s with ≤ 5° overshoot", hint: "Raise Kp a little, then Run step test.",
      check: () => { const r = typeof Tune !== "undefined" && Tune.last; return { done: !!r && r.verdict === "excellent", text: r ? `${r.settle.toFixed(2)} s · ${r.over.toFixed(1)}°` : "run a step test" }; } },
    { id: "fly-tune-osc", st: "fly", title: "Make it oscillate on purpose", hint: "High Kp with a slow servo.",
      check: () => { const r = typeof Tune !== "undefined" && Tune.last; return { done: !!r && r.verdict === "oscillating", text: r ? r.verdict : "run a step test" }; } },

    { id: "gimbal-calm", st: "gimbal", title: "Keep the camera within 3° for 5 s in turbulence",
      check: (s, c, dt) => { hold(c, s.wobble && s.stab && Math.abs(s.camAbs) < 3, dt); return { done: c.t > 5, text: `${(c.t || 0).toFixed(1)} / 5 s` }; } },
    { id: "gimbal-lag", st: "gimbal", title: "Make a slow servo (≤ 100°/s) lose track by more than 10°", hint: "Slow the servo, then tilt the drone.",
      check: (s) => ({ done: s.stab && s.speed <= 100 && Math.abs(s.camAbs) > 10, text: `speed ${s.speed}°/s · camera off by ${Math.abs(s.camAbs).toFixed(0)}°` }) },

    { id: "wiring-ok", st: "wiring", title: "Run the correct power setup for 5 s without a reset", hint: "Separate BEC with a common ground.",
      check: (s, c, dt) => { hold(c, s.mode === "bec" && s.moving && !s.frozen, dt); return { done: c.t > 5, text: `${(c.t || 0).toFixed(1)} / 5 s` }; } },
    { id: "wiring-fail", st: "wiring", title: "Trigger a brownout on purpose",
      check: (s) => ({ done: s.resets > 0, text: `${s.resets} resets` }) },

    { id: "quad-fly", st: "quad", title: "Arm the quad and spin all four motors above 1300 µs",
      check: (s) => ({ done: s.armed && s.us.every((u) => u > 1300), text: s.armed ? s.us.join(" / ") + " µs" : "arm first (throttle at 0)" }) },
    { id: "quad-roll", st: "quad", title: "Roll right: make the left motors 100 µs faster than the right",
      check: (s) => ({ done: s.armed && s.us[3] - s.us[0] >= 100 && s.us[2] - s.us[1] >= 100, text: s.armed ? `left − right = ${Math.round(((s.us[3] - s.us[0]) + (s.us[2] - s.us[1])) / 2)} µs` : "arm first" }) },

    { id: "jobs-drop", st: "jobs", title: "Release the payload",
      check: (s) => ({ done: s.released, text: s.released ? "dropped" : "press Release" }) },
    { id: "jobs-takeoff", st: "jobs", title: "Take-off sequence: gear UP and rotor tilted to ≥ 85°",
      check: (s) => ({ done: s.gearAng >= 158 && s.tiltAng >= 85, text: `gear ${Math.round(s.gearAng)}° · tilt ${Math.round(s.tiltAng)}°` }) },

    { id: "picker-weak", st: "picker", title: "Find a setup where the micro servo is too weak",
      check: (s) => ({ done: s.torqueCls === "bad" && s.servoId === "micro", text: s.servoId === "micro" ? "torque: " + s.torqueCls : "choose the Micro servo" }) },
    { id: "picker-fix", st: "picker", title: "Handle 30+ m/s with a surface ≥ 60 × 300 mm: make torque green", hint: "Try a stronger servo or a shorter control horn.",
      check: (s) => ({ done: s.V >= 30 && s.chordMm >= 60 && s.spanMm >= 300 && s.torqueCls === "good", text: `${s.V} m/s · ${s.chordMm}×${s.spanMm} mm · torque ${s.torqueCls}` }) },

    { id: "quiz-10", st: "quiz", title: "Score 10 or more in the quiz",
      check: (s) => ({ done: s.finished && s.finalScore >= 10, text: s.finished ? `last score ${s.finalScore}` : "finish a round" }) },
  ];

  const labels = {};           // station -> original nav label
  const ctxs = {};             // mission id -> ctx
  const progress = {};         // mission id -> last text
  let done = new Set();
  let guided = true;

  try { done = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { done = new Set(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ } };

  const preds = (st) => (typeof Predict !== "undefined" ? Predict.list.filter((p) => p.st === st) : []);
  const items = (st) => [...DEFS.filter((d) => d.st === st), ...preds(st).map((p) => ({ id: p.id, st, title: "🔮 Predict: " + p.title, manual: true }))];
  const stars = (st) => items(st).filter((m) => done.has(m.id)).length;
  const total = (st) => items(st).length;
  const idx = (st) => ORDER.indexOf(st);
  const canOpen = (st) => !guided || idx(st) <= 0 || stars(ORDER[idx(st) - 1]) >= 1;

  function toast(msg) {
    const t = $("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function updateNav() {
    document.querySelectorAll("#tabs button").forEach((b) => {
      const st = b.dataset.tab;
      if (!labels[st]) labels[st] = b.textContent;
      const s = stars(st), n = total(st);
      b.textContent = (canOpen(st) ? "" : "🔒 ") + labels[st] + (n ? `  ${s}/${n}⭐` : "");
      b.classList.toggle("locked", !canOpen(st));
    });
  }

  function render() {
    if (!$("mList")) return;
    const st = activeTab;
    $("mTitle").textContent = "🎯 Missions";
    let all = 0, got = 0;
    ORDER.forEach((s) => { all += total(s); got += stars(s); });
    $("mStars").textContent = `⭐ ${got} / ${all}`;
    $("mList").innerHTML = items(st).map((m) => {
      const d = done.has(m.id);
      return `<li class="${d ? "done" : ""}" data-m="${m.id}"><span>${d ? "⭐" : "☐"}</span><span>${m.title}${m.hint && !d ? ` <small class="pr">(${m.hint})</small>` : ""}</span><span class="pr" data-p="${m.id}">${d ? "done" : progress[m.id] || ""}</span></li>`;
    }).join("");
    $("mPredictBtn").hidden = preds(st).length === 0;
    $("mMode").textContent = guided ? "🧭 Guided" : "🗺️ Free explore";
    $("mMode").classList.toggle("on", guided);
    updateNav();
  }

  function complete(id) {
    if (done.has(id)) return;
    done.add(id); save();
    const m = ORDER.flatMap(items).find((x) => x.id === id) || { title: id };
    toast("⭐ Mission complete: " + m.title.replace(/^🔮 Predict: /, ""));
    const st = activeTab, nextSt = ORDER[idx(st) + 1];
    if (guided && nextSt && stars(st) === 1 && canOpen(nextSt)) setTimeout(() => toast("🔓 Unlocked: next station!"), 3000);
    render();
  }

  // called every frame (only for the station on screen)
  function tick(dt) {
    const st = activeTab;
    if (!TABS[st] || !TABS[st].state) return;
    const s = TABS[st].state();
    DEFS.forEach((d) => {
      if (d.st !== st || done.has(d.id)) return;
      const c = ctxs[d.id] || (ctxs[d.id] = {});
      const r = d.check(s, c, dt);
      if (r.text !== progress[d.id]) { progress[d.id] = r.text; const el = document.querySelector(`[data-p="${d.id}"]`); if (el) el.textContent = r.text; }
      if (r.done) complete(d.id);
    });
  }

  function setGuided(g) { guided = g; render(); }
  function reset() { done = new Set(); save(); Object.keys(ctxs).forEach((k) => delete ctxs[k]); Object.keys(progress).forEach((k) => delete progress[k]); render(); }

  $("mMode").addEventListener("click", () => setGuided(!guided));
  return { tick, render, complete, canOpen, setGuided, reset, toast, stars, total, items, ORDER, DEFS,
    get guided() { return guided; }, isDone: (id) => done.has(id), doneCount: () => done.size };
})();
