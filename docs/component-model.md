# Component model

Every placed component combines two independent concerns:

- an electrical definition with terminals and values;
- a physical definition with a package, millimetre dimensions, lead diameter, mounting height and allowed rotations.

Project placements bind terminal names to breadboard hole IDs. Renderers receive the placement and computed simulation result, but never decide connectivity. The Phase A–D catalogue includes a configurable DC source, ground reference, axial resistor, five LED colours, tactile switch, six jumper-wire colours, and a polarized radial electrolytic capacitor. Shared physical package metadata defines dimensions, lead diameter, mounting height, package type, and allowed quarter-turn orientations.

Procedural renderers currently derive their visual lead anchors and smooth lead paths from that shared package metadata and the bound hole positions. Those renderer-owned paths affect appearance only; terminal-to-hole bindings remain the source of electrical connectivity.

Resistor bands are calculated from resistance and tolerance. They are not decorative presets. The initial implementation renders four-band values rounded to two significant figures.

The capacitor has named positive and negative terminals, configurable capacitance in farads, and displayed rated-voltage metadata. Its renderer uses fixed package geometry with a polarity stripe and lead markings; changing its electrical value does not stretch or resize the package. The electrical extraction layer passes terminal polarity and capacitance to the transient solver, while DC analysis treats it as an open circuit. Polarity currently defines voltage sign and rendering only: reverse-polarity damage and rated-voltage enforcement are outside the ideal model.
