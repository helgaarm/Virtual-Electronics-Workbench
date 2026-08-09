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

The domain pipeline is static physical net conversion, courtyard-aware placement, single-layer
obstacle-aware routing, copper-geometry connectivity and DRC, then rendering/export. Shared geometry
functions define segment intersection, point/segment and segment/segment distance, polylines and
courtyard overlap, so routing and validation use the same physical interpretation. KiCad export
serializes the validated stored geometry rather than reconstructing a different route.
