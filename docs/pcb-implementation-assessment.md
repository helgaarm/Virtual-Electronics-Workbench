# PCB implementation assessment

The original PCB converter reused simulation extraction. That extractor unions breadboard strips,
permanent jumper wires, explicit grounds, and a switch's terminals whenever the switch is closed.
Consequently, changing runtime switch state could collapse two physical switch pads into one PCB
net. The old converter also silently omitted unresolved terminals and discarded one-pad nets.

Placement used fixed 14 mm coordinates in four columns without consulting package dimensions or
courtyards. Routing connected adjacent pad-array entries with a direct L-shaped polyline and did not
inspect edges, pads, component placement, prior copper, width, or clearance. Its connectivity check
only recognized trace endpoints exactly coincident with two pads. DRC counted those declared
endpoint pairs and checked basic width, layer, drill and point-edge rules; it did not test cross-net
copper geometry. Thus crossing or overlapping different-net traces could be reported ready.

PCB conversion now performs its own static union of breadboard strips, permanent jumper wires, and
explicit grounds. Device conductive state is never an input. Stable net IDs derive from the
lexically first physical hole in each connected group rather than traversal-dependent simulation
node numbering. All supported terminals must map explicitly to footprint pads and nets.

The reusable foundation was the static physical-net extractor, verified through-hole footprint
library, millimetre geometry helpers, courtyard-aware row placement, and deterministic grid router.
The remaining root limitation was that the PCB types only admitted `B.Cu`, connectivity flattened
copper into XY space, routing had no layer state, DRC had no via geometry, and the UI's “fix” action
was only a direct router call. Persistence and KiCad export consequently had no first-class layer or
via object to preserve.

The domain pipeline is now static physical net conversion, explicit single/double board mode,
layer-aware copper connectivity, bounded X/Y/layer routing, DRC, copy-on-write repair, and
rendering/export of the same stored geometry. Plated pads and routing vias are the only ordinary
F.Cu/B.Cu transitions; coincident copper on opposite layers remains disconnected. The deterministic
router treats foreign pads, traces and vias as clearance-expanded obstacles and prices vias above
ordinary movement. Repair evaluates rerouting, local 2.5 mm placement moves, and bounded 5 mm board
expansion without changing rules or deleting manual copper.

This remains an educational heuristic engine rather than an industrial global optimizer. The current
repair budget does not yet synthesize single-sided jumper objects, search alternate footprints, move
individual vias, or perform multi-net rip-up combinations. Initial placement is courtyard-aware but
is not yet a full force-directed/topology clusterer. These cases correctly remain visible as DRC or
repair diagnostics instead of being reported as fabrication-ready.
