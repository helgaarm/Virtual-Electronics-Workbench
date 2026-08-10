# PCB designer

The entire PCB workspace is experimental and intended only for testing. It is not ready for
manufacturing, and boards must not be fabricated from its exports. The workspace displays this
warning persistently.

The PCB workspace builds a static physical netlist from breadboard strips and permanent jumper
wires. Device state is deliberately excluded: an open and a closed switch produce the same two-pad
physical netlist, so bottom copper cannot bypass the switch merely because it was closed during
simulation. Every supported terminal is retained, including a terminal on a one-pad net; unsupported
or unmappable terminals stop conversion with a diagnostic.

Boards use millimetres, a top-left origin, clockwise quarter-turn placement, and top-side component
coordinates. A board can use bottom copper (`B.Cu`) only or two copper layers (`F.Cu` and `B.Cu`)
connected by vias. Deterministic initial placement sizes rows from actual rotated footprint
courtyards and leaves board-edge and inter-component routing space. Flipping the preview mirrors X
as a physical board flip; it does not alter manufacturing coordinates.

The deterministic router orders high-pin-count nets first, grows a nearest-pad tree, and uses A* on
a 0.5 mm orthogonal grid. Board-edge clearance, foreign-net pads, previously routed foreign-net
copper, track width, and copper clearance are obstacles. In double-sided mode it can change layers
through explicit vias; in single-sided mode it remains on `B.Cu`. It reports a connection as
unresolved instead of drawing colliding copper.

Repair searches run in a dedicated Web Worker so A* routing and placement candidates cannot block
the interface. The repair control becomes a cancel action while work is active, and editing the PCB
cancels a stale in-flight result instead of allowing it to overwrite the newer board. A binary heap
backs the A* open set, and a successful direct reroute bypasses the more expensive placement search.

DRC derives connectivity from physical pad/trace contact. It blocks readiness for unresolved
connections, cross-net trace crossings/overlaps/clearance, foreign-pad contact, pad clearance,
overlapping courtyards, stale automatic endpoints, invalid boards, missing/unverified footprints,
small drills, narrow tracks, edge violations, or copper and vias that are incompatible with the
selected board type. Same-net copper may intentionally join. Passing these checks describes
manufacturing geometry only, not electrical safety or functional certification.

KiCad PCB and CSV BOM exports consume the same stored footprints, nets, pads, trace points, widths,
layers and coordinates checked by DRC. Manufacturing ZIP remains unavailable until a validated
KiCad CLI adapter can plot and verify Gerber and Excellon layers; no fake Gerber is produced.

## Current routing limitations

The router is intentionally conservative. Its limited deterministic retry changes search direction
between connections, and double-sided mode can use vias and top copper, but it does not yet perform
whole-board negotiated rip-up, automatically propose insulated jumpers, or generate curved/45-degree
tracks. A dense board can therefore be reported unroutable even if a more advanced placer/router
could solve it. Moving components requires automatic tracks to be rerouted; manual track editing is
not yet obstacle-routed automatically.
