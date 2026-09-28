import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import type { ArduinoNanoComponent } from '../domain/components/types';
import { NANO_PIN_NAMES, NANO_PROGRAM_IDS, NANO_PROGRAMS } from '../domain/components/arduinoNano';
import { MAX_NANO_HEX_CHARACTERS, parseNanoHex } from '../domain/components/nanoFirmware';
import { WindSensorControls } from './WindSensorControls';
import type { DigitalState } from '../domain/circuit/digital';
import { windSketch, downloadWindText } from './windSketch';

export function NanoProgram({ component, serialOutput = '', onUpdate, windReadings }: { component: ArduinoNanoComponent; serialOutput?: string; onUpdate: (component: ArduinoNanoComponent) => void; windReadings?: DigitalState['nanos'][string]['wind'] }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const latest = useRef(component);
  useEffect(() => { latest.current = component; }, [component]);
  useEffect(() => () => { request.current++; }, []);
  const id = useId();
  const program = component.programId === 'custom' ? undefined : NANO_PROGRAMS[component.programId];
  const sketch = component.programId.startsWith('wind-') ? windSketch(component) : program?.sketch ?? '';

  async function loadFirmware(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const requestId = ++request.current;
    setError(''); setLoading(true);
    try {
      if (file.size > MAX_NANO_HEX_CHARACTERS) throw new Error('File too large. Export a classic Nano ATmega328P sketch.');
      const hex = await file.text();
      if (request.current !== requestId) return;
      const parsed = parseNanoHex(hex);
      if (!parsed.ok) throw new Error(parsed.error);
      onUpdate({ ...latest.current, programId: 'custom', firmware: { name: file.name.slice(0, 80), hex } });
      setCopyStatus(`Loaded ${parsed.byteCount.toLocaleString()} bytes. Custom firmware starts from reset.`);
    } catch (cause) {
      if (request.current === requestId) setError(cause instanceof Error ? cause.message : 'Could not read the firmware file.');
    } finally { if (request.current === requestId) setLoading(false); }
  }

  return <section className="inspector-section nano-program">
    <div className="section-label">Classic Arduino Nano</div>
    <label htmlFor={`${id}-program`}>Program</label>
    <select id={`${id}-program`} disabled={loading} value={component.programId} onChange={(event) => { request.current++; setError(''); setCopyStatus(''); onUpdate({ ...component, programId: event.target.value as ArduinoNanoComponent['programId'], ...(component.windSettings ? { windSettings: { ...component.windSettings, calibration: [] } } : {}) }); }}>
      {NANO_PROGRAM_IDS.map((programId) => <option key={programId} value={programId}>{NANO_PROGRAMS[programId].name}</option>)}
      <option value="custom" disabled={!component.firmware}>Custom firmware{component.firmware ? ` · ${component.firmware.name}` : ' (load .hex)'}</option>
    </select>
    <label className="nano-firmware-label" htmlFor={`${id}-file`}>Load compiled sketch (.hex)</label>
    <input id={`${id}-file`} type="file" accept=".hex" disabled={loading} onChange={(event) => { void loadFirmware(event); }} aria-describedby={`${id}-help`} />
    <small id={`${id}-help`}>In Arduino IDE choose Arduino Nano / ATmega328P, then Sketch → Export Compiled Binary. Load the .hex file without “with_bootloader”. USB power follows the workbench power switch.</small>
    {loading && <p role="status">Reading firmware…</p>}
    {error && <p role="alert">{error}</p>}
    <span role="status">{copyStatus}</span>
    {component.programId.startsWith('wind-') && <WindSensorControls key={component.programId} component={component} onUpdate={onUpdate} readings={windReadings} />}
    {program ? <>
      <p>{program.description}</p>
      <details><summary>View equivalent Arduino sketch</summary>
        <pre tabIndex={0}><code>{sketch}</code></pre>
        <button onClick={async () => { try { await navigator.clipboard.writeText(sketch); setCopyStatus('Sketch copied.'); } catch { setCopyStatus('Copy unavailable. Select and copy the sketch above.'); } }}>Copy sketch</button>
        {component.programId.startsWith('wind-') && <button onClick={() => downloadWindText('WindSensor.ino', sketch)}>Download Arduino sketch</button>}
      </details>
    </> : <>
      <p>Running {component.firmware?.name}. Connect your circuit to the pins used by your sketch. Use a simulation step of 5 ms or less.</p>
      <details><summary>Serial output</summary><pre tabIndex={0} aria-label="Nano serial output">{serialOutput || 'No Serial.print output yet.'}</pre><small>Last 4,096 characters. Serial input and UART wiring are not simulated.</small></details>
      <details><summary>Supported features</summary><small>AVR instructions at 16 MHz, GPIO, pull-ups, timers 0/1/2, PWM, millis/delay, single ADC conversions, interrupts, EEPROM and I²C writes to modeled OLEDs. Digital inputs are sampled every 50 µs. Hardware SPI, watchdog, sleep and clock changes report errors. I²C uses byte transactions; bus waveforms and arbitrary peripherals are not modeled.</small></details>
    </>}
    <details><summary>Pin connections</summary>
      <p>Connect jumpers to a free hole in the same breadboard strip as the desired pin. Unanchor and drag the Nano to move all pins together.</p>
      <dl>{NANO_PIN_NAMES.map((name, i) => <div key={i}><dt>{name}</dt><dd>{component.terminalHoleIds[`pin${i + 1}`].split(':').at(-1)}</dd></div>)}</dl>
    </details>
  </section>;
}
