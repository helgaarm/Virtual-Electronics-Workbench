# Standard component pack and mixed-signal foundation

## Reused prior work

The repository already contains Newton iteration, nonlinear Shockley diode and Ebers–Moll BJT stamps, transient solving, reusable subcircuits, and the DIP-8/NE555 implementation. The standard pack extends these boundaries rather than introducing competing solvers or primitive models.

## Package family

`dipPackages.ts` defines DIP-8, DIP-14, and DIP-16 with 2.54 mm pitch and 7.62 mm row spacing. `dipPinPositionsMm` numbers pins clockwise when viewed from above. `to92Package.ts` defines an anonymous three-lead inline TO-92 envelope; device definitions, not the package, assign C/B/E or sensor functions.

## Device sources and nominal model values

| Device | Selected reference | Package/pin order | Values used | Primary source |
| --- | --- | --- | --- | --- |
| 1N4148 | Nexperia 1N4148 | DO-35, A/K | existing Shockley model | <https://assets.nexperia.com/documents/data-sheet/1N4148_1N4448.pdf> |
| BC547 / BC557 | onsemi BC547B / BC557B | TO-92, C-B-E | existing NPN/PNP Ebers–Moll model | <https://www.onsemi.com/pdf/datasheet/bc550-d.pdf>, <https://www.onsemi.com/pdf/datasheet/bc556b-d.pdf> |
| 2N3904 / 2N3906 | onsemi devices | TO-92, E-B-C | existing NPN/PNP Ebers–Moll model | <https://www.onsemi.com/pdf/datasheet/2n3903-d.pdf>, <https://www.onsemi.com/pdf/datasheet/2n3906-d.pdf> |
| TMP36 | Analog Devices TMP36GT9Z | TO-92, +VS/VOUT/GND | 500 mV offset, 10 mV/°C, −40…125 °C, 2.7…5.5 V | <https://www.analog.com/media/en/technical-documentation/data-sheets/TMP35_36_37.pdf> |
| SN74HC595N | Texas Instruments | DIP-16 datasheet pinout | 0.3/0.7 VCC thresholds; finite 50 Ω educational output | <https://www.ti.com/lit/ds/symlink/sn74hc595.pdf> |
| ATtiny85-20PU | Microchip | DIP-8 datasheet pinout | 10-bit VCC-referenced ADC | <https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf> |

The URLs are references only; no datasheets, photos, or third-party 3D assets are redistributed.

## Mixed signal and timing

Digital input classification is relative to the simulated ground and supply. The indeterminate band is preserved. Output descriptions carry a target voltage and finite resistance, while disabled outputs are high impedance; opposing active levels are explicitly detectable as contention.

The 74HC595 model shifts on rising SRCLK, transfers on rising RCLK, clears the shift register with active-low SRCLR, exposes QH-prime for cascading, and tri-states parallel outputs with active-high OE. Propagation delay is currently collapsed into deterministic simulation events.

The ATtiny85 adapter loads checksum-validated Intel HEX and executes a deliberately small genuine AVR opcode subset. Its GPIO bridge reports finite electrical drive intent and its ADC helper quantises actual pin voltage against a reference. CPU cycles are advanced by an explicit budget, never animation frames.

Seven-segment visual persistence is an exponential 40 ms integration of instantaneous segment current. It is renderer-only derived state; with no current it decays and is not persisted.

## Current milestone limitations

This changeset establishes and tests the reusable package, metadata, temperature transfer, potentiometer split, mixed-signal, shift-register, display-persistence, Intel HEX, AVR stepping, GPIO, and ADC foundations. Visible device renderers, persistence shapes, full electrical stamps for behavioural controlled sources, complete ATtiny85 peripheral emulation, compiled thermometer firmware, and the wired starter project remain dependent follow-on work. Consequently the complete sensor → ADC → firmware → cascaded registers → LED chain and browser manual acceptance sequence are **not yet claimed as validated**.

No runtime dependency or third-party asset was added; licensing remains MIT-only for new source.
