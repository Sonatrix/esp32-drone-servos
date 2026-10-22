# Servo Lab – ESP32 drone edition

An interactive, no-build web app that explains how servos work on an ESP32 drone. Open `index.html` in a browser.

## Stations
1. **The signal** – 50 Hz PWM: pulse width → angle, live waveform, duty-cycle and ESP32 LEDC maths, switchable pulse ranges.
2. **Inside a servo** – motor, gears, potentiometer and a P-controller. Grab the horn and push it, change stiffness (Kp).
3. **Fly the drone** – ailerons, elevator, rudder, attitude indicator, gusts, PD **auto-level**, **flying-wing mixer**.
4. **Camera gimbal** – IMU-driven counter-rotation, servo speed and range limits.
5. **Wiring** – why servos need a 5 V BEC and a common ground; brownout and jitter scenarios; ESP32 pin notes (safe pins, 3.3 V signals, LEDC timers, MPU6050 wiring).
6. **Quadcopter & ESC** – a quad has no servos: ESC pulses (1000–2000 µs), arming rules, X-quad motor mixer.
7. **More servo jobs** – retractable landing gear, payload release, tilt-rotor (VTOL).
8. **Pick a servo** – rule-of-thumb hinge-moment estimate → required torque, speed and BEC current for typical servo classes.
9. **Quiz & glossary** – 13 questions with explanations, best score saved locally.

## Learning flow
- **🎯 Missions** – every station has goals the page checks live (for example "reach 150° with under 5° overshoot", "recover from a gust with auto-level", "tune the auto-level to settle in ≤ 1 s"). Each earns a ⭐; progress is saved in the browser. **Guided** mode (default) unlocks the next station after one star; **Free explore** opens everything.
- **🔮 Predict first** – commit to an answer ("Roll right: what does the left aileron do?"), then the real simulation runs and reveals the truth. A correct prediction earns a ⭐. The tests check that each taught answer is what the simulation actually does.
- **🎛️ Tune it yourself** (station 3) – Kp, Kd, servo speed and sensor noise for the roll auto-level, a **step test** with a live response chart, and a verdict: sluggish, overshoots, oscillating, ok or excellent. Slow servo + high Kp really does oscillate.

Deep-link with `#pwm`, `#inside`, `#fly`, `#gimbal`, `#wiring`, `#quad`, `#jobs`, `#picker`, `#quiz`.

## Arduino sketches (`sketches/`)
Each station's code panel shows a full sketch; the same code lives here as `.ino` files:
`01_pwm_sweep`, `02_control_surfaces`, `03_auto_level_mpu6050`, `04_gimbal_mpu6050`, `05_four_servos_power`, `06_quad_mixer_esc`.
Library needed: **ESP32Servo** (the MPU6050 sketches talk to the chip over plain I²C, no extra library).

> **Status:** these sketches were written and reviewed but **not compiled or flashed**. No Arduino toolchain was available when they were made. Compile them once in the Arduino IDE (board: ESP32 Dev Module) before relying on them, and bench-test with **propellers removed**. The IMU axis signs depend on how you mount the MPU6050.

## Simulator (`wokwi/`)
`wokwi/` has a one-servo ESP32 project (`diagram.json`, `sketch.ino`, `libraries.txt`) for the [Wokwi](https://wokwi.com/projects/new/esp32) simulator: paste the files into a new ESP32 project. The `diagram.json` pin names were not verified in Wokwi; fix the wiring in its editor if a pin name is rejected.

## Tests
```
node run-tests.js
```
Runs 52 behaviour tests in headless Edge/Chrome (needs Node 22+): PWM mapping, servo feedback loop (target tracking, Kp overshoot, load droop), control-surface mixing, auto-level recovery, flying-wing saturation, gimbal stabilisation and lag, brownout/jitter scenarios, ESC arming and mixer patterns, gear/payload/tilt-rotor, picker physics scaling, quiz flow, accessibility labels, the tuning verdicts, guided unlocks, **every mission being completable**, and every prediction's taught answer matching the simulation. You can also open `index.html?test` and read the results at the bottom of the page.

## Files
`index.html`, `style.css`, `common.js` (router, servo model), one JS file per station, `tune.js` (step-response tuning), `missions.js`, `predict.js`, `main.js`, `tests.js`, `run-tests.js`.

## Notes
The physics is deliberately simplified for teaching and the servo-sizing numbers are rules of thumb with typical datasheet-class values: always check your exact servo's datasheet. Respects `prefers-reduced-motion` and `prefers-color-scheme`; pictures have text alternatives, wires are keyboard-operable.
