// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../../src/domain/starterProjects';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import { verifyWiring } from '../helpers/schematicWiring';
import { windSketch } from '../../src/ui/windSketch';

describe('wind starter drawing and export', () => {
  it.each(['wind-constant-power', 'wind-constant-temperature'] as const)('draws all actual connections for %s', id => {
    verifyWiring(buildSchematic(createStarterProject(id)));
  }, 20000);
  it('exports the complete selected controller with user parameters and measured calibration', () => {
    const project = createStarterProject('wind-constant-temperature');
    const nano = project.components.find(c => c.kind === 'arduino-nano')!;
    if (nano.kind !== 'arduino-nano') throw new Error('Missing Nano');
    nano.windSettings!.betaK = 3977; nano.windSettings!.targetDeltaC = 15;
    nano.windSettings!.calibration = [{ speedMps: 0, signal: 0.07 }, { speedMps: 2, signal: 0.12 }];
    const code = windSketch(nano);
    expect(code).toContain('const bool CONSTANT_TEMPERATURE = true;');
    expect(code).toContain('const float NTC_BETA_K = 3977.0f;');
    expect(code).toContain('const float TARGET_DELTA_C = 15.0f;');
    expect(code).toContain('const bool CALIBRATION_ENTERED = true;');
    expect(code).toContain('{2.000000f, 0.120000f}');
    expect(code).toContain('void setup()'); expect(code).toContain('void loop()');
    expect(code).toContain('Wire.endTransmission()');
  });
});
