/*
 * Two-NTC thermal wind sensor, classic 5 V Uno / Nano ATmega328P.
 * Original example, MIT. See docs/wind-sensor.md for circuit and calibration.
 * Requires only the Arduino AVR core (1.8.6 tested), including Wire.
 * No calibration numbers are invented: the initial wind result is unknown.
 * Upload with the heater disconnected, verify both temperatures, then connect it.
 */
#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <avr/pgmspace.h>

// false = constant power; true = constant-temperature PI controller.
const bool CONSTANT_TEMPERATURE = false;
// Recommended: use the MOSFET driver for BOTH modes. Direct fixed-power wiring
// can use false here, but software cannot switch that heater off on a fault.
const bool HEATER_HAS_DRIVER = true;
const uint8_t AIR_PIN = A0, HOT_PIN = A1, HEATER_PIN = 9;
const uint8_t OLED_ADDRESS = 0x3C;  // 7-bit address; some modules use 0x3D.
const bool OLED_IS_SH1106 = true;  // false for SSD1306 (different column offset/init).
const float NTC_NOMINAL_OHMS = 10000.0f;
const float NTC_NOMINAL_C = 25.0f;
const float NTC_BETA_K = 3950.0f;   // Use the actual part's Beta interval/value.
const float AIR_FIXED_OHMS = 10000.0f; // Enter measured fixed resistances separately.
const float HOT_FIXED_OHMS = 10000.0f;
const float AIR_OFFSET_C = 0.0f, HOT_OFFSET_C = 0.0f; // Matched at heater OFF.
const float HEATER_OHMS = 150.0f;
const float HEATER_SUPPLY_V = 5.0f; // MEASURE at heater; Nano USB may be below 5 V.
const float MOSFET_ON_OHMS = 5.3f;  // Conservative 2N7000 value; measure for accuracy.
const float TARGET_DELTA_C = 20.0f;
const float MAX_HOT_C = 65.0f, MAX_DELTA_C = 35.0f;
const float KP = 0.025f, KI = 0.005f; // duty/C, duty/(C*s), tune on your assembly.
const float FILTER_ALPHA = 0.2f;
const uint8_t ADC_SAMPLES = 16;
const uint32_t SAMPLE_MS = 100, DISPLAY_MS = 500, WARMUP_MS = 30000;

struct CalibrationPoint { float speedMps; float signal; };
// Edit these measured values, then set CALIBRATION_ENTERED=true.
// Constant-power signal = settled deltaT in deg C, DECREASING with speed.
// CTA signal = mean heater power in watts, INCREASING with speed.
// Rebuild the table whenever mounting, heater, supply or control mode changes.
const bool CALIBRATION_ENTERED = false;
const CalibrationPoint CALIBRATION[] = {
  {0.0f, NAN}, {1.0f, NAN}, {2.0f, NAN}, {4.0f, NAN}, {6.0f, NAN}
};
const uint8_t CALIBRATION_COUNT = sizeof(CALIBRATION) / sizeof(CALIBRATION[0]);

struct ThermistorReading { float adc, resistanceOhms, temperatureC; bool valid; };
struct Measurements { ThermistorReading air, hot; float airC, hotC, deltaC, windMps, powerW, duty; };
// Explicit declaration keeps Arduino IDE's automatic prototypes after this custom type.
ThermistorReading readThermistor(uint8_t pin, float fixedOhms, float offsetC);
Measurements measured;
bool filtered = false, faultLatched = false, oledOk = false;
float integral = 0.0f, meanPowerW = 0.0f;
uint32_t lastSampleMs = 0, lastDisplayMs = 0, settledSinceMs = 0, heaterStartedMs = 0;
const char* statusText = "WARMING";

