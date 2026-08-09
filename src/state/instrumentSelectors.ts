import type { WorkbenchProject } from '../domain/project';

export interface InstrumentProbeMarker {
  id: string;
  label: string;
  positiveHoleId?: string;
  referenceHoleId?: string;
  positiveLabel: string;
  referenceLabel: string;
  positiveColor: string;
  referenceColor: string;
}

export function instrumentProbeMarkers(project: WorkbenchProject): InstrumentProbeMarker[] {
  return [
    ...project.probes.map((probe) => ({
      id: probe.id,
      label: probe.label,
      positiveHoleId: probe.positiveHoleId,
      referenceHoleId: probe.referenceHoleId,
      positiveLabel: '+',
      referenceLabel: 'COM',
      positiveColor: '#2f82c4',
      referenceColor: '#252b2b',
    })),
    ...Object.values(project.oscilloscope.channels).map((channel) => ({
      id: `oscilloscope-${channel.id}`,
      label: channel.label,
      positiveHoleId: channel.positiveHoleId,
      referenceHoleId: channel.referenceHoleId,
      positiveLabel: channel.label,
      referenceLabel: 'GND',
      positiveColor: channel.id === 'ch1' ? '#e3ad31' : '#45a9d6',
      referenceColor: '#252b2b',
    })),
    {
      id: 'signal-generator',
      label: 'GEN',
      positiveHoleId: project.signalGenerator.outputHoleId,
      referenceHoleId: project.signalGenerator.referenceHoleId,
      positiveLabel: 'OUT',
      referenceLabel: 'COM',
      positiveColor: '#d05c4f',
      referenceColor: '#252b2b',
    },
  ];
}

export function activeInstrumentMarkerId(project: WorkbenchProject): string | undefined {
  if (project.analysis.activeInstrument === 'multimeter') {
    return project.analysis.selectedProbeId ?? project.probes[0]?.id;
  }
  if (project.analysis.activeInstrument === 'oscilloscope') {
    return `oscilloscope-${project.oscilloscope.activeChannel}`;
  }
  return 'signal-generator';
}

export function oscilloscopeSampleNodeIds(
  project: WorkbenchProject,
  holeToNodeId: Readonly<Record<string, string>>,
): string[] {
  return [...new Set(
    Object.values(project.oscilloscope.channels).flatMap((channel) => [
      channel.positiveHoleId ? holeToNodeId[channel.positiveHoleId] : undefined,
      channel.referenceHoleId ? holeToNodeId[channel.referenceHoleId] : undefined,
    ]).filter((nodeId): nodeId is string => Boolean(nodeId)),
  )];
}
