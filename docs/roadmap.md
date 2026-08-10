# Roadmap

The roadmap prioritizes educational circuit design and evidence-based testing. PCB work remains an
optional follow-on and must not displace breadboard, simulation, measurement, or lesson quality.

## Shipped foundations

- Real-scale 3D breadboard construction, snapping, occupancy, wiring, and physical topology.
- Deterministic DC, nonlinear, and transient circuit extraction/solving with structured failures.
- Multimeter, signal generator, oscilloscope, frequency counter, and logic analyser on shared solver
  results and one simulation clock.
- Introductory circuits, RC timing, nonlinear semiconductors, NE555, reusable packages, sensors,
  displays, shift-register, and microcontroller foundations with explicitly documented limitations.
- Versioned local SQLite persistence with migration validation and optimistic revision protection.
- A secondary experimental PCB exercise with conversion, routing, DRC, and limited exports.

## Next: deepen learning and testing

1. Add lesson-oriented experiments with learning goals, predicted behavior, guided measurement points,
   tolerances, and explanations that connect observations to circuit theory.
2. Complete and validate shared scheduling for the sensor → ADC → firmware → shift-register → display
   chain before presenting the digital thermometer as a live end-to-end demonstration.
3. Add reference circuits and measurement exercises for the standard diode, transistor,
   potentiometer, sensor, and display parts already present in the catalogue.
4. Add NE555 monostable and comparison experiments, then evaluate optional faster behavioural and
   more detailed transistor-network models without weakening the generic solver boundary.
5. Improve accessibility and browser smoke coverage at desktop and narrow widths, especially for
   instrument attachment, result interpretation, and error recovery.

## Later

- Op-amps, additional digital logic and IC packages, inductive components, firmware lessons,
  component tolerances/faults, protocol decoding, and hardware-in-the-loop where each feature has an
  honest simulation and measurement boundary.
- More advanced numerical models only when reference tests and learner-facing explanations justify
  their complexity.
- Further PCB placement/routing and export validation after the core learning workflow is strong;
  fabrication output remains unavailable until independently validated.
