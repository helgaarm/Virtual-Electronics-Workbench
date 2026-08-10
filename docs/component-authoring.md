# Component authoring

Use this workflow when adding devices such as 1N4148, BC547, LM358N, or CD4017.

1. Research authoritative manufacturer datasheets and mechanical drawings. Record title, publisher, revision/date, URL, and each value or behavior used. Never invent a pinout, package dimension, supply range, or electrical characteristic.
2. Reuse or add a physical package definition independently of the electronic device. Prefer procedural standard-package geometry and real millimetre dimensions. Do not make a device-specific renderer when a reusable DIP, TO, axial, or radial package is sufficient.
3. Define stable external pin IDs, names, physical numbering, and breadboard placement rules. Verify numbering against the package notch/marker and reject invalid/occupied placements.
4. Choose the smallest honest simulation model: an existing primitive for a resistor/capacitor/diode/BJT, or a reusable internal subcircuit for a complex IC. Core solver code must understand generic stamps, never a commercial part name. Subcircuit definitions must be acyclic, with tests for nested instance scoping when nesting is used.
5. Add structured device metadata: identity, category, package, supply range, model level, limitations, sources, and tested examples. Keep the architecture open to multiple model levels without adding premature UI controls.
6. Extend persistence only for visible, user-owned state. Increment the schema and add migration/round-trip tests when the stored document changes. Never persist Newton iteration state or expanded private nodes.
7. Validate electrical invariants before UI polish: polarity, cutoff/conduction, gain/switching, loading, state, and transient response. Compare with datasheet ranges where the model supports them, and document why an educational model differs.
8. Add domain, solver, placement, extraction, persistence, starter, and regression tests proportional to the device. Prefer invariant tests over screenshots or fragile exact numerical snapshots.
9. Add a starter circuit when it materially teaches the component. The result must emerge from simulated circuit nodes; never generate a decorative or hard-coded waveform.
10. Run `npm run check`, then manually inspect placement, orientation, leads, selection, anchoring, wiring, simulation, measurements, and save/reload in a WebGL browser.

## Licensing rules

- Review the license before importing any SPICE model, footprint, symbol, mesh, drawing, or dataset.
- A downloadable manufacturer model is not automatically redistributable.
- Do not copy KiCad, Fritzing, or manufacturer assets into the MIT tree without compatible terms, attribution, and notices.
- Prefer original code and procedural geometry based on factual dimensions.
- If reuse terms are uncertain, do not import the material; implement an independently documented model and state its limitations.

## Definition of done

The visible package, device metadata, and simulation model remain separate; pins map to real holes; numerical failures are explicit; old projects still load; tests and documentation cover the new behavior; third-party obligations are recorded; and the normal UI exposes only learner-relevant controls and telemetry.

## Validation matrix

| Change | Required validation |
| --- | --- |
| Electrical model or solver stamp | Domain/extraction tests, reference solver cases with tolerances, invalid-circuit structured errors, and DC/transient cases as applicable |
| Package dimensions or placement | Package and pin-order tests, hole occupancy, allowed orientations, collision/lead geometry, and datasheet traceability |
| Renderer or interaction | Programmatic tests plus WebGL browser smoke tests at desktop and narrow widths for placement, selection, anchoring, leads, and measurement attachment |
| Persisted project shape | Schema increment, forward migration, validation, round trip, SQLite compatibility, and recovery against a copy of an older database |
| Instrument behavior | Measurement-layer tests over solver output, disconnected/error states, shared-clock behavior, bounded capture, and no display-only signal generation |
| Starter or lesson | Expected topology and solver results, measurement points, save/reload, stated learning goal, and documented model limitations |

PCB footprint/export work is additional to—not a substitute for—the package, extraction, simulation,
measurement, and lesson validation needed for an educational breadboard component.

## Standard component-pack patterns

The standard pack keeps package, device, and model definitions separate:

- **Parameterised analogue device:** 1N4148 metadata selects the existing nonlinear Shockley diode; a visible DO-35 package must not introduce another diode equation.
- **Package-reused transistor:** BC547 combines TO-92 geometry with its documented C-B-E mapping and the existing NPN BJT model. 2N3904 uses the same geometry but its documented E-B-C mapping.
- **Sensor:** TMP36 combines TO-92 geometry, an editable component temperature, and a temperature-controlled electrical output. Consumers must read the output node, never the property.
- **Digital IC:** 74HC595 combines DIP-16 with an edge-triggered behavioural model. Logic inputs are classified from supply-relative node voltages and outputs use finite drive resistance or high impedance.
- **Programmable MCU:** ATtiny85 combines DIP-8, an Intel HEX firmware association, an AVR runtime adapter, and mixed-signal GPIO/ADC bridges. Application algorithms belong in firmware artifacts.
- **Display:** a four-digit common-cathode display combines package pins, LED junction currents, multiplex commons, and a bounded visual persistence integrator. It has no numeric-value property.

Package definitions own millimetre geometry and anonymous numbered lead positions. Device metadata owns pin names and ordering. Simulation modules own transfer behaviour. Renderers consume those definitions without becoming electrical authorities.
