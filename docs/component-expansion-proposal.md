# Component expansion proposal

## Purpose and selection principles

The current catalogue is strong enough for introductory DC, timing, transistor, display, and small
mixed-signal exercises. The next components should broaden the *kinds of circuits learners can
build*, rather than add near-duplicates of parts already present. This proposal is also the delivery
tracker. Wave 1 is now available in the parts drawer; Waves 2 and 3 remain proposed and are not
represented as working components.

Candidates are ranked by:

1. **Learning reach** — how many new concepts and reference circuits the part unlocks.
2. **Reuse** — whether one new solver primitive or package supports several later devices.
3. **Model honesty** — whether a bounded educational model can produce measurements without hiding
   important behavior.
4. **Workbench fit** — through-hole availability, breadboard-friendly geometry, and useful interaction.
5. **Validation cost** — authoritative data, deterministic reference cases, and manageable failure
   modes.

Adding a catalogue entry or mesh alone does not count as support. Every accepted component must
follow the [component-authoring workflow](component-authoring.md), including source research,
physical dimensions, extraction, persistence, tests, and a measured example.

## Recommended sequence

### Wave 1 — high-value analogue and logic building blocks

**Implemented:** the four Wave 1 devices can be placed, saved, rendered, extracted, and simulated
with the deliberately bounded models described below.

| Priority | Component | What it unlocks | Smallest honest model | Key prerequisite or risk |
| --- | --- | --- | --- | --- |
| 1 | **LM358B dual operational amplifier, PDIP-8** | Comparators, buffers, threshold alarms, active sensor conditioning, and first feedback lessons | Two supply-aware behavioural amplifiers with finite gain/bandwidth, output resistance, input bias path, and bounded output swing | Add a reusable controlled-source/op-amp boundary; do not present an ideal VCVS as rail-to-rail hardware |
| 2 | **2N7000 N-channel MOSFET, TO-92** | Voltage-controlled switching, logic-level limitations, low-side loads, and BJT/MOSFET comparison | Smooth level-1-style channel current plus body diode; omit capacitances initially and say so | Introduces a reusable MOSFET stamp and requires convergence/reference tests across cutoff and conduction |
| 3 | **SN74HC00N quad NAND, PDIP-14** | Combinational logic, latches, propagation exercises, and construction of every basic Boolean gate | Four supply-relative NAND gates with finite-resistance outputs, explicit indeterminate inputs, and deterministic delay | Reuse the mixed-signal input/output rules already used by the 74HC595; define behavior for floating inputs |
| 4 | **1N4733A 5.1 V Zener diode, axial** | Shunt regulation, clipping, over-voltage protection, and load-regulation measurements | Existing forward junction behavior plus a smooth reverse-breakdown branch and series resistance | Reverse breakdown is a new nonlinear region; current and power warnings are essential |

Wave 1 gives the broadest increase in versatility: analogue feedback, a second transistor family,
general-purpose logic, and voltage regulation. The LM358B should land first because it enables useful
sensor experiments with the existing TMP36 and potentiometer. The exact order may change if solver
prototyping shows that the MOSFET stamp is substantially lower risk.

### Wave 2 — time, sensing, and output

| Priority | Component | What it unlocks | Smallest honest model | Key prerequisite or risk |
| --- | --- | --- | --- | --- |
| 5 | **CD4017BE decade counter, PDIP-16** | LED chasers, divide-by-ten, decoded sequencing, and NE555-plus-counter projects | Supply-relative clock/reset/enable behavior with one-hot finite-drive outputs and deterministic propagation delay | Needs the shared digital scheduler to be complete; never update it from animation frames |
| 6 | **74HC14 hex Schmitt-trigger inverter, PDIP-14** | Switch debouncing, relaxation oscillators, signal cleanup, and hysteresis lessons | Six gates with separate rising/falling thresholds, supply-relative classification, finite drive, and delay | Event handling must remain deterministic when an RC waveform crosses a threshold |
| 7 | **Photoresistor in a radial package** | Light alarms, dividers, calibration, and sensor-to-comparator projects | User-controlled illuminance mapped to resistance by a documented, bounded device curve | Select a specific purchasable device before implementation; do not label a generic curve with a vendor part number |
| 8 | **Passive piezo sounder** | Audible indicators, tone generation, resonance, and frequency measurement | Bounded electrical equivalent circuit; optional UI loudness/pitch must derive from simulated terminal results | Requires an inductor-capable transient model; browser audio must be opt-in and is not measurement authority |

### Wave 3 — power and electromechanical systems

