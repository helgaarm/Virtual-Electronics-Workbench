# Two-thermistor Arduino wind sensor

This kit measures cooling of a heated sensor relative to ambient air. It includes a constant-power
experiment and a constant-temperature controller. **Wind speed stays unknown until you enter measured
calibration points.** The temperature difference alone is not a universal wind-speed measurement.

In the workbench choose **Start projects → Wind Sensor · Constant Power** or
**Wind Sensor · Constant Temperature**, then **Load**. Select Nano1 to see readings, change
conversion settings, enter calibration, and copy or download the complete Arduino sketch. Both
starters include the MOSFET driver so a sensor fault can turn the heater off. Change **Environment →
Wind** to investigate cooling; the model is an illustrative experiment, not a calibration for real hardware.

## Parts and corrected circuit

| Quantity | Part | Notes |
| --- | --- | --- |
| 1 | Classic 5 V Arduino Uno or Nano, ATmega328P | A0/A1 ADC, A4 SDA, A5 SCL, D9 PWM |
| 2 | Identical 10 kΩ NTC thermistors | Nominal at 25°C, preferably specified Beta ≈3950 K; use the actual datasheet value |
| 2 | 10 kΩ, 1% fixed resistors | Measure each; 0.1% helps matching |
| 1 | 150 Ω heater resistor, rated at least 0.5 W | Flame-retardant part, mounted clear of plastic; check temperature derating |
| 1 | 1.3-inch, 128×64 I²C OLED | SH1106 default, SSD1306 selectable; use a module explicitly compatible with 5 V supply **and logic** |
| 1 each | 2N7000, 220 Ω, 100 kΩ | Heater MOSFET, gate resistor, gate-to-source pull-down |
| As needed | Breadboard, wires, regulated 5 V supply | Keep heater current out of sensor ground paths |
| Recommended | 100 nF ceramic and 10–47 µF bulk capacitor | Across the OLED/supply rail near the module; observe electrolytic polarity |

Your divider orientation is correct: fixed resistor on top, NTC on bottom. As temperature increases,
NTC resistance and ADC reading decrease. Use the Arduino's DEFAULT/AVCC ADC reference and power both
dividers from that same 5 V rail. This makes resistance conversion ratiometric. Do not use the 1.1 V
reference with these dividers.

