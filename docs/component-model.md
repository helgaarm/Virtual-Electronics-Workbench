# Component model

Every placed component combines two independent definitions:

- an electrical definition with terminals and values;
- a physical definition with a package, millimetre dimensions, lead locations and allowed rotations.

Project placements bind terminal names to breadboard hole IDs. Renderers receive the placement and computed simulation result, but never decide connectivity. The Phase A/B catalogue includes a 5 V source, ground reference, axial resistor, 5 mm red LED, tactile switch, and jumper wire.

Resistor bands are calculated from resistance and tolerance. They are not decorative presets. The initial implementation renders four-band values rounded to two significant figures.
