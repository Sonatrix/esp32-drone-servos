"use strict";
/* Station 5: wiring + power – why servos need their own supply and a common ground */
(() => {
  const svg = $("wrSvg");
  const PINS = [["GPIO13", 92], ["GPIO14", 116], ["GPIO27", 140], ["GPIO26", 164], ["3V3", 206], ["VIN / 5V", 230], ["GND", 254]];
  const SY = [40, 112, 184, 256];       // servo tops
  let mode = "bec", moving = true, t = 0, resetT = 0, nextReset = 2.4, jitter = [0, 0, 0, 0], resets = 0;
  const ang = [90, 90, 90, 90];

  const LABELS = { signal: "Signal", power: "Power", ground: "Ground" };
  const NOTES = {
    signal: "🟠 SIGNAL wire (orange/yellow): carries the 50 Hz pulse from one ESP32 GPIO. Each servo needs its own GPIO. It only carries a tiny current.",
    power:  "🔴 POWER wire (red): feeds the servo's motor. A moving servo can pull 0.5–2 A, far more than the ESP32's pins or regulator can give. Use a 5 V BEC from the flight battery.",
    ground: "🟤 GROUND wire (brown/black): the return path AND the voltage reference for the signal. The ESP32 and the servo supply must share the same ground.",
  };
  const MODES = {
    "3v3": { cls: "bad",  src: "3V3", text: "❌ The ESP32's 3.3 V regulator can't supply motor current. When servos move, the voltage sags below the ESP32's limit: BROWNOUT, and it reboots again and again." },
    "vin": { cls: "warn", src: "VIN", text: "⚠️ USB 5 V works for one tiny servo on a bench. Four servos pulling current together drop the voltage and the ESP32 resets from time to time." },
    "bec": { cls: "good", src: "BEC", text: "✅ Correct: a separate 5 V BEC feeds the servos, the grounds are joined, and the ESP32 only sends signals. Clean power, smooth movement. Add a 470–1000 µF capacitor near the servos for spikes." },
    "nogd":{ cls: "bad",  src: "BEC", text: "❌ Servos are powered, but the grounds aren't connected. The signal has no reference, so servos twitch and jitter randomly." },
  };

  function wire(cls, d, color) {
    return `<g class="wire" data-w="${cls}" tabindex="0" role="button" aria-label="${LABELS[cls]} wire: press Enter to learn what it does"><path d="${d}" fill="none" stroke="transparent" stroke-width="14"/><path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/></g>`;
  }
  function build() {
    const m = MODES[mode];
    let s = `<rect x="14" y="58" width="146" height="224" rx="12" fill="#1e293b" stroke="#475569" stroke-width="3"/>
      <text x="87" y="78" text-anchor="middle" fill="#e2e8f0" font-size="14" font-weight="700">ESP32</text>
      <circle id="wrLed" cx="40" cy="262" r="6" fill="#22c55e"/>`;
    PINS.forEach(([n, y]) => { s += `<circle cx="160" cy="${y}" r="4" fill="#e2e8f0"/><text x="152" y="${y + 4}" text-anchor="end" fill="#cbd5e1" font-size="11">${n}</text>`; });

    // BEC + battery
    s += `<rect x="250" y="318" width="120" height="44" rx="8" fill="#16a34a"/><text x="310" y="336" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">5 V BEC</text>
      <text x="310" y="352" text-anchor="middle" fill="#dcfce7" font-size="10">from flight battery</text>
      <text x="376" y="324" font-size="10" fill="#94a3b8">+</text><text x="376" y="354" font-size="10" fill="#94a3b8">−</text>`;

    // servos
    SY.forEach((y, i) => {
      s += `<rect x="470" y="${y}" width="150" height="56" rx="8" fill="#3b82f6" stroke="#1d4ed8" stroke-width="3"/>
        <text x="480" y="${y + 50}" font-size="10" fill="#e0f2fe">servo ${i + 1}</text>
        <g id="wrH${i}" transform="translate(588 ${y + 28})"><line x1="0" y1="0" x2="0" y2="-24" stroke="#f8fafc" stroke-width="7" stroke-linecap="round"/><circle r="5" fill="#64748b"/></g>
        <circle cx="470" cy="${y + 12}" r="3.5" fill="#f59e0b"/><circle cx="470" cy="${y + 28}" r="3.5" fill="#ef4444"/><circle cx="470" cy="${y + 44}" r="3.5" fill="#a16207"/>`;
    });

    // signals
    SY.forEach((y, i) => { s += wire("signal", `M160 ${PINS[i][1]} H${236 + i * 16} V${y + 12} H470`, "#f59e0b"); });
    // power bus x=412, ground bus x=436
    let busEnd = 372;
    s += wire("power", `M412 ${SY[0] + 28} V${busEnd}`, "#ef4444");
    SY.forEach((y) => { s += wire("power", `M412 ${y + 28} H470`, "#ef4444"); });
    if (m.src === "3V3") s += wire("power", `M160 206 H214 V${busEnd} H412`, "#ef4444");
    if (m.src === "VIN") s += wire("power", `M160 230 H224 V${busEnd - 4} H412`, "#ef4444");
    if (m.src === "BEC") s += wire("power", `M370 326 H412`, "#ef4444");
    s += wire("ground", `M436 ${SY[0] + 44} V378`, "#a16207");
    SY.forEach((y) => { s += wire("ground", `M436 ${y + 44} H470`, "#a16207"); });
    if (mode !== "nogd") s += wire("ground", `M160 254 H200 V378 H436`, "#a16207");
    else s += `<path d="M160 254 H200 V378 H300" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="4 5"/><text x="318" y="392" fill="#ef4444" font-size="11" font-weight="700">✖ no common GND</text>`;
    if (m.src === "BEC" || mode === "nogd") s += wire("ground", `M370 356 H436`, "#a16207");
    svg.innerHTML = s;
    svg.querySelectorAll(".wire").forEach((g) => {
      const show = () => { $("wrWire").textContent = NOTES[g.dataset.w]; };
      g.addEventListener("click", show);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); } });
    });
    svg.setAttribute("role", "group"); svg.setAttribute("aria-label", "Wiring diagram: ESP32, 5 volt BEC and four servos. Each wire is a focusable button.");
    $("wrStatus").className = "status " + m.cls; $("wrStatus").textContent = m.text;
    document.querySelectorAll("#wrModes button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
    code();
  }

  function code() {
    setCode(
`// Full sketch: sketches/05_four_servos_power/05_four_servos_power.ino
#include <ESP32Servo.h>

const int PINS[4] = {13, 14, 27, 26};
Servo servos[4];

void setup() {
  ESP32PWM::allocateTimer(0); ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2); ESP32PWM::allocateTimer(3);
  for (int i = 0; i < 4; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(PINS[i], 500, 2500);   // signal only!
  }
}
// Power : servo red wire   -> 5 V BEC, NOT an ESP32 pin
// Ground: BEC GND + servo GND + ESP32 GND all joined${mode === "bec" ? "   <- this is the correct setup" : "   <- not what you have selected!"}
void loop() { /* servos[i].write(angle) ... */ }`);
  }

  document.querySelectorAll("#wrModes button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; resetT = 0; nextReset = 1.5; build(); }));
  $("wrMove").addEventListener("click", (e) => { moving = e.currentTarget.classList.toggle("on"); });

  registerTab("wiring", {
    show() { build(); },
    state: () => ({ mode, moving, resets, frozen: resetT > 0, ang: [...ang], status: $("wrStatus").textContent }),
    set: (o) => { if ("mode" in o) { mode = o.mode; resetT = 0; nextReset = 1.5; build(); } if ("moving" in o) moving = o.moving; },
    tick(dt) {
      t += dt;
      let frozen = false;
      if (moving && (mode === "3v3" || mode === "vin")) {
        nextReset -= dt;
        if (nextReset < 0) { resetT = 0.9; resets++; nextReset = mode === "3v3" ? 2.2 : 5; }
      }
      if (resetT > 0) { resetT -= dt; frozen = true; }
      const led = $("wrLed");
      if (REDUCED && frozen) { frozen = false; }
      if (led) led.setAttribute("fill", frozen ? "#ef4444" : "#22c55e");
      if (frozen) $("wrStatus").textContent = "💥 BROWNOUT! The ESP32 is rebooting… servos freeze.";
      else if (MODES[mode].text !== $("wrStatus").textContent) $("wrStatus").textContent = MODES[mode].text;

      for (let i = 0; i < 4; i++) {
        let a = ang[i];
        if (!moving || frozen) { /* hold */ }
        else if (mode === "nogd") { if (Math.random() < 0.25) a = 90 + (Math.random() - 0.5) * 100; }
        else a = 90 + 60 * Math.sin(t * 2 + i * 0.9);
        ang[i] = a;
        const h = $("wrH" + i); if (h) h.setAttribute("transform", `translate(588 ${SY[i] + 28}) rotate(${a - 90})`);
      }
    },
  });
})();
