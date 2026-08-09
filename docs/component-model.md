# Component model

Every placed component combines two independent concerns:

- an electrical definition with terminals and values;
- a physical definition with a package, millimetre dimensions, lead diameter, mounting height and allowed rotations.

Project placements bind terminal names to breadboard hole IDs. Renderers receive the placement and computed simulation result, but never decide connectivity. The Phase A–E catalogue includes a configurable DC source, ground reference, axial resistor, five LED colours, tactile switch, six jumper-wire colours, and a polarized radial electrolytic capacitor. The Phase E signal generator is bench equipment rather than a placed component: its OUT and COM leads bind directly to hole IDs and appear as non-occupying probe markers. Shared physical package metadata defines component dimensions, lead diameter, mounting height, package type, and allowed quarter-turn orientations.

Phase F adds a distinct electronic-device catalogue and reusable DIP definitions. `NE555N` is an electronic device, `DIP-8` is its physical package, and `hybrid-analogue-subcircuit` is its current simulation model. The project persists the device/package/model identity, orientation, and eight physical pin-to-hole bindings, but never persists expanded internal nodes or Newton state.

Procedural renderers currently derive their visual lead anchors and smooth lead paths from that shared package metadata and the bound hole positions. Those renderer-owned paths affect appearance only; terminal-to-hole bindings remain the source of electrical connectivity.

Resistor bands are calculated from resistance and tolerance. They are not decorative presets. The initial implementation renders four-band values rounded to two significant figures.

The capacitor has named positive and negative terminals, configurable capacitance in farads, and displayed rated-voltage metadata. Its renderer uses fixed package geometry with a polarity stripe and lead markings; changing its electrical value does not stretch or resize the package. The electrical extraction layer passes terminal polarity and capacitance to the transient solver, while DC analysis treats it as an open circuit. Polarity currently defines voltage sign and rendering only: reverse-polarity damage and rated-voltage enforcement are outside the ideal model.

## DIP-8 and NE555N

The reusable DIP-8 definition uses a 2.54 mm pin pitch, 7.62 mm row spacing, and a 9.81 × 6.35 × 3.9 mm maximum body envelope from the TI P-package drawing. Its procedural renderer supplies the moulded body, leads, notch, pin-1 dot, and configurable top marking. NE555 placement must occupy four consecutive E-row holes and the corresponding four F-row holes, so the package straddles the centre channel. Only 0° and 180° orientations are valid; rotating preserves rigid pin spacing and physical numbering.

The standard timer pin order is GND, TRIGGER, OUTPUT, RESET, CONTROL, THRESHOLD, DISCHARGE, VCC. The inspector shows both the semantic name and actual breadboard hole for every pin. See [ne555.md](ne555.md) for the simulation model, traceability, and limitations.
