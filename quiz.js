"use strict";
/* Station 9: quiz + glossary */
(() => {
  const QUIZ = [
    { q: "Which pulse width centres (90°) a servo that uses 500–2500 µs?", a: "1500 µs", o: ["1000 µs", "1500 µs", "2000 µs", "2500 µs"], why: "90° is exactly halfway: (500 + 2500) / 2 = 1500 µs." },
    { q: "How often does the ESP32 send a servo pulse?", a: "50 times per second", o: ["5 times per second", "50 times per second", "500 times per second"], why: "50 Hz means one pulse every 20 ms." },
    { q: "What tells the servo which angle to go to?", a: "The length of the pulse", o: ["The voltage level", "The length of the pulse", "How many pulses per second"], why: "The frequency stays at 50 Hz. Only the pulse width carries the message." },
    { q: "Which part tells the servo's circuit where the horn really is?", a: "A potentiometer", o: ["The battery", "A potentiometer", "The horn screw"], why: "A pot on the output shaft changes resistance with angle: the feedback sensor." },
    { q: "Kp (stiffness) is set far too high. What happens?", a: "The horn overshoots and wobbles", o: ["The horn never moves", "The horn overshoots and wobbles", "The servo gets colder"], why: "Too much push for the error makes it fly past the target, then correct back again and again." },
    { q: "Roll right: the right aileron goes up. The left aileron…", a: "goes down", o: ["goes up too", "goes down", "stays still"], why: "Ailerons work in opposite directions: lift rises on one wing and falls on the other." },
    { q: "You pull the stick back to climb. The elevator trailing edge goes…", a: "up", o: ["up", "down", "sideways"], why: "Up elevator pushes the tail down, so the nose rises." },
    { q: "The drone tilts +20° and the gimbal should keep the camera level. Servo target (90° = centre)?", a: "70°", o: ["110°", "70°", "20°"], why: "Move the opposite way: 90 − 20 = 70°." },
    { q: "Why not power four servos from the ESP32's 3V3 pin?", a: "They draw too much current, causing brownouts", o: ["3.3 V is too high", "They draw too much current, causing brownouts", "The pin has the wrong colour"], why: "Moving servos pull amps. The regulator sags and the ESP32 reboots." },
    { q: "What must the ESP32 and the servo BEC share?", a: "Ground", o: ["The 5 V wire", "Ground", "The signal wire only"], why: "A common ground gives the signal a reference. Without it servos jitter." },
    { q: "A quadcopter has no servos. How does it steer?", a: "By changing the speed of its motors", o: ["By tilting wing flaps", "By changing the speed of its motors", "By pulling a rudder"], why: "Different speeds on each motor create roll, pitch and yaw." },
    { q: "What pulse width does an ESC read as STOP?", a: "1000 µs", o: ["500 µs", "1000 µs", "1500 µs", "2500 µs"], why: "ESCs use 1000 µs for zero throttle and 2000 µs for full throttle." },
    { q: "Which servo spec must be larger than the air load on a control surface?", a: "Torque (kg·cm)", o: ["Weight in grams", "Torque (kg·cm)", "Wire length"], why: "The servo must out-push the hinge moment, with a safety margin." },
  ];
  const GLOSS = [
    ["PWM", "Pulse-width modulation: a signal that switches on and off; the width of the on-time carries the message."],
    ["Duty cycle", "The share of time the signal is high. 1500 µs of a 20 ms period = 7.5 %."],
    ["Servo horn", "The arm screwed to the servo's output shaft that drives a linkage."],
    ["Potentiometer", "A variable resistor on the servo shaft that reports the angle."],
    ["Kp / stiffness", "How hard the controller pushes per degree of error."],
    ["Deadband", "A tiny angle error the servo ignores so it doesn't buzz."],
    ["Aileron", "Wing flap that makes the plane roll."],
    ["Elevator", "Tail flap that makes the nose go up or down."],
    ["Rudder", "Vertical tail flap that yaws the nose left or right."],
    ["Elevon", "A flap that is aileron and elevator in one (flying wings)."],
    ["IMU", "Inertial measurement unit: gyro + accelerometer that measure tilt and rotation."],
    ["PID / PD control", "A control rule that reacts to the error, its speed of change (and its history)."],
    ["BEC", "Battery eliminator circuit: a regulator that gives servos a steady 5 V from the flight battery."],
    ["ESC", "Electronic speed controller that powers a brushless motor from a pulse command."],
    ["Brownout", "The ESP32 resets because its supply voltage dipped too low."],
    ["Gimbal", "A pivoting mount (here, one servo) that keeps a camera steady."],
    ["LEDC", "The ESP32's PWM hardware, used by the ESP32Servo library."],
  ];

  const box = $("quizBox");
  let qi = 0, score = 0, answered = false, order = [], finished = false, finalScore = 0;
  const best = () => { try { return +localStorage.getItem("servoLabBest") || 0; } catch { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem("servoLabBest", String(v)); } catch { /* ignore */ } };
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  function start() { qi = 0; score = 0; finished = false; order = shuffle(QUIZ.map((_, i) => i)); ask(); }
  function ask() {
    answered = false;
    const item = QUIZ[order[qi]];
    box.innerHTML = `<p class="hint">Question ${qi + 1} of ${QUIZ.length} · score ${score} · best ${best()}</p>
      <p class="q">${item.q}</p><div class="opts" role="group" aria-label="Answers"></div><p class="why real" hidden aria-live="polite"></p><div class="row"><button id="qzNext" hidden>Next ➜</button></div>`;
    const opts = box.querySelector(".opts");
    shuffle(item.o).forEach((o) => {
      const b = document.createElement("button"); b.textContent = o;
      b.addEventListener("click", () => pick(b, o, item));
      opts.appendChild(b);
    });
    $("qzNext").addEventListener("click", () => { qi++; qi >= QUIZ.length ? done() : ask(); });
  }
  function pick(btn, o, item) {
    if (answered) return;
    answered = true;
    const ok = o === item.a;
    if (ok) score++;
    btn.classList.add(ok ? "right" : "wrong");
    box.querySelectorAll(".opts button").forEach((b) => { b.disabled = true; if (b.textContent === item.a) b.classList.add("right"); });
    const why = box.querySelector(".why"); why.hidden = false; why.textContent = (ok ? "✅ Correct! " : "❌ Not quite. ") + item.why;
    $("qzNext").hidden = false; $("qzNext").textContent = qi + 1 >= QUIZ.length ? "See score ➜" : "Next ➜";
  }
  function done() {
    finished = true; finalScore = score;
    const b = best(); if (score > b) saveBest(score);
    const msg = score === QUIZ.length ? "Perfect! You could build the drone. 🏆" : score >= QUIZ.length * 0.7 ? "Great job! Review the ones you missed." : "Good start. Revisit the stations and try again!";
    box.innerHTML = `<h3>Score: ${score} / ${QUIZ.length}</h3><p>${msg}</p><p class="hint">Best: ${Math.max(b, score)}</p><div class="row"><button id="qzAgain">Play again</button></div>`;
    $("qzAgain").addEventListener("click", start);
  }

  $("gloss").innerHTML = GLOSS.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("");
  registerTab("quiz", {
    show() { setCode("// No code here: this station is a quiz.\n// Every code sample in the other stations has a full sketch in sketches/."); if (!order.length) start(); },
    state: () => ({ qi, score, answered, finished, finalScore, total: QUIZ.length, current: order.length ? QUIZ[order[qi]] : null }),
    restart: start,
    data: QUIZ,
  });
})();
