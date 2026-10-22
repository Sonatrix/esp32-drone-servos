// Station 5 - four servos, correct wiring.
//   servo red   -> 5 V BEC (+)         NOT an ESP32 pin
//   servo brown -> BEC (-), ESP32 GND  all grounds joined
//   servo orange-> GPIO 13, 14, 27, 26 signal only
// Add a 470-1000 uF capacitor across the servo supply near the servos.
#include <ESP32Servo.h>

const int NUM_SERVOS = 4;
const int PINS[NUM_SERVOS] = {13, 14, 27, 26};
Servo servos[NUM_SERVOS];

void setup() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  for (int i = 0; i < NUM_SERVOS; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(PINS[i], 500, 2500);   // signal only!
  }
}

void loop() {
  float t = millis() / 1000.0f;
  for (int i = 0; i < NUM_SERVOS; i++) {
    float angle = 90.0f + 60.0f * sinf(t * 2.0f + i * 0.9f);
    servos[i].write((int)angle);
  }
  delay(20);
}
