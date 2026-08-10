# Single-sided PCB designer

The entire PCB workspace is experimental and intended only for testing. It is not ready for
manufacturing, and boards must not be fabricated from its exports. The workspace displays this
warning persistently.

The PCB workspace builds a static physical netlist from breadboard strips and permanent jumper
wires. Device state is deliberately excluded: an open and a closed switch produce the same two-pad
physical netlist, so bottom copper cannot bypass the switch merely because it was closed during
simulation. Every supported terminal is retained, including a terminal on a one-pad net; unsupported
or unmappable terminals stop conversion with a diagnostic.

Boards use millimetres, a top-left origin, clockwise quarter-turn placement, top-side component
coordinates and bottom copper (`B.Cu`) only. Deterministic initial placement sizes rows from actual
rotated footprint courtyards and leaves board-edge and inter-component routing space. Flipping the
preview mirrors X as a physical board flip; it does not alter manufacturing coordinates.

The deterministic router orders high-pin-count nets first, grows a nearest-pad tree, and uses A* on
a 0.5 mm orthogonal grid. Board-edge clearance, foreign-net pads, previously routed foreign-net
copper, track width, and copper clearance are obstacles. It never creates a top layer or hidden via,
and reports a connection as unresolved instead of drawing colliding copper.

DRC derives connectivity from physical pad/trace contact. It blocks readiness for unresolved
connections, cross-net trace crossings/overlaps/clearance, foreign-pad contact, pad clearance,
overlapping courtyards, stale automatic endpoints, invalid boards, missing/unverified footprints,
small drills, narrow tracks, edge violations, or a non-bottom trace. Same-net copper may
intentionally join. Passing these checks describes manufacturing geometry only, not electrical
safety or functional certification.

KiCad PCB and CSV BOM exports consume the same stored footprints, nets, pads, trace points, widths,
layers and coordinates checked by DRC. Manufacturing ZIP remains unavailable until a validated
KiCad CLI adapter can plot and verify Gerber and Excellon layers; no fake Gerber is produced.

## Current routing limitations

The router is intentionally conservative and single-sided. Its limited deterministic retry changes
search direction between connections, but it does not yet perform whole-board negotiated rip-up,
automatically propose insulated jumpers, use vias or a top copper layer, or generate curved/45-degree
tracks. A dense board can therefore be reported unroutable even if a more advanced placer/router
could solve it. Moving components requires automatic tracks to be rerouted; manual track editing is
not yet obstacle-routed automatically.
