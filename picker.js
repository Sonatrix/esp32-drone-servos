"use strict";
/* Station 8: servo + BEC picker. Rule-of-thumb hinge-moment estimate for a control surface. */
(() => {
  // Typical datasheet-class values at ~5 V. Check the datasheet of your exact servo.
  const SERVOS = [
    { id: "micro",  name: "Micro 9 g (SG90 class)",         kgcm: 1.8, sec60: 0.10, stall: 0.65 },
    { id: "mini",   name: "Mini metal gear (MG90S class)",  kgcm: 2.2, sec60: 0.10, stall: 0.70 },
    { id: "std",    name: "Standard metal gear (MG996R class)", kgcm: 9.4, sec60: 0.17, stall: 2.5 },
    { id: "digital", name: "Digital standard (~15 kg·cm class)", kgcm: 15, sec60: 0.12, stall: 2.5 },
  ];
  const RHO = 1.225, SAFETY = 2.5, KGCM_PER_NM = 10.197;
  const IN = ["Chord", "Span", "V", "Defl", "Sh", "Ch", "N", "Bec"];
  const sel = $("pkServo");
  sel.innerHTML = SERVOS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  let last = null;

  function calc() {
    const chord = +$("pkChord").value / 1000, span = +$("pkSpan").value / 1000, V = +$("pkV").value;
    const defl = +$("pkDefl").value, sh = +$("pkSh").value / 1000, ch = +$("pkCh").value / 1000;
    const n = +$("pkN").value, bec = +$("pkBec").value;
    const servo = SERVOS.find((s) => s.id === sel.value);

    const q = 0.5 * RHO * V * V;                    // dynamic pressure, Pa
    const area = chord * span;                      // control surface area, m²
    const Ch = 0.0045 * defl;                       // hinge-moment coefficient (rule of thumb)
    const hinge = q * area * chord * Ch;            // N·m about the hinge
    const force = hinge / ch;                       // N at the control horn
    const servoNm = force * sh;                     // N·m the servo must produce
    const needKgcm = servoNm * KGCM_PER_NM * SAFETY;
    const ratio = servo.kgcm / needKgcm;

    const dps = 60 / servo.sec60;                   // deg/s
    const fullThrow = (2 * defl) / dps;             // s for one extreme to the other
    const peakA = n * servo.stall * 0.5;            // typical peak: half the servos near half stall...
    const worstA = n * servo.stall;

    const torqueCls = ratio >= 1.5 ? "good" : ratio >= 1 ? "warn" : "bad";
    const becCls = peakA <= bec * 0.8 ? "good" : peakA <= bec ? "warn" : "bad";
    const speedCls = fullThrow <= 0.15 ? "good" : fullThrow <= 0.3 ? "warn" : "bad";

    const R = {
      hinge, needKgcm, ratio, torqueCls, dps, fullThrow, speedCls, peakA, worstA, becCls,
      servoKgcm: servo.kgcm, servoName: servo.name, servoId: servo.id, V, chordMm: Math.round(chord * 1000), spanMm: Math.round(span * 1000),
    };
    last = R;

    $("pkChordOut").textContent = Math.round(chord * 1000) + " mm";
    $("pkSpanOut").textContent = Math.round(span * 1000) + " mm";
    $("pkVOut").textContent = V + " m/s";
    $("pkDeflOut").textContent = "±" + defl + "°";
    $("pkShOut").textContent = Math.round(sh * 1000) + " mm";
    $("pkChOut").textContent = Math.round(ch * 1000) + " mm";
    $("pkNOut").textContent = n;
    $("pkBecOut").textContent = bec.toFixed(1) + " A";

    $("pkResults").innerHTML = `
      <div class="res"><b>Air load on the surface</b>hinge moment ≈ ${hinge.toFixed(3)} N·m, push at the control horn ≈ ${force.toFixed(1)} N</div>
      <div class="res ${torqueCls}"><b>Torque: ${torqueCls === "good" ? "✅ plenty" : torqueCls === "warn" ? "⚠️ marginal" : "❌ too weak"}</b>
        needed (×${SAFETY} safety) ≈ ${needKgcm.toFixed(2)} kg·cm · your servo ≈ ${servo.kgcm} kg·cm (${(ratio).toFixed(1)}× margin)</div>
      <div class="res ${speedCls}"><b>Speed: ${speedCls === "good" ? "✅ snappy" : speedCls === "warn" ? "⚠️ a bit slow" : "❌ sluggish"}</b>
        ${Math.round(dps)}°/s → about ${(fullThrow * 1000).toFixed(0)} ms to swing from one end of the throw to the other</div>
      <div class="res ${becCls}"><b>Power: ${becCls === "good" ? "✅ BEC is enough" : becCls === "warn" ? "⚠️ close to the limit" : "❌ BEC too small"}</b>
        typical peak ≈ ${peakA.toFixed(1)} A, worst case (all stalled) ≈ ${worstA.toFixed(1)} A · BEC ${bec.toFixed(1)} A</div>`;

    setCode(
`// Rule-of-thumb servo sizing (teaching estimate, not a certification!)
float q      = 0.5f * 1.225f * V * V;              // dynamic pressure: ${q.toFixed(0)} Pa
float hinge  = q * (span * chord) * chord * (0.0045f * deflDeg);   // ${hinge.toFixed(4)} N*m
float force  = hinge / controlHorn;                // ${force.toFixed(2)} N at the control horn
float servoT = force * servoHorn;                  // ${servoNm.toFixed(4)} N*m at the servo
float needKgCm = servoT * 10.197f * 2.5f;          // x2.5 safety = ${needKgcm.toFixed(2)} kg*cm
// choose a servo whose rated torque is above needKgCm
// BEC amps >= number_of_servos * stall_current * 0.5   (= ${peakA.toFixed(1)} A for ${n} x ${servo.name.split(" (")[0]})`);
  }

  IN.forEach((k) => $("pk" + k).addEventListener("input", calc));
  sel.addEventListener("change", calc);
  registerTab("picker", {
    show: calc,
    state: () => ({ ...last }),
    set: (o) => { Object.entries(o).forEach(([k, v]) => { const el = $(k); if (el) el.value = v; }); calc(); },
  });
})();
