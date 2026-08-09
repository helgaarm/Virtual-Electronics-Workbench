import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/domain/project';
import { instrumentSampleNodeIds } from '../../src/state/instrumentSelectors';

describe('instrument capture selectors', () => {
  it('deduplicates every connected time-domain instrument node', () => {
    const project = createEmptyProject();
    project.oscilloscope.channels.ch1.positiveHoleId = 'board:A1';
    project.oscilloscope.channels.ch1.referenceHoleId = 'board:A2';
    project.frequencyCounter.inputHoleId = 'board:A1';
    project.frequencyCounter.referenceHoleId = 'board:A2';
    project.logicAnalyser.referenceHoleId = 'board:A2';
    project.logicAnalyser.channels.ch1.inputHoleId = 'board:A3';
    expect(instrumentSampleNodeIds(project, {
      'board:A1': 'node-1',
      'board:A2': 'node-0',
      'board:A3': 'node-2',
    })).toEqual(['node-1', 'node-0', 'node-2']);
  });
});
