export type AnalysisInstrumentId =
  | 'multimeter'
  | 'oscilloscope'
  | 'signal-generator'
  | 'frequency-counter'
  | 'logic-analyser';

export type OscilloscopeChannelId = 'ch1' | 'ch2';
export type OscilloscopeTerminal = 'positive' | 'reference';
export type OscilloscopeTriggerEdge = 'rising' | 'falling';
export type SignalGeneratorTerminal = 'output' | 'reference';
export type SignalWaveform = 'square' | 'sine';
export type FrequencyCounterTerminal = 'input' | 'reference';
export type LogicAnalyserChannelId =
  | 'ch1' | 'ch2' | 'ch3' | 'ch4'
  | 'ch5' | 'ch6' | 'ch7' | 'ch8';
export type LogicAnalyserTerminal = 'input' | 'reference';

export const SIGNAL_GENERATOR_COMPONENT_ID = 'signal-generator-output';
export const OSCILLOSCOPE_TIME_DIVISIONS_SECONDS = [
  0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01,
  0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5,
] as const;
export const OSCILLOSCOPE_VOLTS_PER_DIVISION = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20,
] as const;
export const LOGIC_ANALYSER_SAMPLE_RATES_HZ = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000] as const;
export const LOGIC_ANALYSER_TIME_DIVISIONS_SECONDS = OSCILLOSCOPE_TIME_DIVISIONS_SECONDS;

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

export interface FrequencyCounterSettings {
  activeTerminal: FrequencyCounterTerminal;
  triggerEdge: OscilloscopeTriggerEdge;
  triggerLevelV: number;
  inputHoleId?: string;
  referenceHoleId?: string;
}

export interface LogicAnalyserChannelSettings {
  id: LogicAnalyserChannelId;
  label: string;
  enabled: boolean;
  inputHoleId?: string;
}

export interface LogicAnalyserSettings {
  sampleRateHz: number;
  timePerDivisionSeconds: number;
  triggerEnabled: boolean;
  triggerSource: LogicAnalyserChannelId;
  triggerEdge: OscilloscopeTriggerEdge;
  lowThresholdV: number;
  highThresholdV: number;
  activeChannel: LogicAnalyserChannelId;
  activeTerminal: LogicAnalyserTerminal;
  referenceHoleId?: string;
  channels: Record<LogicAnalyserChannelId, LogicAnalyserChannelSettings>;
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

export function createDefaultFrequencyCounterSettings(): FrequencyCounterSettings {
  return {
    activeTerminal: 'input',
    triggerEdge: 'rising',
    triggerLevelV: 2.5,
  };
}

export function createDefaultLogicAnalyserSettings(): LogicAnalyserSettings {
  const channel = (number: number): LogicAnalyserChannelSettings => ({
    id: `ch${number}` as LogicAnalyserChannelId,
    label: `D${number - 1}`,
    enabled: number <= 4,
  });
  return {
    sampleRateHz: 1_000,
    timePerDivisionSeconds: 0.01,
    triggerEnabled: true,
    triggerSource: 'ch1',
    triggerEdge: 'rising',
    lowThresholdV: 0.8,
    highThresholdV: 2,
    activeChannel: 'ch1',
    activeTerminal: 'input',
    channels: {
      ch1: channel(1), ch2: channel(2), ch3: channel(3), ch4: channel(4),
      ch5: channel(5), ch6: channel(6), ch7: channel(7), ch8: channel(8),
    },
  };
}
