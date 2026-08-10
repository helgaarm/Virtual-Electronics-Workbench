# Documentation review and proposed changes

Review date: 2026-08-10.

Implementation update: the follow-up change implements the runtime boundary correction, a
capability-first educational README, current architecture/roadmap/component references, a
documentation index, local persistence/recovery guidance, dated-report labels, a validation matrix,
review triggers, and an automated architecture import check. Remaining documentation automation
(full Markdown link and schema-reference checks) can be added separately without blocking these
corrections.

## Scope and method

This review covers the repository guidance and public Markdown documentation: `AGENTS.md`,
`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, the pull-request template, and every file under
`docs/`. `THIRD_PARTY_LICENSES.md` was checked as a generated license inventory rather than edited
as narrative documentation.

The review compared those documents with the source layout, package scripts, current project
schema, persistence/API implementation, simulation and measurement boundaries, component catalogue,
PCB implementation, tests, and repository-security configuration. Relative Markdown links were also
checked for local targets. Claims tied to registries, advisories, GitHub settings, or external
datasheets remain point-in-time claims and should be rechecked through their documented release or
maintenance processes.

## Overall assessment

The documentation consistently expresses the intended product: a calm, educational, physically
assembled breadboard workbench in which real hole bindings determine connectivity and measurements
derive from solver results. It also consistently preserves the package/device/model distinction,
millimetre dimensions and 2.54 mm pitch, deterministic simulation, explicit model limitations,
versioned persistence, and the separation between simulated behavior and rendered presentation.

The strongest documents are the focused technical references (`simulation.md`, `ne555.md`,
`physical-model.md`, `instruments.md`, and `pcb-designer.md`). They state numerical assumptions and
unsupported behavior instead of implying SPICE, safety, or manufacturing fidelity. Contribution,
security, dependency, and public-repository guidance also align with the repository's local-only,
educational purpose and defensive review rules.

The documentation was therefore broadly in accordance with the intended use and architecture, but
its top-level narrative had fallen behind the component-pack and PCB work, and one implementation
dependency contradicted the documented simulation boundary. The following list records the findings
and the follow-up status.

## Proposed changes

### P0 — restore the documented simulation boundary — completed

1. **Move transient runtime orchestration types and functions out of React-facing state.**
   `src/simulation/transient/runtime.worker.ts` imports `RuntimeState` and
   `runTransientRuntimeSteps` from `src/state/useTransientRuntime.ts`. This reverses the declared
   dependency direction and makes a simulation worker depend on a React hook module. Extract the
   framework-free runtime state/step logic into `src/simulation/transient` (or a similarly neutral
   module), then let both the worker and hook depend on it. Add an automated import-boundary check so
   `src/simulation` cannot import `src/state`, `src/ui`, `src/workbench`, React, or Three.js.

### P1 — make the current product scope discoverable and internally consistent — completed

2. **Replace phase-history-first README copy with capability-first documentation.** The opening
   product direction is clear, but “Phase A–F” and “original phases 14–15” require unavailable
   historical context. Keep phase names only as release history; organize the current feature list
   around Build, Simulate, Measure, Components, PCB, and Save/Open. This will better serve learners
   and contributors arriving today.
3. **Add the standard component pack and mixed-signal status to the README milestone list.** The
   catalogue contains diodes, transistor variants, a potentiometer, TMP36, seven-segment displays,
   74HC595, and ATtiny85 support, but the README's detailed inventory ends at the logic analyser.
   State the important limitation already captured in `standard-component-pack.md`: behavioural
   digital models are independently tested but are not yet scheduled together by the application
   transient worker.
4. **Update `architecture.md` to cover the PCB domain and mixed-signal foundation.** Add PCB
   conversion, routing, DRC, repair worker, and export to the layer table and data-flow description;
   add behavioural digital/runtime boundaries; and extend the milestones beyond NE555. Explicitly
   preserve the authoritative breadboard flow: PCB conversion consumes extracted electrical nets
   and does not redefine breadboard connectivity.
5. **Rewrite `roadmap.md` as “shipped / next / later,” with acceptance criteria.** Its “Later” entry
   still lists 1N4148, BC547, digital parts, other IC packages, and firmware even though the standard
   pack now implements foundations for those items. Reconcile it with
   `standard-component-pack.md`, keep live end-to-end mixed-signal scheduling in “next,” and identify
   the experimental PCB workspace and its remaining validation work.

### P1 — clarify user-facing safety, deployment, and data expectations — completed

6. **Put the experimental PCB warning next to every PCB entry point in the README.** The dedicated
   PCB document correctly says the workspace is for testing and not fabrication-ready. The README
   should use equally direct language before listing exports, and distinguish a manufacturing
   summary from validated manufacturing output.
7. **Document the local trust model in the README and architecture reference.** Explain that the API
   intentionally binds to loopback, has no authentication, is suitable for a single-user local
   workstation, and must not be exposed as a shared/network service. Keep the existing environment
   variables from implying that changing a port turns the application into a production multi-user
   deployment.
8. **Add backup and recovery instructions for SQLite projects.** Document when to stop the server,
   which database and companion files need copying, how to choose a separate database with
   `WORKBENCH_DB`, and how to verify a restored copy. Link this from both the persistence section and
   schema-migration guidance. This turns the architecture's migration/recovery requirement into an
   actionable user and maintainer procedure.

### P2 — reduce drift and improve navigation — completed

9. **Create a documentation index.** Add a short `docs/README.md` grouping learner guides,
   architecture/model references, component-authoring references, PCB status, operations/security,
   and historical assessments. Link it from the root README and contributing guide.
10. **Separate current reference material from dated assessments.** Mark
    `dependency-review.md`, `pcb-implementation-assessment.md`, and
    `public-repository-hardening.md` prominently as point-in-time reports. Each should link to its
    current source of truth and state what must be rerun or manually verified. In particular, avoid
    reading a historical zero-vulnerability result or owner-action checklist as a continuously
    verified status.
11. **Centralize schema support information.** Version 8 and migrations from versions 1–7 are
    repeated across the README, architecture, and instrument docs. Make persistence/migrations the
    canonical reference, keep only a short link elsewhere, and add a check or test that documentation
    mentioning the current schema agrees with the exported schema constant.
12. **Expand `component-model.md` for the standard package families.** It currently stops at DIP-8
    and NE555. Summarize DO-35, TO-92, DIP-14/DIP-16, sensor, display, potentiometer, shift-register,
    and MCU distinctions, while leaving datasheet/model values in `standard-component-pack.md`.
13. **Add an explicit testing matrix to component authoring.** Map model changes to domain/solver
    tests, package changes to placement/occupancy/browser checks at desktop and narrow widths,
    persistence changes to migration/round-trip/SQLite recovery checks, and renderer changes to the
    required WebGL smoke test. This makes the repository guide's rules actionable at the extension
    point contributors actually use.
14. **Use shell-neutral command fences.** Command blocks containing ordinary npm/git commands are
    labelled `powershell`; use `console` or `sh`, or provide genuinely platform-specific sections.
    Also document that `npm ci` is the reproducible contributor/CI install while `npm install` is for
    intentional dependency updates.

### P2 — automate documentation integrity — partially completed

15. **Add a documentation check to `npm run check`.** At minimum, validate local Markdown links,
    detect references to missing paths, and enforce the schema-version consistency described above.
    Consider a small allowlisted check for documented package scripts and API routes so renamed
    commands/endpoints fail CI rather than silently drifting.
16. **Add ownership and review triggers for authoritative docs.** Changes to simulation assumptions,
    persisted schemas, package dimensions, supported devices, PCB exports, or security workflows
    should require corresponding documentation review through the pull-request template and
    CODEOWNERS. Keep generated license inventory changes tied to the existing license check.

The follow-up adds local-link validation and architecture ownership/review triggers. A future check
may additionally compare prose that names a schema version, package script, or API route with source
constants; current narrative references avoid duplicating the schema number where it is unnecessary.

## Suggested execution order

1. Fix the runtime dependency inversion and protect the layer boundary with automation.
2. Reconcile README, architecture, and roadmap with the standard component pack and PCB status.
3. Add local-deployment and SQLite recovery guidance.
4. Add the documentation index and consolidate repeated current-version facts.
5. Add documentation/link/schema checks and the testing matrix to prevent renewed drift.

No source behavior, schema, API, or user data is changed by this review document. Each proposal should
be implemented as a focused change with tests appropriate to the affected boundary.
