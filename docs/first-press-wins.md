# First to Press Wins

Choose **First to Press Wins** under **Start projects**, then select **Load**.
The starter opens powered, with both winner LEDs off and a fully wired 64-column
breadboard. Red is on the left, green on the right, and Reset is in the middle.

## Play a round

1. Select a player switch on the board. In the inspector, change **Contact** to
   **Closed · conducting** to press it. That player's LED lights.
2. Open the same contact to release it. The LED stays lit.
3. Close the other player's switch. Its LED stays off: the first player has locked
   it out. Open that switch again.
4. With both player switches open, close **Reset** for at least 0.2 seconds of
   simulation time, then open it. Both LEDs go out and either player can win the
   next round. Keep the simulation running while operating the switches.

The switches currently use the inspector's maintained open/closed control;
selecting the 3D button alone does not press it. Releasing both player switches
before Reset avoids immediately claiming the next round with a held button.
Exact simultaneous presses have no guaranteed winner. This is an analogue latch
demonstration, not a calibrated reaction-time instrument.

## What to measure

The multimeter includes **Red latch output** and **Green latch output** probes.
Oscilloscope CH1 measures red and CH2 measures green, both relative to supply
ground. The winning output settles near 4 V; LED current is approximately 5–6 mA.
The supply reads 5 V before the reset-current limiting resistors.

## Circuit

Each player uses a BC557 PNP and BC547 NPN in a regenerative latch. Pressing its
switch supplies limited base current to the NPN. The NPN pulls down the PNP base,
and the PNP output feeds current back to the NPN base after the button is released.
A third BC547, driven by the opposing output, clamps this player's NPN base to
ground and inhibits later presses. There is no software winner flag or LED binding.

Each side contains 47 kΩ off-bias resistors, a 1 kΩ PNP base resistor, 10 kΩ
feedback, button, and inhibition resistors, a 100 kΩ output discharge resistor,
a 330 Ω LED resistor, and a 1 µF output stabilizing capacitor. The capacitors also
retain physical charge across switch-topology changes in the transient solver;
steady winner retention comes from transistor feedback.

Reset shunts the latch supply to ground through its switch. Two parallel 220 Ω
quarter-watt resistors limit reset current to about 45 mA total, dissipating about
0.114 W each while Reset is held. These resistors must remain in circuit.

The factory generates ordinary jumper components between free holes of the
specified breadboard strips. Net names are construction aids only; all electrical
connectivity is extracted from the saved holes, jumpers, and switch contacts.
Component bodies retain their catalogue dimensions. No new device model, package,
asset, dependency, or persisted project field is introduced.

## Validation and limits

Regression tests exercise both player orders through the same transient-runtime
reconciliation used by the app: initial darkness, winner release, opponent
lockout, sustained retention, reset current/power, and reversed rounds. They also
check occupancy, package overlap, probe connectivity, and starter save/load.
The default step is 1 ms; button bounce, transistor tolerances, and hardware
metastability are not modelled. Saved projects retain wiring and switch positions,
but do not save an in-progress round's transient capacitor charge.

The existing BC547/BC557 educational models and package references are documented
in the [standard component pack](standard-component-pack.md).