// Original compact 5x7 uppercase font, MIT; same glyphs as the workbench example.
const uint8_t WIND_FONT[59][6] PROGMEM = {
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {67,51,8,102,97,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {8,8,8,8,8,0},
  {0,0,96,96,0,0},
  {64,48,8,6,1,0},
  {62,81,73,69,62,0},
  {0,66,127,64,0,0},
  {66,97,81,73,70,0},
  {65,73,73,73,54,0},
  {24,20,18,127,16,0},
  {79,73,73,73,49,0},
  {62,73,73,73,48,0},
  {1,113,9,5,3,0},
  {54,73,73,73,54,0},
  {6,73,73,73,62,0},
  {0,0,54,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {0,0,0,0,0,0},
  {126,9,9,9,126,0},
  {127,73,73,73,54,0},
  {62,65,65,65,65,0},
  {127,65,65,65,62,0},
  {127,73,73,73,65,0},
  {127,9,9,9,1,0},
  {62,65,73,73,121,0},
  {127,8,8,8,127,0},
  {0,65,127,65,0,0},
  {48,64,65,63,1,0},
  {127,8,20,34,65,0},
  {127,64,64,64,64,0},
  {127,2,12,2,127,0},
  {127,6,8,48,127,0},
  {62,65,65,65,62,0},
  {127,9,9,9,6,0},
  {62,65,81,33,94,0},
  {127,9,25,41,70,0},
  {70,73,73,73,49,0},
  {1,1,127,1,1,0},
  {63,64,64,64,63,0},
  {31,32,64,32,31,0},
  {127,32,24,32,127,0},
  {99,20,8,20,99,0},
  {3,4,120,4,3,0},
  {97,81,73,69,67,0}
};

float clampFloat(float value, float low, float high) {
  return value < low ? low : value > high ? high : value;
}

float readAveragedAdc(uint8_t pin) {
  analogRead(pin); // Discard the first sample after switching ADC multiplexer.
  delayMicroseconds(100);
  uint32_t sum = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; ++i) {
    sum += analogRead(pin);
    delayMicroseconds(150); // Spread samples; averaging reduces random noise, not bias.
  }
  return float(sum) / ADC_SAMPLES;
}

ThermistorReading readThermistor(uint8_t pin, float fixedOhms, float offsetC) {
  ThermistorReading reading = {readAveragedAdc(pin), NAN, NAN, false};
  // Divider is AVCC -> fixed resistor -> ADC -> NTC -> GND.
  // ADC uses DEFAULT/AVCC reference, so Vcc cancels in R = Rfixed*n/(1023-n).
  // Reject near-rail readings BEFORE division/log: likely open/short/miswiring.
  if (reading.adc <= 1.0f || reading.adc >= 1022.0f) return reading;
  reading.resistanceOhms = fixedOhms * reading.adc / (1023.0f - reading.adc);
  const float inverseKelvin = 1.0f / (NTC_NOMINAL_C + 273.15f)
    + log(reading.resistanceOhms / NTC_NOMINAL_OHMS) / NTC_BETA_K;
  reading.temperatureC = 1.0f / inverseKelvin - 273.15f + offsetC;
  reading.valid = isfinite(reading.temperatureC) && reading.temperatureC >= -40 && reading.temperatureC <= 125;
  return reading;
}

bool calibrationValid() {
  if (!CALIBRATION_ENTERED || CALIBRATION_COUNT < 2) return false;
  for (uint8_t i = 0; i < CALIBRATION_COUNT; ++i) {
    if (!isfinite(CALIBRATION[i].signal) || CALIBRATION[i].signal <= 0 || !isfinite(CALIBRATION[i].speedMps) || CALIBRATION[i].speedMps < 0) return false;
    if (i) {
      if (CALIBRATION[i].speedMps <= CALIBRATION[i-1].speedMps) return false;
      if (CONSTANT_TEMPERATURE ? CALIBRATION[i].signal <= CALIBRATION[i-1].signal : CALIBRATION[i].signal >= CALIBRATION[i-1].signal) return false;
    }
  }
  return true;
}

float interpolateWind(float signal) {
  if (!calibrationValid() || !isfinite(signal)) return NAN;
  for (uint8_t i = 1; i < CALIBRATION_COUNT; ++i) {
    const CalibrationPoint a = CALIBRATION[i-1], b = CALIBRATION[i];
    if (signal >= min(a.signal, b.signal) && signal <= max(a.signal, b.signal)) {
      return a.speedMps + (signal-a.signal) * (b.speedMps-a.speedMps) / (b.signal-a.signal);
    }
  }
  return NAN; // Outside measured range: never extrapolate or silently clamp to zero.
}

void setHeaterDuty(float duty) {
  measured.duty = clampFloat(duty, 0.0f, 1.0f);
  if (HEATER_HAS_DRIVER) analogWrite(HEATER_PIN, uint8_t(measured.duty * 255.0f + 0.5f));
  // D9 drives ONLY the MOSFET gate through 220 ohms; load current comes from 5 V.
  const float currentOnA = HEATER_SUPPLY_V / (HEATER_OHMS + MOSFET_ON_OHMS);
  const float fullPowerW = HEATER_HAS_DRIVER ? currentOnA * currentOnA * HEATER_OHMS : HEATER_SUPPLY_V * HEATER_SUPPLY_V / HEATER_OHMS;
  // A directly wired heater still consumes power after a software fault.
  measured.powerW = (HEATER_HAS_DRIVER ? measured.duty : 1.0f) * fullPowerW;
}

void updateController(float dtSeconds) {
  const bool valid = measured.air.valid && measured.hot.valid;
  // Use unfiltered temperature for protection: filtering must not delay shutdown.
  if (!valid || measured.hot.temperatureC >= MAX_HOT_C
      || measured.hot.temperatureC - measured.air.temperatureC >= MAX_DELTA_C
      || (CONSTANT_TEMPERATURE && (!HEATER_HAS_DRIVER || measured.air.temperatureC + TARGET_DELTA_C >= MAX_HOT_C))) faultLatched = true;
  if (faultLatched) { integral = 0; setHeaterDuty(0); statusText = "FAULT: RESET REQUIRED"; return; }
  if (!CONSTANT_TEMPERATURE) { setHeaterDuty(1); return; }
  const float error = TARGET_DELTA_C - measured.deltaC;
  const float candidateIntegral = integral + KI * error * dtSeconds;
  const float candidateDuty = KP * error + candidateIntegral;
  // Conditional integration prevents wind-up when the heater reaches 0 or 100%.
  if ((candidateDuty > 0 && candidateDuty < 1) || (candidateDuty >= 1 && error < 0) || (candidateDuty <= 0 && error > 0)) integral = candidateIntegral;
  setHeaterDuty(KP * error + integral);
}

void updateMeasurements(uint32_t now, float dtSeconds) {
  measured.air = readThermistor(AIR_PIN, AIR_FIXED_OHMS, AIR_OFFSET_C);
  measured.hot = readThermistor(HOT_PIN, HOT_FIXED_OHMS, HOT_OFFSET_C);
  if (measured.air.valid && measured.hot.valid) {
    measured.airC = filtered ? measured.airC + FILTER_ALPHA * (measured.air.temperatureC-measured.airC) : measured.air.temperatureC;
    measured.hotC = filtered ? measured.hotC + FILTER_ALPHA * (measured.hot.temperatureC-measured.hotC) : measured.hot.temperatureC;
    filtered = true;
  } else { filtered = false; measured.airC = NAN; measured.hotC = NAN; }
  measured.deltaC = measured.hotC - measured.airC;
  updateController(dtSeconds);
  meanPowerW += 0.05f * (measured.powerW - meanPowerW); // ~2 s power smoothing at 10 Hz.
  measured.windMps = NAN;
  if (faultLatched) return;
  const bool atTarget = fabs(measured.deltaC-TARGET_DELTA_C) <= 1.0f && measured.duty < 0.98f;
  if (CONSTANT_TEMPERATURE && atTarget) { if (!settledSinceMs) settledSinceMs = now; }
  else settledSinceMs = 0;
  const bool settled = CONSTANT_TEMPERATURE ? settledSinceMs && uint32_t(now-settledSinceMs) >= 5000 : uint32_t(now-heaterStartedMs) >= WARMUP_MS;
  if (CONSTANT_TEMPERATURE && measured.duty >= 0.98f && measured.deltaC < TARGET_DELTA_C-1) statusText = "HEATER LIMIT";
  else if (!settled) statusText = "WARMING";
  else if (!calibrationValid()) statusText = "UNCALIBRATED";
  else {
    measured.windMps = interpolateWind(CONSTANT_TEMPERATURE ? meanPowerW : measured.deltaC);
    statusText = isfinite(measured.windMps) ? "CALIBRATED" : "OUT OF RANGE";
  }
}

bool oledCommand(uint8_t value) {
  Wire.beginTransmission(OLED_ADDRESS); Wire.write(uint8_t(0)); Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool initializeOled() {
  // Page addressing works on both controllers. SH1106 has 132 columns, the
  // visible 128 start at column 2; SSD1306 starts at 0. No full framebuffer needed.
  const uint8_t common[] = {0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0x7F, 0xD9, 0x22, 0xDB, 0x20, 0xA4, 0xA6};
  for (uint8_t i = 0; i < sizeof(common); ++i) if (!oledCommand(common[i])) return false;
  if (OLED_IS_SH1106) { if (!oledCommand(0xAD) || !oledCommand(0x8B)) return false; }
  else { if (!oledCommand(0x8D) || !oledCommand(0x14) || !oledCommand(0x20) || !oledCommand(0x02)) return false; }
  return oledCommand(0xAF);
}

void oledLine(uint8_t page, const char* text) {
  if (!oledOk) return;
  if (!oledCommand(0xB0 | page) || !oledCommand(OLED_IS_SH1106 ? 2 : 0) || !oledCommand(0x10)) { oledOk = false; return; }
  const size_t length = strlen(text);
  // Wire has a 32-byte TX buffer; send 16 data bytes plus one control byte.
  for (uint8_t start = 0; start < 128; start += 16) {
    Wire.beginTransmission(OLED_ADDRESS); Wire.write(uint8_t(0x40));
    for (uint8_t x = start; x < start+16; ++x) {
      const uint8_t index = x / 6, column = x % 6;
      char c = index < length ? text[index] : ' ';
      if (c >= 'a' && c <= 'z') c -= 32;
      const uint8_t bits = c >= 32 && c <= 90 ? pgm_read_byte(&WIND_FONT[c-32][column]) : 0;
      Wire.write(bits);
    }
    if (Wire.endTransmission() != 0) { oledOk = false; return; }
  }
}

void oledValue(uint8_t page, const char* label, float value, const char* unit) {
  char number[16], line[32];
  if (isfinite(value)) dtostrf(value, 0, 1, number); else strcpy(number, "--.-");
  snprintf(line, sizeof(line), "%s%s %s", label, number, unit);
  oledLine(page, line);
}

void displayMeasurements() {
  oledLine(0, "WIND SENSOR"); oledLine(1, "");
  oledValue(2, "Wind: ", measured.windMps, "m/s");
  oledValue(3, "Air: ", measured.airC, "C");
  oledValue(4, "Hot: ", measured.hotC, "C");
  oledValue(5, "Delta: ", measured.deltaC, "C");
  if (CONSTANT_TEMPERATURE) oledValue(6, "PWM: ", measured.duty*100, "%");
  else oledLine(6, "CONSTANT POWER");
  oledLine(7, statusText);
}

void printDiagnostics(uint32_t now) {
  Serial.print(now); Serial.print(','); Serial.print(measured.air.adc, 2); Serial.print(',');
  Serial.print(measured.hot.adc, 2); Serial.print(','); Serial.print(measured.air.resistanceOhms, 1); Serial.print(',');
  Serial.print(measured.hot.resistanceOhms, 1); Serial.print(','); Serial.print(measured.airC, 2); Serial.print(',');
  Serial.print(measured.hotC, 2); Serial.print(','); Serial.print(measured.deltaC, 2); Serial.print(',');
  Serial.print(measured.duty, 3); Serial.print(','); Serial.print(meanPowerW, 4); Serial.print(',');
  Serial.print(measured.windMps, 2); Serial.print(','); Serial.print(statusText);
  if (!oledOk) Serial.print(F(",OLED NOT RESPONDING"));
  if (!HEATER_HAS_DRIVER && faultLatched) Serial.print(F(",UNPLUG DIRECT HEATER"));
  Serial.println();
}

void setup() {
  digitalWrite(HEATER_PIN, LOW); pinMode(HEATER_PIN, OUTPUT); // OFF before init.
  analogReference(DEFAULT); Serial.begin(115200);
  Wire.begin(); Wire.setClock(100000); Wire.setWireTimeout(25000, true);
  delay(100); oledOk = initializeOled();
  measured.airC = measured.hotC = measured.deltaC = measured.windMps = NAN;
  heaterStartedMs = millis(); lastSampleMs = heaterStartedMs;
  Serial.println(F("ms,adcAir,adcHot,RairOhm,RhotOhm,airC,hotC,deltaC,duty,meanPowerW,windMps,status"));
  if (!HEATER_HAS_DRIVER) Serial.println(F("Direct heater: faults require manual power disconnection."));
}

void loop() {
  const uint32_t now = millis();
  const uint32_t elapsed = now-lastSampleMs; // Unsigned subtraction tolerates millis rollover.
  if (elapsed >= SAMPLE_MS) {
    lastSampleMs = now;
    updateMeasurements(now, min(elapsed, uint32_t(500))/1000.0f);
  }
  if (uint32_t(now-lastDisplayMs) >= DISPLAY_MS) {
    lastDisplayMs = now; displayMeasurements(); printDiagnostics(now);
  }
}
