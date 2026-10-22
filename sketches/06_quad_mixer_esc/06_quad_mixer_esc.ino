// Station 6 - quadcopter motor mixer. ESCs take the SAME kind of pulse as a
// servo, but 1000 us = stop and 2000 us = full power.
// !!! PROPELLERS OFF while testing. Motors can start suddenly. !!!
//
//   M1 front-right (CCW)   M4 front-left (CW)
//   M2 rear-right  (CW)    M3 rear-left  (CCW)
#include <ESP32Servo.h>

const int MOTOR_PINS[4] = {13, 14, 27, 26};
Servo esc[4];

// throttle 0..1, roll/pitch/yaw -1..1 (roll right, nose up, yaw right = positive)
void mix(float throttle, float roll, float pitch, float yaw, float out[4]) {
  out[0] = throttle - roll + pitch + yaw;   // M1
  out[1] = throttle - roll - pitch - yaw;   // M2
  out[2] = throttle + roll - pitch + yaw;   // M3
  out[3] = throttle + roll + pitch - yaw;   // M4
  for (int i = 0; i < 4; i++) out[i] = constrain(out[i], 0.0f, 1.0f);
}

void setup() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  for (int i = 0; i < 4; i++) {
    esc[i].setPeriodHertz(50);
    esc[i].attach(MOTOR_PINS[i], 1000, 2000);
    esc[i].writeMicroseconds(1000);          // ARM: hold minimum throttle
  }
  delay(3000);                               // ESCs beep when armed
}

void loop() {
  float out[4];
  mix(0.15f, 0.0f, 0.0f, 0.0f, out);         // low idle throttle, level
  for (int i = 0; i < 4; i++) {
    esc[i].writeMicroseconds(1000 + (int)(1000.0f * out[i]));
  }
  delay(20);
}
