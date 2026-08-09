# PCB implementation assessment

The breadboard definition groups holes by conductive `stripId`; circuit extraction joins those
strips, closed switches, jumper wires, and explicit grounds with union-find. The resulting
`componentTerminalNodes` map is therefore the authoritative PCB conversion input, rather than
screen position. Component terminal keys live on the discriminated component types and device pin
names/numbers live in the component catalog. Physical packages already use millimetres and 2.54 mm
pitch in `src/domain/physical`.

Projects are schema-versioned JSON documents, validated on load, and stored through a repository
boundary backed by SQLite. PCB state should consequently be an optional versioned child of the
project, with domain geometry independent of React and Three.js. The initial converter can support
the reliable THT packages already represented: axial resistors, 5 mm LEDs, radial capacitors and
DIP-8 NE555. Breadboard power/ground symbols and loose jumper wires are connectivity aids rather
than board components; switches need a specifically identified package before conversion. Other
catalog devices need component placement support before they can be converted despite having
datasheet-backed package metadata.

The implementation stages are: domain/footprint library, authoritative net conversion, placement,
single-layer routing and DRC, editor, persistence, then KiCad/BOM output. KiCad's documented
S-expression board format is suitable for direct deterministic interchange. Fabrication plotting
should remain behind an adapter to KiCad CLI rather than emitting unvalidated pseudo-Gerbers; the
UI must report manufacturing ZIP as unavailable when that optional tool is absent.

