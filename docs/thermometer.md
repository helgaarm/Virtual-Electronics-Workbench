# Digital Breadboard Thermometer

Select **Digital Breadboard Thermometer** in **Start projects**, then **Load**. The new starter
is fully wired and opens with power on. Change **Environment → Temperature** to change the TMP36
sensor voltage. Allow the simulation to scan the display; the status bar shows simulated time.
Existing saved layouts are preserved: load the starter again to obtain its completed wiring.

## Electrical path

1. TMP36: VS to 5 V, GND to ground, VOUT to ATtiny85 pin 2 (PB3/ADC3).
2. ATtiny85: VCC pin 8, ground pin 4, RESET pin 1 pulled up through 10 kΩ.
   PB0/pin 5 drives serial data, PB1/pin 6 drives shift clock, PB2/pin 7 drives latch clock,
   and PB4/pin 3 drives both output-enable pins to blank the display during transfers.
3. SR1 and SR2: supply pin 16, ground pin 8, SRCLR pin 10 high, OE pin 13 from PB4.
   Both share SRCLK pin 11 and RCLK pin 12. SR1 QH′ pin 9 connects to SR2 SER pin 14.
4. SR1 QA–QH connect through eight 330 Ω resistors to a–g and decimal point.
   SR2 QA–QD drive four NPN bases through 2.2 kΩ resistors; 100 kΩ base/emitter resistors
   hold unselected digits off. Collectors connect to the four common cathodes; emitters to ground.
5. Three 100 nF capacitors decouple the logic supply. Actual jumper endpoints establish every net.

The simulation reads voltages at physical chip pins. Removing clock, latch, cascade, power, or
reset connections stops the relevant part of the chain. Removing the sensor supply produces a
near-zero ADC input and a reading near −50 °C, rather than the environment temperature. This is an
uncalibrated ADC result, not a disconnected-sensor diagnosis.

## Firmware and measurements

The original firmware image is built by `src/simulation/microcontroller/thermometerFirmware.ts`.
It uses genuine AVR instructions to configure DDRB, sample ADC3, look up segment bytes in flash,
shift two bytes MSB first, latch them, and multiplex the four digits. It disables the outputs
between digit changes. Application conversion and glyph selection reside in the firmware image;
the runtime has no reference to project temperature or a displayed-number property.

The saved multimeter probe measures TMP36 VOUT relative to ground. Nominal sensor output is
0.5 V + 0.01 V/°C. At 59 °C, expect about 1.09 V and a display near 59.0. At 25 °C, the
educational ADC quantizes to code 153 and the display reads 24.8. The extra decimal digit does
not imply 0.1 °C accuracy. Changing the supply from 5 V changes the reading because the firmware
table assumes a regulated 5 V ADC reference.

## Model limits and timing

- The AVR interpreter implements the instruction subset used by this bundled firmware, with
  DDRB/PORTB, flash reads, and single-ended VCC-referenced ADC channels. Unsupported instructions,
  ADC modes, or firmware IDs return structured errors. This is not a general ATtiny85 emulator.
- ADC conversion is instantaneous; quantization uses the existing nearest-code 10-bit model.
  Interrupts, timers, oscillator error, ADC acquisition, and analogue noise are not modeled.
- GPIO and register outputs connect to the solved supply/ground through 50 Ω. Inputs have
  deterministic 100 MΩ leakage to local ground. Unknown logic inputs are not valid highs;
  propagation delay is collapsed into ordered events. Unpowered registers reset to zero, an
  educational simplification; real hardware requires explicit initialization.
- The TMP36 uses a supply-qualified analogue subcircuit: a nominal temperature source, 100 Ω
  output path, smooth 2.7–5.5 V supply gates, and a 100 kΩ supply load. Its temperature range is
  clamped to −40…125 °C. Boundary transitions are approximate, not a transistor-level model.
- One shared simulated clock advances instructions, register edges, capacitors, and measurements.
  The starter uses a 1 ms sample step with instruction-timed internal GPIO edges. Scope sampling
  at that interval cannot resolve individual serial clock pulses. Powered MCU steps over 10 ms
  or exceeding the instruction budget return an explicit error.
  Worker batches are bounded; this circuit may run slower than wall time. Pause freezes the
  entire simulation. Reset clears execution state and optical history.
- Visible segment brightness integrates solved junction current over 40 ms of simulated time.
  Electrical measurements remain instantaneous. No temperature-to-display shortcut is used.
- Isolated resistor-loaded pins are solved algebraically with the same ground leakage as MNA;
  their currents are restored to source loading and power readings. Loaded nonlinear nodes stay
  in the main solver. A settled, unchanged circuit is reused only when all capacitors are held
  across fixed ideal voltages and no time-varying source is present.

## References and validation

Pin mapping and implemented register addresses follow Microchip's
[ATtiny25/45/85 datasheet, revision 2586Q, August 2013](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf),
sections 17, 23, and 24. Shift/latch edge ordering and DIP pin numbering follow TI's
[SN74HC595 datasheet, revision J](https://www.ti.com/lit/ds/symlink/sn74hc595.pdf).
These documents supplied factual specifications; no manufacturer firmware, models, or assets
are redistributed. Firmware, wiring, and runtime additions are original MIT-licensed code.

Regression tests cover positive/negative temperatures, decoded segment currents, broken nets,
sensor/chip supply and reset disconnection, power cycling, topology, package clearance, and
project serialization. All execution and current-history state is volatile. The thermometer document
shape is unchanged; older saved projects remain compatible with the current schema.
