import type { SimulationEngine, SimulationResult } from '../domain/circuit/types';
import type { WorkbenchProject } from '../domain/project';
import { extractCircuit, type CircuitExtraction } from './circuitBuilder';
import { solveDC } from './dc/solveDC';

export interface ProjectSimulation {
  extraction: CircuitExtraction;
  result: SimulationResult;
}

export const dcSimulationEngine: SimulationEngine = { solveDC };

export function simulateProject(
  project: WorkbenchProject,
  engine: SimulationEngine = dcSimulationEngine,
): ProjectSimulation {
  const extraction = extractCircuit(project);
  if (extraction.errors.length > 0) {
    return {
      extraction,
      result: {
        status: 'error',
        nodeVoltages: {},
        componentCurrents: {},
        componentPowers: {},
        warnings: extraction.warnings,
        errors: extraction.errors,
        iterations: 0,
      },
    };
  }
  const result = engine.solveDC(extraction.circuit);
  return {
    extraction,
    result: {
      ...result,
      status:
        result.status === 'error'
          ? 'error'
          : result.warnings.length + extraction.warnings.length > 0
            ? 'warning'
            : 'ok',
      warnings: [...extraction.warnings, ...result.warnings],
    },
  };
}
