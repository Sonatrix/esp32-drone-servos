// Station 3 - auto-level: an MPU6050 IMU measures tilt, the ESP32 steers the
// aileron and elevator servos to bring the plane back to level.
// Wiring: MPU6050 VCC->3V3, GND->GND, SDA->GPIO21, SCL->GPIO22.
// Check the sign of roll/pitch for YOUR mounting direction before flying!
#include <Wire.h>
#include <ESP32Servo.h>

const uint8_t MPU_ADDR = 0x68;
const int PIN_AILERON_L = 13, PIN_AILERON_R = 14, PIN_ELEVATOR = 27;
const float MAX_DEFLECTION = 30.0f;
const float KP_ROLL = 0.035f, KD_ROLL = 0.008f;     // tune on the bench
const float KP_PITCH = 0.040f, KD_PITCH = 0.010f;

Servo aileronL, aileronR, elevator;
float roll = 0, pitch = 0;           // degrees (complementary filter)
float rollRate = 0, pitchRate = 0;   // degrees per second (gyro)
unsigned long lastUs = 0;

bool readImu(float &ax, float &ay, float &az, float &gx, float &gy) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);                             // first accelerometer register
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, (uint8_t)14, (bool)true) != 14) return false;
  int16_t v[7];
  for (int i = 0; i < 7; i++) {
    int16_t hi = Wire.read();
    int16_t lo = Wire.read();
    v[i] = (int16_t)((hi << 8) | (lo & 0xFF));  // ax ay az temp gx gy gz
  }
  ax = v[0] / 16384.0f; ay = v[1] / 16384.0f; az = v[2] / 16384.0f;
  gx = v[4] / 131.0f;   gy = v[5] / 131.0f;
  return true;
}

void writeSurface(Servo &s, float cmd) {
  cmd = constrain(cmd, -1.0f, 1.0f);
  s.write((int)(90.0f + MAX_DEFLECTION * cmd));
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); Wire.write(0x00);           // wake the MPU6050 up
  Wire.endTransmission(true);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  aileronL.setPeriodHertz(50);
  aileronR.setPeriodHertz(50);
  elevator.setPeriodHertz(50);
  aileronL.attach(PIN_AILERON_L, 500, 2500);
  aileronR.attach(PIN_AILERON_R, 500, 2500);
  elevator.attach(PIN_ELEVATOR, 500, 2500);
  lastUs = micros();
}

void loop() {
  float ax, ay, az, gx, gy;
  if (readImu(ax, ay, az, gx, gy)) {
    unsigned long now = micros();
    float dt = (now - lastUs) / 1e6f;
    lastUs = now;

    float accRoll  = atan2f(ay, az) * RAD_TO_DEG;
    float accPitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG;
    rollRate = gx; pitchRate = gy;
    roll  = 0.98f * (roll  + gx * dt) + 0.02f * accRoll;    // complementary filter
    pitch = 0.98f * (pitch + gy * dt) + 0.02f * accPitch;
  }

  // PD control: fight the tilt (P) and the speed of the tilt (D)
  float rollCmd  = constrain(-(roll  * KP_ROLL  + rollRate  * KD_ROLL),  -1.0f, 1.0f);
  float pitchCmd = constrain(-(pitch * KP_PITCH + pitchRate * KD_PITCH), -1.0f, 1.0f);

  writeSurface(aileronL,  rollCmd);
  writeSurface(aileronR, -rollCmd);
  writeSurface(elevator, -pitchCmd);
  delay(10);                                    // ~100 Hz
}
