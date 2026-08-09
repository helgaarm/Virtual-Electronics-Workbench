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
