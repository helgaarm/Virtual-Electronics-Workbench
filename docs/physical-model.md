# Physical model

Logical world units are millimetres. Breadboard coordinates are generated from the standard 2.54 mm pitch. Terminal rows A–E and F–J form independent five-hole strips separated by a centre groove. Positive and negative rails run along both sides and are split into realistic sections.

Each `BreadboardHole` records a stable ID, label, position, strip ID, and kind. Occupancy is derived from component terminal bindings and validated before edits are accepted. The scene renders recessed holes, row/column markings, rail polarity, and the same 15-column rail splits used by electrical topology.

Rotation is discrete at 0°, 90°, 180° and 270°. Two-lead packages keep a fixed pitch span; rotation changes the terminal coordinates and therefore the candidate hole pair rather than rotating only a visual icon.

Dragging translates every terminal by the same board-space offset. A preview appears only when all destination holes have compatible kinds, preserve the package lead pattern, and are unoccupied; releasing commits that validated placement.

Placed components are anchored by default. Selecting an anchored component only opens its inspector and cannot begin a drag, rotate the package, or change terminal holes. Use the inspector's placement control to unanchor it before moving or rotating it, then anchor it again when its position is final. The explicit anchor state is stored with saved projects.

`PHYSICAL_PACKAGES` is the shared package catalogue for millimetre dimensions, lead diameter, mounting height, package type, and allowed orientations. Electrical values do not resize a package: for example, changing resistance changes bands but not the axial body length. The Phase D radial electrolytic package uses a 6.3 mm diameter, 11 mm height, 0.5 mm leads, and a constrained 2–5.08 mm lead span; visual polarity markings agree with the positive/negative terminal bindings.

Through-hole ICs use reusable DIP definitions rather than device-specific geometry. The first definition is TI's 8-pin P-package envelope: 2.54 mm pin pitch, 7.62 mm row spacing, and 9.81 × 6.35 × 3.9 mm maximum body dimensions. An NE555N occupies four consecutive holes on each side of the centre channel. Its two valid rotations retain the counter-clockwise physical pin order relative to the notch and pin-1 mark.

Two-terminal physical packages define realistic minimum and maximum lead spans. The limits are applied when parts are added, dragged, rotated, edited in the inspector, and loaded from saved project documents. This prevents short resistor leads from folding backward and prevents resistor, capacitor, LED, switch, or source legs from stretching unrealistically. Flexible jumper wires deliberately have no fixed span limit.

Jumper wires use a deterministic visual routing heuristic. A clear route receives a centered raised arch. Component packages and their terminal-to-body lead envelopes add lateral waypoints; previously routed wire spans raise later crossings. This is not a general collision solver.

Wire bends use local quadratic curves that stay within their routing corners, preventing smoothing from dipping below the breadboard. The 0.5 mm bare conductor enters each endpoint hole vertically. Short stripped sections can pass beneath low packages while staying above the board. Insulation begins only where its full radius, including the selection highlight, clears the board by at least 0.08 mm. Routing and rendering do not change the terminal holes or electrical connectivity.
