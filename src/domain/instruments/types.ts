export type AnalysisInstrumentId = 'multimeter' | 'oscilloscope' | 'signal-generator';

export type OscilloscopeChannelId = 'ch1' | 'ch2';
export type OscilloscopeTerminal = 'positive' | 'reference';
export type OscilloscopeTriggerEdge = 'rising' | 'falling';
export type SignalGeneratorTerminal = 'output' | 'reference';
export type SignalWaveform = 'square' | 'sine';

export const SIGNAL_GENERATOR_COMPONENT_ID = 'signal-generator-output';
export const OSCILLOSCOPE_TIME_DIVISIONS_SECONDS = [
  0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01,
  0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5,
] as const;
export const OSCILLOSCOPE_VOLTS_PER_DIVISION = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20,
] as const;

export interface OscilloscopeChannelSettings {
  id: OscilloscopeChannelId;
  label: 'CH1' | 'CH2';
  enabled: boolean;
  voltsPerDivisionV: number;
  verticalOffsetV: number;
  positiveHoleId?: string;
  referenceHoleId?: string;
}

export interface OscilloscopeSettings {
  timePerDivisionSeconds: number;
  triggerSource: OscilloscopeChannelId;
  triggerEdge: OscilloscopeTriggerEdge;
  triggerLevelV: number;
  activeChannel: OscilloscopeChannelId;
  activeTerminal: OscilloscopeTerminal;
  channels: Record<OscilloscopeChannelId, OscilloscopeChannelSettings>;
}

export interface SignalGeneratorSettings {
  enabled: boolean;
  waveform: SignalWaveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  activeTerminal: SignalGeneratorTerminal;
  outputHoleId?: string;
  referenceHoleId?: string;
}

export function createDefaultOscilloscopeSettings(): OscilloscopeSettings {
  return {
    timePerDivisionSeconds: 0.1,
    triggerSource: 'ch1',
    triggerEdge: 'rising',
    triggerLevelV: 0,
    activeChannel: 'ch1',
    activeTerminal: 'positive',
    channels: {
      ch1: {
        id: 'ch1',
        label: 'CH1',
        enabled: true,
        voltsPerDivisionV: 1,
        verticalOffsetV: 0,
      },
      ch2: {
        id: 'ch2',
        label: 'CH2',
        enabled: true,
        voltsPerDivisionV: 1,
        verticalOffsetV: 0,
      },
    },
  };
}

export function createDefaultSignalGeneratorSettings(): SignalGeneratorSettings {
  return {
    enabled: false,
    waveform: 'square',
    frequencyHz: 1,
    amplitudeVpp: 5,
    offsetV: 2.5,
    activeTerminal: 'output',
  };
}
