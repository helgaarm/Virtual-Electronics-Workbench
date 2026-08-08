# Physical model

Logical world units are millimetres. Breadboard coordinates are generated from the standard 2.54 mm pitch. Terminal rows A–E and F–J form independent five-hole strips separated by a centre groove. Positive and negative rails run along both sides and are split into realistic sections.

Each `BreadboardHole` records a stable ID, label, position, strip ID, kind, and optional occupant. Occupancy is derived from component terminal bindings and validated before edits are accepted.

Rotation is discrete at 0°, 90°, 180° and 270°. Two-lead packages keep a fixed pitch span; rotation changes the terminal coordinates and therefore the candidate hole pair rather than rotating only a visual icon.
