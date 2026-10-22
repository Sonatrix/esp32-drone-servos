// Station 1 - one servo, 50 Hz PWM. Sweeps 0..180 degrees.
// Library: ESP32Servo (Arduino IDE -> Library Manager)
#include <ESP32Servo.h>

const int SERVO_PIN = 13;
const int PULSE_MIN_US = 500;    // pulse for 0 degrees
const int PULSE_MAX_US = 2500;   // pulse for 180 degrees

Servo servo;

void setup() {
  Serial.begin(115200);
  ESP32PWM::allocateTimer(0);    // reserve a hardware timer for the servo PWM
  servo.setPeriodHertz(50);      // 50 Hz = one pulse every 20 ms
  servo.attach(SERVO_PIN, PULSE_MIN_US, PULSE_MAX_US);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    servo.write(angle);          // pulse = 500 + angle/180 * 2000 us
    delay(20);
  }
  for (int angle = 180; angle >= 0; angle -= 2) {
    servo.write(angle);
    delay(20);
  }
  Serial.println("sweep done");
}