| Priority | Component | What it unlocks | Smallest honest model | Key prerequisite or risk |
| --- | --- | --- | --- | --- |
| 9 | **Generic inductor family** | RL transients, filtering, flyback, resonance, and the basis for sounders, relays, and motors | Backward-Euler or trapezoidal companion stamp using the shared simulation clock and explicit initial state | Solver work comes first; handle zero/invalid inductance as a structured circuit error |
| 10 | **5 V SPDT relay** | Galvanically separated control, flyback-diode lessons, and normally-open/normally-closed switching | Coil R-L network plus deterministic hysteretic armature state and isolated contact resistance | Choose a specific through-hole relay and its footprint; contact and coil nodes must never be silently connected |
| 11 | **Small brushed DC motor** | Drivers, flyback, PWM speed control, stall current, and electro-mechanical energy lessons | Armature R-L, back-EMF, torque/inertia, bounded load, and one shared-clock mechanical state | Consider only after inductors and switching transients are stable; visual rotation derives from solver state |
| 12 | **L293D quadruple half-H driver, PDIP-16** | Bidirectional motor control and MCU-to-load projects | Supply-aware behavioural bridge with finite voltage drop, enable behavior, and over-current warning | Depends on motor/load models; it must expose, not conceal, shoot-through and supply mistakes |

Wave 3 is intentionally later. A decorative spinning motor or clicking relay would violate the
authoritative physical-project-to-measurement flow unless its state comes from the electrical and
mechanical model.

## Proposed teaching projects

Each wave should ship with small measured circuits instead of a single showcase:

- **Wave 1:** TMP36 threshold alarm (LM358B), MOSFET low-side LED driver, NAND SR latch, and loaded
  Zener regulator. Compare predicted node voltages with multimeter or oscilloscope results.
- **Wave 2:** NE555 clock driving a CD4017 LED sequencer, RC Schmitt oscillator, and photoresistor
  night-light with adjustable threshold.
- **Wave 3:** RL flyback comparison with and without a diode, relay-controlled isolated load, and
  PWM motor startup versus stall.

Every project needs a learning goal, expected range rather than an unexplained exact number, named
measurement points, a deliberate miswiring/failure case, and a statement of model limitations.

## Cross-cutting implementation plan

1. **Research before coding.** Pin each device to a manufacturer orderable part and datasheet
   revision. Record package drawings, pin numbering, ratings used by validation, and model evidence.
   The candidate references below are starting points and must be rechecked when work begins.
2. **Build generic solver capabilities first.** Add controlled sources/op-amp behavior, MOSFET and
   Zener nonlinear stamps, reusable logic gates, and then inductive state. Commercial names belong in
   device metadata and subcircuits, not in the core solver.
3. **Keep package and device separate.** Reuse PDIP-8/14/16 and TO-92 definitions where drawings
   agree; add factual axial/radial or electromechanical dimensions without enlarging bodies to ease
   placement.
4. **Integrate the full state path.** Extend strict domain unions, placement/occupancy, extraction,
   renderer projection, property controls, versioned persistence/migrations, and structured errors.
5. **Validate in layers.** Test pin order, package geometry, stamps, DC/transient reference values,
   convergence failures, mixed-signal threshold crossings, save/load, and browser placement at both
   desktop and narrow widths.
6. **Release behind evidence, not breadth.** A wave is complete only when its reference lessons can
   be assembled, simulated, measured, and recovered after save/load. Partial devices should not
   appear in the normal parts drawer.

## Candidate manufacturer references

These links identify likely source documents; no document, model, image, or mesh is redistributed:

- Texas Instruments, [LM358B dual operational amplifier](https://www.ti.com/lit/ds/symlink/lm358b.pdf).
- onsemi, [2N7000 N-channel MOSFET](https://www.onsemi.com/pdf/datasheet/2n7000-d.pdf) (confirm the
  selected through-hole ordering against the current datasheet before implementation).
- Texas Instruments, [SN74HC00 quad NAND gate](https://www.ti.com/lit/ds/symlink/sn74hc00.pdf).
- onsemi, [1N4728A–1N4764A Zener diodes](https://www.onsemi.com/pdf/datasheet/1n4736a-d.pdf).
- Texas Instruments, [CD4017B decade counter](https://www.ti.com/lit/ds/symlink/cd4017b.pdf).
- Texas Instruments, [SN74HC14 Schmitt-trigger inverter](https://www.ti.com/lit/ds/symlink/sn74hc14.pdf).
- Texas Instruments, [L293D quadruple half-H driver](https://www.ti.com/lit/ds/symlink/l293.pdf).

Before copying any vendor-provided simulation model or footprint, complete the licensing review in
the authoring guide. Prefer original procedural geometry and independently implemented educational
models when redistribution rights are unclear.

## Explicitly deferred

- **Mains components and circuits** (transformers, triacs, mains relays): inappropriate until the UI
  can communicate isolation and safety limitations without implying that this is a safety tool.
- **RF parts and crystals:** require frequency-domain or much smaller-timestep capabilities the
  current simulator does not claim.
- **Arbitrary SPICE model import:** expands parsing, licensing, convergence, and untrusted-input risk
  far beyond adding curated educational parts.
- **Large microcontroller families and wireless modules:** would add firmware/peripheral scope before
  the existing ATtiny85 mixed-signal scheduling path is complete.
- **Near-duplicate resistor, LED, diode, and BJT stock numbers:** parameter variants can follow after
  the new model families above; they do less to expand the learning space.
