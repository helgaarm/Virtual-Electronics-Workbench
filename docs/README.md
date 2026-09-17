# Documentation

Virtual Electronics Workbench is primarily an educational circuit-building and testing environment.
Start with the learning workflow before the optional, experimental PCB material.

## Learn, build, simulate, and measure

- [Project overview and setup](../README.md)
- [Physical breadboard model](physical-model.md)
- [External temperature, humidity, wind, and light](environment.md)
- [Simulation models and numerical limits](simulation.md)
- [Multimeter, oscilloscope, generator, counter, and logic analyser](instruments.md)
- [Component model](component-model.md)
- [Standard component pack](standard-component-pack.md)
- [Classic Arduino Nano: built-in examples and custom firmware](arduino-nano.md)
- [Two-NTC wind sensor: circuits, Arduino sketch, calibration and constant-temperature control](wind-sensor.md)
- [Digital thermometer: wiring, firmware, and measurements](thermometer.md)
- [Prioritized component expansion proposal](component-expansion-proposal.md)
- [NE555 model and teaching limitations](ne555.md)
- [First to Press Wins: play and measure the transistor latch game](first-press-wins.md)

## Architecture and contribution

- [Architecture and dependency boundaries](architecture.md)
- [Component-authoring workflow](component-authoring.md)
- [Contributing](../CONTRIBUTING.md)
- [Project persistence, backup, and recovery](persistence-and-recovery.md)
- [Roadmap](roadmap.md)

## Optional PCB workspace

PCB design is a secondary, experimental continuation after a learner has built, simulated, and
measured a working breadboard circuit. Its exports are not fabrication-ready.

- [PCB designer status and limitations](pcb-designer.md)
- [PCB implementation assessment](pcb-implementation-assessment.md) — point-in-time assessment

## Operations and point-in-time reviews

- [Security policy](../SECURITY.md)
- [Dependency review](dependency-review.md) — dated review; rerun checks for current status
- [Dependabot automatic repair](dependabot-auto-repair.md) — allowlisted, credential-free generated-file repair
- [Public-repository hardening](public-repository-hardening.md) — setup record and owner checklist
- [Documentation review](documentation-review.md) — review record and improvement tracking
