// Original MIT-licensed integration sketch. Compile for the classic Nano ATmega328P.
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  pinMode(13, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  const int input = analogRead(A0);
  analogWrite(6, input / 4);
  digitalWrite(13, (millis() / 10) % 2 == 0 || digitalRead(2) == LOW);
  Serial.println(input);
  delay(1);
}
