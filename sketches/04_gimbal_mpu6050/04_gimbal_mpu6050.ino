// Station 4 - roll gimbal: the servo turns opposite to the drone's tilt so
// the camera stays level. MPU6050 on SDA->GPIO21, SCL->GPIO22.
#include <Wire.h>
#include <ESP32Servo.h>

const uint8_t MPU_ADDR = 0x68;
const int GIMBAL_PIN = 13;
const bool STABILISE = true;

Servo gimbal;
float roll = 0;
unsigned long lastUs = 0;

bool readRoll(float &accRoll, float &gx) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, (uint8_t)14, (bool)true) != 14) return false;
  int16_t v[7];
  for (int i = 0; i < 7; i++) {
    int16_t hi = Wire.read();
    int16_t lo = Wire.read();
    v[i] = (int16_t)((hi << 8) | (lo & 0xFF));
  }
  accRoll = atan2f(v[1] / 16384.0f, v[2] / 16384.0f) * RAD_TO_DEG;
  gx = v[4] / 131.0f;
  return true;
}

void setup() {
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); Wire.write(0x00);
  Wire.endTransmission(true);
  ESP32PWM::allocateTimer(0);
  gimbal.setPeriodHertz(50);
  gimbal.attach(GIMBAL_PIN, 500, 2500);
  lastUs = micros();
}

void loop() {
  float accRoll, gx;
  if (readRoll(accRoll, gx)) {
    unsigned long now = micros();
    float dt = (now - lastUs) / 1e6f;
    lastUs = now;
    roll = 0.98f * (roll + gx * dt) + 0.02f * accRoll;   // degrees
  }

  float target = STABILISE ? 90.0f - roll : 90.0f;       // opposite direction
  target = constrain(target, 0.0f, 180.0f);              // servo stops
  gimbal.write((int)target);
  delay(10);
}
