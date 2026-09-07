import { describe, expect, it } from 'vitest';
import { firstPressWinsProject } from '../../src/domain/starters/firstPressWins';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { validateOccupancy, validatePackageOverlaps } from '../../src/domain/physical/occupancy';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientRuntimeState, reconcileTransientRuntimeState, runTransientRuntimeSteps } from '../../src/simulation/transient/runtime';

function game() {
  const project = firstPressWinsProject();
  let extraction = extractCircuit(project);
  let runtime = createTransientRuntimeState(extraction.circuit, project.simulation, true);
  const advance = (seconds = 0.2) => {
    const batch = runTransientRuntimeSteps(runtime, extraction.circuit, [], Math.round(seconds / project.simulation.timeStepSeconds));
    expect(batch.frame.result.errors).toEqual([]);
    runtime = { ...runtime, frame: batch.frame };
    return batch.frame.result;
  };
  return {
    project,
    advance,
    toggle(id: string, closed: boolean) {
      project.components = project.components.map((component) => component.kind === 'switch' && component.id === id ? { ...component, closed } : component);
      extraction = extractCircuit(project);
      expect(extraction.errors).toEqual([]);
      // Match UI reconciliation: switch changes renumber nodes but retain capacitor charge.
      runtime = reconcileTransientRuntimeState(runtime, extraction.circuit, project.simulation, false, [], true, true);
      expect(runtime.frame?.result.errors).toEqual([]);
      return advance();
    },
  };
}

describe('first-to-press transistor starter', () => {
  it('has no overlapping bodies, occupied holes, or missing wires', () => {
    const project = firstPressWinsProject();
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    expect(validateOccupancy(board, project.components)).toEqual([]);
    expect(validatePackageOverlaps(board, project.components)).toEqual([]);
    expect(project.components.filter((component) => component.kind === 'bc547' || component.kind === 'bc557')).toHaveLength(6);
    const extraction = extractCircuit(project);
    expect(extraction.errors).toEqual([]);
    for (const [index, probe] of project.probes.entries()) {
      expect(extraction.holeToNodeId[probe.positiveHoleId!]).toBe(extraction.componentTerminalNodes[`P${index + 1}-QP`].collector);
      expect(extraction.holeToNodeId[probe.referenceHoleId!]).toBe(extraction.circuit.groundNodeId);
    }
  });

  it.each([1, 2])('retains player %i, locks out the other player, and resets for a reversed round', (player) => {
    const circuit = game();
    const other = 3 - player;
    const dark = (currents: Record<string, number>) => {
      expect(Math.abs(currents['P1-LED'])).toBeLessThan(1e-6);
      expect(Math.abs(currents['P2-LED'])).toBeLessThan(1e-6);
    };
    const winner = (currents: Record<string, number>, selected: number) => {
      expect(currents[`P${selected}-LED`]).toBeGreaterThan(0.003);
      expect(currents[`P${selected}-LED`]).toBeLessThan(0.01);
      expect(Math.abs(currents[`P${3 - selected}-LED`])).toBeLessThan(1e-6);
    };
    dark(circuit.advance().componentCurrents);
    winner(circuit.toggle(`P${player}-BUTTON`, true).componentCurrents, player);
    winner(circuit.toggle(`P${player}-BUTTON`, false).componentCurrents, player);
    winner(circuit.toggle(`P${other}-BUTTON`, true).componentCurrents, player);
    winner(circuit.toggle(`P${other}-BUTTON`, false).componentCurrents, player);
    // Persistence is regenerative feedback, not merely the capacitor fading out.
    winner(circuit.advance(1).componentCurrents, player);
    const reset = circuit.toggle('SRESET', true);
    dark(reset.componentCurrents);
    expect(reset.componentPowers.RSUPPLY1).toBeLessThan(0.125);
    expect(reset.componentPowers.RSUPPLY2).toBeLessThan(0.125);
    dark(circuit.toggle('SRESET', false).componentCurrents);
    winner(circuit.toggle(`P${other}-BUTTON`, true).componentCurrents, other);
    winner(circuit.toggle(`P${other}-BUTTON`, false).componentCurrents, other);
    winner(circuit.toggle(`P${player}-BUTTON`, true).componentCurrents, other);
  });
});
