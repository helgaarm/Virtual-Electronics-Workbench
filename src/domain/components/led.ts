import {
  LED_TYPICAL_FORWARD_VOLTAGE_V,
  type LedColor,
  type LedComponent,
} from './types';

export function recolorLed(component: LedComponent, color: LedColor): LedComponent {
  return {
    ...component,
    color,
    forwardVoltageV: LED_TYPICAL_FORWARD_VOLTAGE_V[color],
  };
}
