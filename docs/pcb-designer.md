# Single-sided PCB designer

The PCB workspace converts the same terminal-to-node map used by simulation into a versioned PCB
model. It supports verified through-hole footprints for the current resistor, LED, radial capacitor,
NE555 DIP-8 and two-pin power-input representations. Ground symbols and breadboard jumper wires do
not become physical parts. Switches are reported as needing a footprint because their exact package
is not yet identified.

Boards use millimetres, a top-left origin, clockwise quarter-turn placement, top-side component
coordinates and bottom copper (`B.Cu`) only. Flipping the preview mirrors X as a physical board flip;
it does not alter manufacturing coordinates. The deterministic first router connects remaining
nets with orthogonal tracks. It never creates a top layer or hidden vias. Complex collision-aware
rip-up, manual trace drawing, jumper proposal, mounting-hole editing, Gerber/Excellon plotting and
the thermometer starter are known follow-up limitations.

DRC blocks readiness for unresolved connections, invalid boards, missing/unverified footprints,
small drills, narrow tracks, edge violations or a non-bottom trace. Passing these checks describes
manufacturing geometry only, not electrical safety or functional certification.

KiCad PCB and CSV BOM exports are generated directly. Manufacturing ZIP remains visibly unavailable
until a validated KiCad CLI adapter can plot and verify Gerber and Excellon layers; no fake Gerber is
produced. Footprint geometry belongs in `src/domain/pcb/footprints.ts`, with terminal mapping,
dimensions, drill size, verification state and an authoritative package source recorded together.

