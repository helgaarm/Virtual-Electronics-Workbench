# Classic Arduino Nano

Choose **Start projects → Arduino Nano Blink**, **Arduino Nano Button**, or **Arduino Nano Analog Input**, then **Load**. The Nano also appears in **Components → Integrated circuits**. Select it to choose an example, load your own compiled sketch, see pin connections, or read serial output.

## Run your own sketch

1. Open your sketch in Arduino IDE and select **Arduino Nano**, processor **ATmega328P**. Install any libraries your sketch needs there.
2. Choose **Sketch → Export Compiled Binary**. Find the exported `.hex` file in your sketch folder/build subfolder; use the file without `with_bootloader` in its name.
3. Select the Nano in the workbench and use **Load compiled sketch (.hex)**. A valid file selects **Custom firmware** and resets that Nano's execution.
4. Wire the breadboard to the pins used by your sketch, switch power on, and run the simulation. Use a simulation step of **5 ms or smaller** for one Nano; smaller steps may be needed for multiple Nanos or programs that read inputs very frequently.
5. Expand **Serial output** for `Serial.print`/`Serial.println` output. The display retains the latest 4,096 characters.

Arduino CLI users can run `arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328 --export-binaries path/to/Sketch`. See Arduino's [export specification](https://docs.arduino.cc/arduino-cli/platform-specification/#recipes-to-export-compiled-binary) and [compile reference](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile).

Compilation happens in your Arduino tools. The workbench imports the binary and executes AVR instructions in its simulation worker; it has no C++ compiler or source editor. Libraries work to the extent that their required peripherals and external circuit components are modeled. This target is the **classic 16 MHz ATmega328P Nano**, not the Nano Every, Nano 33, Nano ESP32 or other processor families.

Firmware is included when saving the project. Switching to a built-in example preserves the imported file, so you can switch back to **Custom firmware**. Invalid uploads report an error and preserve the previous program.

## Firmware support and limits

| Feature | Behavior |
| --- | --- |
| GPIO | D0–D13 and A0–A5 digital input/output and pull-ups connect to solved breadboard voltages/currents. |
| Timers and PWM | AVR timers 0, 1 and 2, compare/overflow interrupts and their PWM outputs; normal Arduino `millis()`, `micros()`, `delay()` and `analogWrite()` use these peripherals. |
| ADC | Single conversions on A0–A7, 10-bit quantization, AVCC/AREF/internal references. ADC auto-trigger, temperature and differential modes are unsupported. |
| Interrupts | Timer, ADC and sampled GPIO interrupts. Inputs are sampled every 50 µs and when firmware reads a PIN register; faster external pulses can be missed. |
| Serial | Transmitted bytes appear in the Nano inspector. UART pin waveforms and serial input are not modeled. |
| EEPROM | 1 KB, retained across Nano reset and power changes during the current runtime. Loading a project, resetting the simulation or changing firmware clears it. EEPROM is not persisted to SQLite. |
| I²C/TWI | Single-master writes to powered, connected SH1106/SSD1306 OLED models; address/data ACK/NACK and cloneable pending transactions. Slave reads, arbitration, clock stretching and bit-level SDA/SCL waveforms are not modeled. |
| Unsupported hardware | Enabling SPI, watchdog, self-programming flash or clock prescaling, or executing SLEEP/BREAK, reports a structured simulation error. VIN regulation, bootloader/fuses, timer input capture and overload/thermal protection are not modeled. |

Execution and electrical settling have separate work limits so imported firmware cannot monopolize a worker indefinitely. A budget error asks for a smaller timestep. Simulation time can advance more slowly than wall time; pause, step and continuation all use the shared simulation clock. Do not use the model to validate electrical limits or power designs.

## Physical model

The module uses 30 breadboard holes in two rows: 15 pins per row at 2.54 mm pitch, with 15.24 mm between the headers. Its 45 × 18 mm PCB remains full size. The default placement uses rows D and H so free holes remain available on each connected strip. Unanchor the module to move it or rotate it 180 degrees; individual pins cannot be moved independently. A board needs enough vacant space for the complete module.

A visible USB plug and cable connect the Nano to a labelled **USB 5 V DC** supply beside the
breadboard. The camera includes that supply in its framing. Its indicator and the Nano's green
**PWR** light follow the workbench Output switch; the separate sketch-controlled LED still follows
solved current. The inspector also identifies USB as the power source. The cable stays plugged in
when output is off and follows the Nano when moved or rotated. These procedural accessories
illustrate the existing ideal USB supply; they add no terminals or saved project fields.

## Included programs

These programs are inexpensive behavioral models and do not require compilation. Their equivalent Arduino sketches can be copied from the inspector.

| Program | Input | Output |
| --- | --- | --- |
| Blink | Shared simulation clock | D13 high for 1 s, low for 1 s |
| Button → LED | D2 with internal pull-up; switch to GND | D13 high while D2 is low |
| Analog input → LED | A0, potentiometer between 5V and GND | D13 high at ADC codes 512–1023 |
| Wind: constant power | A0/A1 NTC dividers | D9 heater driver, A4/A5 OLED, measured deltaT calibration |
| Wind: constant temperature | A0/A1 NTC dividers | D9 PI-controlled heater, A4/A5 OLED, measured power calibration |

