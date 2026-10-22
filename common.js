"use strict";
/* Shared helpers: tab router, animation loop, servo model and a reusable servo drawing. */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
// accessible name for a canvas/svg that only shows a picture
function describe(id, text) { const el = $(id); if (el) { el.setAttribute("role", "img"); el.setAttribute("aria-label", text); } }

// Servo pulse range (µs) that maps to 0°..180°. The PWM station lets the user change it.
const SERVO = { min: 500, max: 2500 };
const angleToUs = (a) => Math.round(SERVO.min + (clamp(a, 0, 180) / 180) * (SERVO.max - SERVO.min));

/* ----- tabs: each module registers {show(), tick(dt, now)} ----- */
const TABS = {};
let activeTab = null;
function registerTab(id, mod) { TABS[id] = mod; }
function setCode(text) { $("code").textContent = text; }

function showTab(id) {
  if (!TABS[id]) id = "pwm";
  activeTab = id;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== "tab-" + id));
  document.querySelectorAll("#tabs button").forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  history.replaceState(null, "", "#" + id);
  if (TABS[id].show) TABS[id].show();
  if (typeof Predict !== "undefined") Predict.hide();
  if (typeof Missions !== "undefined") Missions.render();
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = TABS[activeTab];
  if (t && t.tick && !window.__paused) t.tick(dt, now);
  if (!window.__paused && typeof Missions !== "undefined") Missions.tick(dt);
  requestAnimationFrame(loop);
}

/* ----- a servo drawing: body, shaft and a horn that sweeps the top half-circle ----- */
function createServoIcon(parent, size = 200) {
  parent.innerHTML = `
  <svg viewBox="0 0 140 124" width="${size}" role="img" aria-label="Servo">
    <path d="M14 70 A56 56 0 0 1 126 70" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="3 4"/>
    <text x="6" y="66" font-size="9" fill="#94a3b8">0°</text>
    <text x="70" y="9" font-size="9" fill="#94a3b8" text-anchor="middle">90°</text>
    <text x="122" y="66" font-size="9" fill="#94a3b8">180°</text>
    <rect x="8" y="88" width="124" height="8" rx="2" fill="#1d4ed8"/>
    <rect x="24" y="72" width="92" height="46" rx="6" fill="#3b82f6"/>
    <circle cx="70" cy="72" r="13" fill="#1e3a8a"/>
    <g class="horn"><rect x="64" y="20" width="12" height="52" rx="6" fill="#f8fafc" stroke="#94a3b8"/>
      <circle cx="70" cy="27" r="3" fill="#94a3b8"/><circle cx="70" cy="72" r="6" fill="#64748b"/></g>
    <text class="lbl" x="70" y="104" text-anchor="middle" font-size="13" font-weight="700" fill="#fff"></text>
  </svg>`;
  const horn = parent.querySelector(".horn"), lbl = parent.querySelector(".lbl");
  return {
    set(angle) {
      horn.setAttribute("transform", `rotate(${angle - 90} 70 72)`);
      lbl.textContent = Math.round(angle) + "° · " + angleToUs(angle) + " µs";
    },
  };
}

/* canvas helper: pointer position in canvas pixel units */
function canvasPoint(cv, e) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
}
