// Station 3 - four control-surface servos on a fixed-wing drone.
// roll/pitch/yaw are -1.0 .. +1.0. Here they come from a demo wave:
// replace readCommands() with your RC receiver (SBUS/PPM) or autopilot.
// BENCH TEST ONLY: power servos from a separate 5 V BEC with a common GND.
#include <ESP32Servo.h>

const int PIN_AILERON_L = 13;
const int PIN_AILERON_R = 14;
const int PIN_ELEVATOR  = 27;
const int PIN_RUDDER    = 26;
const float MAX_DEFLECTION = 30.0f;   // degrees each way from centre (90)

Servo aileronL, aileronR, elevator, rudder;

// cmd -1..+1  ->  servo angle 60..120 degrees
void writeSurface(Servo &s, float cmd) {
  cmd = constrain(cmd, -1.0f, 1.0f);
  s.write((int)(90.0f + MAX_DEFLECTION * cmd));
}

void readCommands(float &roll, float &pitch, float &yaw) {
  float t = millis() / 1000.0f;
  roll  = sinf(t);
  pitch = 0.5f * sinf(t * 0.7f);
  yaw   = 0.0f;
}

void attachServo(Servo &s, int pin) {
  s.setPeriodHertz(50);
  s.attach(pin, 500, 2500);
}

void setup() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  attachServo(aileronL, PIN_AILERON_L);
  attachServo(aileronR, PIN_AILERON_R);
  attachServo(elevator, PIN_ELEVATOR);
  attachServo(rudder,   PIN_RUDDER);
}

void loop() {
  float roll, pitch, yaw;
  readCommands(roll, pitch, yaw);

  writeSurface(aileronL,  roll);    // ailerons move in OPPOSITE directions
  writeSurface(aileronR, -roll);
  writeSurface(elevator, -pitch);   // pull back (+pitch) = trailing edge UP
  writeSurface(rudder,    yaw);

  delay(20);                        // 50 Hz control loop
}