See the [wind-sensor build guide](wind-sensor.md) for complete circuits, calibration and Arduino source.
Wind examples sample every 100 ms, use 50 Hz behavioral PWM and shut down on sensor/temperature faults.
The equivalent compiled sketch uses normal Arduino PWM and performs ADC averaging.

The output drives the actual electrical network through 50 Ω. Both the onboard indicator (a 1 kΩ resistor and LED) and any breadboard LED obtain brightness from solved current. Inputs are read from solved voltages relative to Nano GND. The ADC clamps and quantizes to 10 bits using the 5V supply as reference. The Button and Analog Input examples sample every 1 ms. The button input uses a 30 kΩ pull-up; unused pins have 100 MΩ leakage to ground for a deterministic disconnected state. Reset has a 10 kΩ pull-up; grounding either RESET header stops the program and leaves D13 high impedance.

USB power follows the workbench power switch, supplying ideal 5 V and 3.3 V. Both GND headers share a node, as do both RESET headers, in simulation, schematic generation and PCB connectivity. The USB ground becomes the reference when no explicit ground marker exists. Switching programs or restoring power starts the selected example again. Example timing and snapshots use the shared simulation clock, including pause, step and worker transfers; no browser animation drives circuit behavior.

## Scope and assumptions

The included programs use behavioral models; custom firmware uses AVR8js instruction and peripheral emulation. USB supplies and external power selection remain idealized. See the support table above for peripheral limitations.

GPIO drive resistance, leakage, input polling and nominal LED parameters are educational approximations. Digital low for built-in examples is at most 30% of supply; high reset is at least 60%. Execution is supply-qualified to 4.5–5.5 V. PCB thickness (1.6 mm), mounting clearance (4 mm), 0.64 mm square header pins and simplified USB/chip geometry are procedural rendering assumptions; they do not change terminal spacing or electrical connectivity. No manufacturer artwork, PCB files, meshes or firmware are redistributed. Procedural geometry and example source are original. Custom firmware requires an external compiler.

## Source record

| Source | Revision/date | Facts used |
| --- | --- | --- |
| [Arduino Nano A000005 user manual](https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf), Arduino | Rev. 4, 2025-06-12; accessed 2026-09-16 | Classic Nano identity, 16 MHz ATmega328, USB supply, mechanical outline/header spacing |
| [Nano full pinout](https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf), Arduino | 2021-06-30; accessed 2026-09-16 | Header order, duplicate GND/RESET pins, D13 onboard LED, A0–A7, 5V/3V3/VIN/AREF |
| [Classic Nano technical specifications](https://store.arduino.cc/products/arduino-nano), Arduino | Accessed 2026-09-16 | 18 × 45 mm PCB, 5 V operation, 10-bit ADC, 20–50 kΩ pull-up range |
| [AVR8js](https://github.com/wokwi/avr8js), Uri Shaked | Pinned 0.21.1, MIT | AVR CPU/peripheral implementation |

Only factual pin assignments and dimensions are transcribed. The pinout artwork is CC BY-SA 4.0 and is linked for reference, not redistributed or adapted. AVR8js's MIT notice is included in [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

## Persistence and checks

Project schema 13 introduced `arduino-nano`, the `NANO-30` package and example `programId`. Schema **14** adds optional validated firmware `{ name, hex }` and the `custom` program. Schema **15** adds NTC/heater/OLED components and optional wind settings/calibration. Schemas 1–14 migrate forward without SQLite table changes or automatic rewriting of saved projects. HEX validation checks record lengths, checksums, address bounds, overlapping data, a reset vector and EOF; malformed projects are rejected before storage. Firmware text is bounded to 192 KiB and flash to 32 KiB. Use the [recovery procedure](persistence-and-recovery.md) before upgrading older databases.

CPU RAM, registers, pending interrupts, timer phase, peripheral events, serial output and EEPROM are part of structured-cloneable runtime snapshots, not persisted projects. The snapshot adapter depends on AVR8js internals and pins its exact version; update it and its continuation tests together when upgrading the dependency.

Tests cover geometry, rigid pin mapping, collisions, migration, recovery copies, SQLite round trips and rejection without overwriting valid firmware, schematic connectivity, loaded output current, ADC response, button pull-up, strict HEX import, GPIO/ADC/serial instructions, PWM and timer interrupts, reset, power cycling, program changes and deterministic cloned snapshots. Input polling, peripheral events, electrical settlements and AVR execution each have explicit work bounds.

The original [reference sketch](../tests/fixtures/nano-reference.ino) was also compiled locally with the official Arduino AVR core 1.8.6 and AVR GCC 7.3.0 toolchain. Execution checks exercised Arduino startup, `digitalRead`/`digitalWrite`, `analogRead`/`analogWrite`, `millis`/`delay`, serial output, connected LED current and snapshot continuation. To repeat, export that sketch for the classic Nano and load it into the **Arduino Nano Analog Input** starter. A0 controls D6 PWM; D13 blinks in 10 ms intervals, or stays high while D2 is grounded. This integration check uses an external toolchain and is not part of `npm test`; compiled Arduino core binaries are not checked into the repository.
