# Component model

Every placed component combines two independent concerns:

- an electrical definition with terminals and values;
- a physical definition with a package, millimetre dimensions, lead diameter, mounting height and allowed rotations.

Project placements bind terminal names to breadboard hole IDs. Renderers receive the placement and computed simulation result, but never decide connectivity. The Phase A/B catalogue includes a configurable DC source, ground reference, axial resistor, five LED colours, tactile switch, and six jumper-wire colours. Shared physical package metadata defines dimensions, lead diameter, mounting height, package type, and allowed quarter-turn orientations.

Procedural renderers currently derive their visual lead anchors and smooth lead paths from that shared package metadata and the bound hole positions. Those renderer-owned paths affect appearance only; terminal-to-hole bindings remain the source of electrical connectivity.

Resistor bands are calculated from resistance and tolerance. They are not decorative presets. The initial implementation renders four-band values rounded to two significant figures.