The OLED voltage depends on the **module**, not just the controller name. The
[LCDWIKI MC130GX/MC130VX manual](https://www.lcdwiki.com/res/MC130GX_VX/1.3inch_IIC_OLED_Module_MC130GX%26MC130VX_User_Manual_EN.pdf)
specifies 3–5 V supply/logic compatibility. A bare controller or other 3.3 V-only module requires
regulated 3.3 V power and a suitable bidirectional I²C level shifter, with pull-ups on each voltage
side. A 3.3 V regulator alone does not protect the I²C pins. Inspect the module's printed pin labels:
GND-first and VCC-first boards both exist. Use 7-bit address 0x3C or 0x3D, not the shifted 0x78/0x7A.

## Wiring diagrams

Basic constant-power experiment, with manually connected heater:

```text
                  ARDUINO UNO / CLASSIC NANO
                       5V (AVCC)       GND
                        |               |
            +-----------+---------+     +-----------------------------+
            |                     |                                   |
        R-AIR 10k             R-HOT 10k                                |
            |                     |                                   |
 A0 --------o          A1 --------o                                   |
            |                     |                                   |
       NTC-AIR 10k           NTC-HOT 10k <--- thermal coupling only     |
            |                     |                 :                 |
            +---------------------+-----------------:-----------------+
                                                    :
  regulated +5V -------- RH1 150 ohm / >=0.5W ----------- GND
                          (near NTC-HOT)

  Arduino A4 (SDA) -------------------------------- OLED SDA
  Arduino A5 (SCL) -------------------------------- OLED SCL
  Arduino 5V -------------------------------------- OLED VCC (*)
  Arduino GND ------------------------------------- OLED GND
  (*) only for a module verified as 5V supply AND logic compatible
```

Recommended driver, used in **both workbench starters**. Keep both dividers and OLED connections
above, and replace the heater branch with this circuit:

```text
                 +5V heater supply
                         |
                   RH1 150 ohm / >=0.5W
                         |       : electrically insulated
                         |       : thermal link to NTC-HOT
                         D
 Arduino D9 --- 220R --- G   Q1 2N7000
                         S
                  |      |
     gate node ---100k---+--------- GND (Arduino and heater supply)
```

The 100 kΩ resistor connects **gate to source**. The heater connects to **drain**, source to ground.
Verify the pinout of the exact purchased transistor; do not infer it from package appearance.
The heater is resistive, so it does not need a flyback diode. D9 supplies gate charging current only.
The 220 Ω resistor limits switching current and the pull-down keeps the heater off during reset.

For a separate heater supply, join its negative terminal to Arduino GND and connect its positive
terminal only to the heater branch. Do not tie two independently powered 5 V positive rails together
or back-feed USB. Keep the divider/OLED on the Arduino's intended power rail. Never apply 5 V to VIN
expecting a regulated 5 V output, or apply 9 V to the 5 V pin.

## Current and power budget

At exactly 5.00 V, before MOSFET/cable losses:

| Load | Calculation | Result |
| --- | --- | --- |
| 150 Ω heater current | I = V/R = 5/150 | 33.3 mA |
| Heater dissipation | P = V²/R = 25/150 | 0.1667 W |
| Each 25°C divider | I = 5/(10000+10000) | 0.250 mA |
| Each fixed resistor at 25°C | I²R | 0.625 mW |
| Each NTC at 25°C | I²R | 0.625 mW |
| Two complete dividers | 2 × V × I | 2.50 mW, 0.500 mA |

The NTC's maximum divider dissipation occurs when its resistance equals the fixed resistor:
Pmax = V²/(4Rfixed) = 0.625 mW. The fixed resistor approaches 2.5 mW if the NTC is shorted; ordinary
0.125 W or 0.25 W parts have ample margin. Small NTC self-heating still creates temperature bias.
For example, a specified dissipation factor of 7 mW/K suggests about 0.09°C rise at 0.625 mW;
that factor depends on mounting and airflow, and is not universal.

A 0.5 W heater operates at about 33% of its nominal rating. Even allowing +5% supply and −5%
resistance gives 5.25²/142.5 = 0.193 W. This margin does not predict surface temperature or override
the manufacturer's ambient-temperature derating and mounting requirements.

The [onsemi 2N7000 datasheet](https://www.onsemi.com/pdf/datasheet/nds7002a-d.pdf) specifies up to
5.3 Ω on-resistance at VGS=4.5 V, ID=75 mA. Using that conservatively here gives I≈32.2 mA,
heater power≈0.1555 W and MOSFET loss≈5.5 mW. Check the actual part and gate supply. The transistor's
threshold voltage alone is not a sufficient gate-drive specification.

As a planning example, reserve 50 mA for the board and 20–40 mA for the OLED: total draw is then
roughly **104–124 mA**, including heater/dividers. Those board/OLED numbers are allowances, not
guaranteed specifications; display current varies with pixels/contrast and module design. A sound,
regulated 5 V USB supply rated at least 500 mA normally has ample current for this kit without other
loads. Check the actual board, cable voltage drop and total current. The
[Uno's resettable USB protection](https://store.arduino.cc/products/arduino-uno-rev3) is not a promise
of 500 mA available at every pin, and Nano clones have different power paths/protection. Avoid
dissipating heater power through a board regulator fed from a high VIN voltage.

**Never power this 33 mA heater from a GPIO.** The Uno specification recommends 20 mA per GPIO;
absolute maximum ratings are not operating targets. Measure heater voltage: a Nano USB diode and
cable losses can make it appreciably lower than 5 V, and heater power depends on voltage squared.

## Complete Arduino program

Open [examples/WindSensor/WindSensor.ino](../examples/WindSensor/WindSensor.ino) in Arduino IDE and
select the classic Uno or Nano. Only the Arduino AVR core and its included `Wire` library are needed;
the tested core is 1.8.6. The sketch includes an original compact OLED driver/font, avoiding a 1 KB
framebuffer on the ATmega328P's 2 KB RAM. SH1106 page writes start at column 2; SSD1306 starts at 0.

Set these constants at the top:

- `CONSTANT_TEMPERATURE=false` for the basic experiment, `true` for the improved controller.
- `HEATER_HAS_DRIVER=true` for the recommended circuit. For the manually connected heater set it
  false: software cannot stop that heater on a fault; unplug it yourself. CTA requires the driver.
- `OLED_IS_SH1106`, `OLED_ADDRESS`, both fixed resistances, NTC nominal resistance/temperature/Beta.
- `HEATER_SUPPLY_V` to the measured supply under load, `HEATER_OHMS` and `MOSFET_ON_OHMS` for the
  power estimate. The most accurate power measurement uses voltage across the heater and current.
- `AIR_OFFSET_C` and `HOT_OFFSET_C` after matching the sensors with the heater off.

Upload with the heater disconnected. Check both room-temperature readings, then connect the heater.
Open Serial Monitor at **115200 baud**. CSV diagnostics include averaged ADC readings, resistances,
both temperatures, deltaT, duty, estimated mean power, wind estimate, and status. OLED failures are
also reported. Correct the wiring and reset after a display initialization failure.

Resistance and Beta conversion, with n the averaged 10-bit ADC code:

```text
Rntc = Rfixed × n / (1023 − n)
1/Tkelvin = 1/(TnominalC + 273.15) + ln(Rntc/Rnominal)/Beta
temperatureC = Tkelvin − 273.15
deltaT = hotC − airC
```

The program discards a sample after switching ADC channels, averages 16 samples per sensor every
100 ms, then applies an exponential filter with alpha=0.2. Display/Serial updates occur every
500 ms. Near-rail ADC codes and out-of-range temperatures are rejected before division/logarithms.
Raw, unfiltered temperatures trigger the heater shutdown; filtering does not delay protection.
All logic is split into reading, conversion, control, calibration, display, and diagnostic functions.

Initial screen layout (temperatures below are illustrative, not calibration values):

```text
WIND SENSOR

WIND: --.- M/S
AIR: 20.4 C
HOT: 34.1 C
DELTA: 13.7 C
CONSTANT POWER
UNCALIBRATED
```

The 30-second constant-power warm-up is only a minimum display gate. Wait longer for an actual
stable plateau before taking calibration measurements, and increase `WARMUP_MS` for slower assemblies.

## Calibration without invented wind speeds

1. With the heater off, put both NTCs together in uniform air away from electronics. Compare with
   a trusted thermometer, enter the measured fixed resistor values, and remove relative temperature
   offset. A second known temperature helps identify Beta error; a three-point Steinhart–Hart fit
   can improve accuracy over a wide range. Do not immerse unsealed sensors or boards.
2. Build a rigid sensor head with reproducible heater-to-NTC spacing and orientation. Keep exposed
   electrical leads insulated from each other. Use an attachment method and temperature-rated
   insulation compatible with the actual thermistor; some coated NTCs are not rated for potting.
   Keep the ambient bead upstream/outside the heater plume, away from the Arduino/OLED and sun.
3. Use a fan feeding a sufficiently long duct/plenum, with a screen or honeycomb to reduce swirl.
   Compare against a known anemometer at the sensor's location; side-by-side probes must not shadow
   each other. Check for spatial variation, or alternate probes at the same position. Fan RPM or a
   desk fan's speed setting is **not** a known air speed. Q/area only gives a useful speed when flow
   rate and the velocity profile are independently established.
4. Measure still air, then known speeds such as 1, 2, 4 and 6 m/s, within the reference instrument's
   useful range. Keep the complete sensor's orientation fixed. At each speed wait for a stable
   temperature/power plateau (several thermal time constants), log 30–60 seconds, and record mean,
   scatter, air temperature and supply voltage. Repeat increasing and decreasing airflow.
5. For constant power, enter each measured **deltaT in °C**. It must decrease as speed increases.
   For CTA, enter **mean heater power in watts** after the temperature target settles. It must
   increase with speed. If the sequence is not monotonic, investigate noise, mounting or saturation;
   do not force unreliable points into the table.

The sketch starts with `CALIBRATION_ENTERED=false` and deliberately unknown `NAN` values:

```cpp
const CalibrationPoint CALIBRATION[] = {
  {0.0f, NAN}, {1.0f, NAN}, {2.0f, NAN}, {4.0f, NAN}, {6.0f, NAN}
};
```

Replace each `NAN` with the measured signal, then set `CALIBRATION_ENTERED=true`. Between two
bracketing measurements the code computes:

```text
speed = speedA + (signal − signalA) × (speedB − speedA)/(signalB − signalA)
```

Invalid tables, unknown signals and values beyond the measured range produce `--.-`, not a false
zero or extrapolated result. In the workbench, the Nano's calibration editor accepts 2–20 rows of
`speed, signal`; applied settings and points are included in Copy/Download Arduino sketch. Use a
fresh table when changing controller mode. Simulated points must not be reused for physical hardware.

## Improved version: constant-temperature anemometry

Use the MOSFET circuit and set `CONSTANT_TEMPERATURE=true`. A PI loop controls D9 PWM to maintain
`hotC = airC + TARGET_DELTA_C`, initially +20°C. More wind requires more heater power. The sketch
uses anti-windup, output clamping and a configurable target; KP=0.025 duty/°C and KI=0.005
duty/(°C·s) are starting values for tuning, not universal control gains. Reduce gains if temperature
oscillates; establish stable proportional control before increasing integral action.

The driver defaults off at startup. Sensor faults, hot temperature ≥65°C, deltaT ≥35°C, or an
unreachable absolute safety target latch it off until reset. Check the fault before restarting.
A detached sensor can still report a plausible temperature: software protection is not independent
hardware protection. Use a suitable thermal cutoff/current-limited supply for a higher-power design.

The 150 Ω heater may be unable to maintain +20°C in significant wind or a poorly coupled assembly.
The program reports **HEATER LIMIT** and withholds wind speed while saturated. It accepts CTA
calibration only after staying within ±1°C of target for five seconds below 98% duty. This gate does
not replace waiting for a stable power plateau during calibration.

For additional headroom, an example is **68 Ω, ≥1 W** at 5 V: approximately 73.5 mA and 0.368 W
at full duty before losses. Recheck temperatures, supply budget and calibration. A low-resistance
logic-level device such as [AO3400A](https://www.aosmd.com/res/data_sheets/AO3400A.pdf), specified at
4.5 V gate drive, on a correctly wired breakout is preferable for larger heaters; it is a SOT-23
part, not a direct breadboard replacement. Keep the gate resistor/pull-down and verify pinout.
The starter retains the existing 2N7000 because it is adequate for the initial small load.

Average resistive heater power under PWM is **duty × Von²/R**, where Von is measured across the
heater during an ON pulse. Squaring the averaged PWM voltage gives the wrong answer. The program
estimates this from supply, heater resistance and MOSFET resistance, then filters over about two
seconds. For accuracy measure voltage/current or use a calibrated current-sense circuit; account for
resistor temperature coefficient, MOSFET loss and lead resistance. Fit an empirical curve such as
P=A+B·vⁿ only from measured data if desired; the supplied piecewise interpolation needs no assumed n.

## Improving accuracy

- Match sensors from the same batch; use their actual resistance/Beta tolerances. A 10 kΩ label
  does not imply Beta=3950 K. The Vishay package reference below specifies about 3977 K for its 10 kΩ
  option; configure it accordingly if purchasing that part.
- Use measured 0.1% divider resistors and stable, ratiometric ADC wiring. Optional 10–100 nF from
  each ADC node to ground can reduce pickup; allow settling after switching channels. Keep heater
  return current separate from the sensor return until the supply ground connection.
- Minimize heat conducted through supports/leads and keep the thermal geometry repeatable. Avoid
  heating the ambient sensor, direct sunlight, rain/condensation and unintended radiant heating.
- Calibrate over the intended air-temperature range. Subtracting ambient temperature does not
  remove changes in air density, viscosity, humidity, pressure or radiative loss. Record orientation;
  this sensor does not measure wind direction and may respond differently when rotated.
- Quantify repeatability and reference-anemometer uncertainty. Filtering reduces random noise but
  cannot remove calibration bias. Report only the range and precision supported by measurements.

## Workbench model and limits

New palette parts are **NTC thermistor**, **Heater resistor**, and **I²C OLED**. Heater coupling is
an explicit heater component ID on the heated NTC; proximity in the renderer alone does not establish
thermal coupling. All electrical current/power still comes from actual breadboard connections.

The lumped thermal equation is C·dT/dt = 0.85·Pheater + Pntc − G(v)·(T−Tair).
The illustrative heated assembly uses C=0.08 J/K, G(v)=0.006+0.004√v W/K; the ambient bead uses
C=0.105 J/K, G(v)=0.007+0.004√v W/K and no heater term. Coefficients and 85% coupling are educational
assumptions, not measured component data. Integration uses exact exponential relaxation with held
power between electrical steps. Changing airflow affects temperature, then resistance, then solved
ADC voltage; the Nano never reads the environment's true wind speed to manufacture an answer.

Built-in wind programs sample every 100 ms and use a 50 Hz behavioral PWM model for efficiency.
The downloadable sketch uses normal Arduino D9 PWM (about 490 Hz on the default classic AVR core).
Built-ins quantize/filter solved ADC voltages; the compiled sketch additionally performs the actual
16-sample averaging and runs AVR instructions. The model includes NTC divider self-heating and
heater overload warnings; it does not model detailed conduction, geometry-dependent convection,
thermal damage, regulatory safety or measurement uncertainty.

The 2N7000 uses an approximate smooth 2.1 V switching threshold and 5 Ω ON resistance, not a
temperature-dependent transistor model. The OLED module has an approximate 250 Ω supply load and
4.7 kΩ pull-ups. Supported I²C master writes update SH1106/SSD1306 display RAM, page addressing,
SSD1306 horizontal/vertical addressing, enable and inversion. Wrong address, missing power, swapped
or disconnected SDA/SCL cannot update the display. Multi-master arbitration, clock stretching,
slave reads, bit-level bus waveforms, scroll/remap/COM scan effects and pixel-dependent current are
not modeled. This is not a general emulation of every OLED library or I²C peripheral.

The NTC body reference is 3.8×6×3 mm with 0.6 mm leads and 2.54 mm pitch; the heater is 6.5×2.5×2.5 mm
with ≥10 mm bent-lead spacing. OLED outline is 35.4×33.5 mm, 4 header pins on 2.54 mm pitch.
OLED 1.6 mm PCB thickness, 2.5 mm header spacer (PCB center 3.3 mm above the breadboard),
2.5 mm pin insertion, header-to-edge offset and two insulating support feet are procedural mounting
assumptions. The feet rest on the breadboard where the module footprint is over its surface; they
do not create electrical connections. Header pins connect the four assigned holes through the PCB.
Geometry, font, firmware and controller adapter are original; vendor artwork/firmware are not copied.

Project schema **15** adds these parts and optional Nano wind settings/calibration. Earlier schemas
migrate forward without SQLite DDL changes or overwriting stored projects. Runtime temperature,
controller integral, OLED RAM and pending AVR TWI transactions use cloneable simulation snapshots,
not persistent project data. See [persistence and recovery](persistence-and-recovery.md).

## Sources and validation

All sources below were accessed 2026-09-16. Only factual dimensions, pin assignments and interface
behavior were used; illustrative thermal coefficients are explicitly separate from datasheet facts.

| Source | Revision / facts used |
| --- | --- |
| [Vishay NTCLE100E3](https://www.vishay.com/docs/29049/ntcle100.pdf) | 2025-05-07; bead outline, lead dimensions, dissipation-factor example, Beta/tolerance and potting cautions |
| [Vishay MRS16/MRS25](https://www.vishay.com/docs/28724/mrs16m25.pdf) | 2016-03-07; MRS25 outline and 10 mm lead spacing; actual rated part is 0.6 W at 70°C, modeled kit rating conservatively 0.5 W |
| [LCDWIKI MC130GX/MC130VX manual](https://www.lcdwiki.com/res/MC130GX_VX/1.3inch_IIC_OLED_Module_MC130GX%26MC130VX_User_Manual_EN.pdf) | Rev. 1.0, CR2019-MI4601; 1.3-inch SH1106 module outline, supply/logic range, address/header variants |
| [Solomon Systech SSD1306 datasheet](https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf) | Rev. 1.1, April 2008; I²C control bytes, page/column addressing, display commands |
| [onsemi 2N7000 family](https://www.onsemi.com/pdf/datasheet/nds7002a-d.pdf) | Gate-drive/on-resistance specification, TO-92 pinout; verify purchased variant |
| [Arduino Uno](https://store.arduino.cc/products/arduino-uno-rev3), [Nano manual](https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf) | Classic board pin functions, supply and GPIO considerations; Nano manual Rev. 4, 2025-06-12 |
| [AOS AO3400A](https://www.aosmd.com/res/data_sheets/AO3400A.pdf) | Optional lower-loss logic-level driver specifications |

Automated tests cover conversion/calibration bounds, physical placement, connectivity, thermal
cooling, regulation/saturation, fault shutdown, OLED controller state, snapshot continuation and
schema/SQLite round trips. Both sketch modes were compiled with Arduino AVR core 1.8.6 / AVR GCC
7.3 and executed in the Nano simulator to check startup, ADC, serial and OLED writes. That external
toolchain check is separate from `npm test`; Arduino core binaries are not distributed here.
