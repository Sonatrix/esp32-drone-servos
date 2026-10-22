// Run in the Wokwi simulator: one servo on GPIO13, no hardware needed.
#include <ESP32Servo.h>

Servo servo;

void setup() {
  Serial.begin(115200);
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);
  servo.attach(13, 500, 2500);
}

void loop() {
  for (int a = 0; a <= 180; a += 3) { servo.write(a); delay(20); }
  for (int a = 180; a >= 0; a -= 3) { servo.write(a); delay(20); }
  Serial.println("sweep done");
}
