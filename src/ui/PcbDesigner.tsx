import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PCB_FOOTPRINTS } from '../domain/pcb/footprints';
import { padPosition, pointForViewedSide } from '../domain/pcb/geometry';
import { runPcbDrc } from '../domain/pcb/drc';
import { clearAutoRoutes } from '../domain/pcb/router';
import { repairCategoryForIssue } from '../domain/pcb/repair';
import type { PcbRepairWorkerRequest, PcbRepairWorkerResponse } from '../domain/pcb/repairWorkerProtocol';
import { downloadTextFile, exportBomCsv, exportKicadPcb, manufacturingSummary } from '../domain/pcb/exporters';
import type { PcbProject } from '../domain/pcb/types';

interface Props { pcb: PcbProject; onChange: (pcb: PcbProject) => void; onBack: () => void }

function polarityMark(terminalId: string): '+' | '−' | undefined {
  if (terminalId === 'positive' || terminalId === 'anode') return '+';
  if (terminalId === 'negative' || terminalId === 'cathode') return '−';
  return undefined;
}

export function PcbDesigner({ pcb, onChange, onBack }: Props) {
  const [side, setSide] = useState<'top' | 'bottom'>('top');
  const [selectedId, setSelectedId] = useState(pcb.components[0]?.id ?? '');
  const [showRatsnest, setShowRatsnest] = useState(true);
  const [showFrontCopper, setShowFrontCopper] = useState(true);
  const [showBottomCopper, setShowBottomCopper] = useState(true);
  const [showVias, setShowVias] = useState(true);
  const [repairMessage, setRepairMessage] = useState('');
  const [repairing, setRepairing] = useState(false);
  const repairWorkerRef = useRef<Worker | undefined>(undefined);
  const repairInputRef = useRef<PcbProject | undefined>(undefined);
  const repairRequestIdRef = useRef(0);
  const drc = useMemo(() => runPcbDrc(pcb), [pcb]);
  const scale = 10;
  const flip = (point: { xMm: number; yMm: number }) => pointForViewedSide(point, pcb.board.widthMm, side);
  const selected = pcb.components.find((component) => component.id === selectedId);
  const routedNetIds = new Set(drc.routedNetIds);
  const hasRepairableProblems = drc.issues.some((issue) => {
    const category = repairCategoryForIssue(issue);
    return issue.severity === 'error' && category !== 'NON_AUTOFIXABLE' && category !== 'FOOTPRINT_INTRINSIC';
  });
  const finishWorker = useCallback(() => { repairWorkerRef.current?.terminate(); repairWorkerRef.current = undefined; repairInputRef.current = undefined; setRepairing(false); }, []);
  const cancelRepair = useCallback((message = 'PCB repair cancelled.') => { finishWorker(); setRepairMessage(message); }, [finishWorker]);
  const fixAutomatically = () => {
    if (repairing) { cancelRepair(); return; }
    const worker = new Worker(new URL('../domain/pcb/repair.worker.ts', import.meta.url), { type: 'module' });
    const requestId = repairRequestIdRef.current + 1;
    repairRequestIdRef.current = requestId;
    repairWorkerRef.current = worker;
    repairInputRef.current = pcb;
    setRepairing(true);
    setRepairMessage('Repairing PCB in the background. You can cancel or continue using the page.');
    worker.onmessage = (event: MessageEvent<PcbRepairWorkerResponse>) => {
      if (event.data.requestId !== repairRequestIdRef.current) return;
      finishWorker();
      if ('error' in event.data) { setRepairMessage(`PCB repair failed: ${event.data.error}`); return; }
      const result = event.data.result;
      if (result.changed) onChange(result.pcb);
      setRepairMessage(result.appliedActions.map((action) => action.description).concat(result.diagnostics).join(' '));
    };
    worker.onerror = () => { if (repairWorkerRef.current === worker) { finishWorker(); setRepairMessage('PCB repair worker failed unexpectedly. No PCB changes were applied.'); } };
    const request: PcbRepairWorkerRequest = { requestId, pcb };
    worker.postMessage(request);
  };
  useEffect(() => () => repairWorkerRef.current?.terminate(), []);
  useEffect(() => {
    if (repairing && repairInputRef.current && repairInputRef.current !== pcb) cancelRepair('PCB changed; the previous repair was cancelled.');
  }, [cancelRepair, pcb, repairing]);
  const changeLayerMode = (layerMode: 'single' | 'double') => { if (layerMode === 'single' && (pcb.traces.some((trace) => trace.layer === 'F.Cu') || pcb.vias.length)) { setRepairMessage(`This board contains ${pcb.traces.filter((trace) => trace.layer === 'F.Cu').length} F.Cu trace(s) and ${pcb.vias.length} via(s). Clear or reroute them before converting to single-sided.`); return; } onChange({ ...pcb, board: { ...pcb.board, layerMode } }); };
  const rotate = () => selected && onChange({ ...pcb, components: pcb.components.map((component) => component.id === selected.id ? { ...component, rotationDegrees: ((component.rotationDegrees + 90) % 360) as 0 | 90 | 180 | 270 } : component) });
  return <main className="pcb-layout" aria-busy={repairing}>
    <aside className="pcb-tools panel">
      <div className="panel-heading"><span className="eyebrow">Through-hole PCB</span><h2>PCB Designer</h2></div>
      <div className="pcb-testing-warning" role="note" aria-label="PCB testing warning"><strong>Testing only</strong><span>PCB functionality is not ready for manufacturing. Do not fabricate boards from these exports.</span></div>
      <button onClick={onBack}>← Breadboard</button><button className="primary" onClick={fixAutomatically}>{repairing ? 'Cancel repair' : 'Repair PCB'}</button><button onClick={() => onChange(clearAutoRoutes(pcb))}>Clear auto-routes</button>
      <fieldset><legend>Board type</legend><label><input type="radio" name="layer-mode" checked={pcb.board.layerMode === 'single'} onChange={() => changeLayerMode('single')} /> Single-sided · B.Cu only</label><label><input type="radio" name="layer-mode" checked={pcb.board.layerMode === 'double'} onChange={() => changeLayerMode('double')} /> 2-layer · F.Cu + B.Cu</label></fieldset>
      <label>Board width (mm)<input type="number" min="20" max="300" value={pcb.board.widthMm} onChange={(event) => onChange({ ...pcb, board: { ...pcb.board, widthMm: Number(event.target.value) } })} /></label>
      <label>Board height (mm)<input type="number" min="20" max="300" value={pcb.board.heightMm} onChange={(event) => onChange({ ...pcb, board: { ...pcb.board, heightMm: Number(event.target.value) } })} /></label>
      <label><input type="checkbox" checked={showFrontCopper} onChange={(event) => setShowFrontCopper(event.target.checked)} /> F.Cu</label><label><input type="checkbox" checked={showBottomCopper} onChange={(event) => setShowBottomCopper(event.target.checked)} /> B.Cu</label><label><input type="checkbox" checked={showVias} onChange={(event) => setShowVias(event.target.checked)} /> Vias</label><label><input type="checkbox" checked={showRatsnest} onChange={(event) => setShowRatsnest(event.target.checked)} /> Ratsnest</label>
      <p className="pcb-help">Assembly marks are printed on the component side: +/− show polarity, and the dot and notch identify pin 1. Pads are plated through holes. Dashed ratsnest lines are missing connections, not copper.</p>
    </aside>
    <section className="pcb-stage">
      <div className="stage-toolbar"><strong>{side === 'top' ? 'Component Side' : 'Solder Side'}</strong><button onClick={() => setSide(side === 'top' ? 'bottom' : 'top')}>Flip Board</button><span>Connections: {drc.routedConnections} / {drc.totalConnections} routed</span></div>
      <div className="pcb-canvas-wrap">
        <svg className={`pcb-board pcb-${side}`} viewBox={`-3 -3 ${pcb.board.widthMm + 6} ${pcb.board.heightMm + 6}`} aria-label={`${side === 'top' ? 'Component' : 'Solder'} side PCB preview`}>
          <rect width={pcb.board.widthMm} height={pcb.board.heightMm} rx="1" className="board-substrate" />
          {showRatsnest && pcb.nets.filter((net) => !routedNetIds.has(net.id)).flatMap((net) => net.pads.slice(1).map((pad, index) => { const first = net.pads[0]; const aComponent = pcb.components.find((c) => c.id === first.componentId); const bComponent = pcb.components.find((c) => c.id === pad.componentId); const a = aComponent && padPosition(aComponent, first.padNumber); const b = bComponent && padPosition(bComponent, pad.padNumber); if (!a || !b) return null; const av = flip(a); const bv = flip(b); return <line key={`${net.id}-${index}`} x1={av.xMm} y1={av.yMm} x2={bv.xMm} y2={bv.yMm} className="ratsnest" />; }))}
          {pcb.traces.filter((trace) => trace.layer === 'F.Cu' ? showFrontCopper : showBottomCopper).flatMap((trace) => trace.pointsMm.slice(1).map((point, index) => { const a = flip(trace.pointsMm[index]); const b = flip(point); return <line key={`${trace.id}-${index}`} x1={a.xMm} y1={a.yMm} x2={b.xMm} y2={b.yMm} className={`copper-trace copper-${trace.layer === 'F.Cu' ? 'front' : 'bottom'}`} style={{ strokeWidth: trace.widthMm, opacity: side === (trace.layer === 'F.Cu' ? 'top' : 'bottom') ? 1 : .48 }} />; }))}
          {showVias && pcb.vias.map((via) => { const p = flip(via.positionMm); return <g key={via.id} className="pcb-via"><circle cx={p.xMm} cy={p.yMm} r={via.copperDiameterMm / 2} /><circle cx={p.xMm} cy={p.yMm} r={via.drillDiameterMm / 2} className="pcb-hole" /></g>; })}
          {pcb.components.map((component) => { const footprint = PCB_FOOTPRINTS[component.footprintId]; const p = flip(component.positionMm); return <g key={component.id} transform={`translate(${p.xMm} ${p.yMm}) rotate(${side === 'bottom' ? -component.rotationDegrees : component.rotationDegrees})`} onClick={() => setSelectedId(component.id)} className={selectedId === component.id ? 'pcb-component selected' : 'pcb-component'}>
            {side === 'top' && <><rect x={-footprint.bodySizeMm.widthMm / 2} y={-footprint.bodySizeMm.heightMm / 2} width={footprint.bodySizeMm.widthMm} height={footprint.bodySizeMm.heightMm} rx=".6" className="component-body" /><text y={1}>{component.reference}</text>{footprint.pin1Marked && <><path className="pcb-orientation-notch" d={`M -1.3 ${-footprint.bodySizeMm.heightMm / 2} A 1.3 1.3 0 0 0 1.3 ${-footprint.bodySizeMm.heightMm / 2}`} /><circle className="pcb-pin-one-mark" cx={footprint.pads[0]?.positionMm.xMm} cy={footprint.pads[0]?.positionMm.yMm} r=".45" /></>}</>}
            {footprint.pads.map((pad) => <g key={pad.number} transform={`translate(${pad.positionMm.xMm} ${pad.positionMm.yMm})`}><circle r={pad.sizeMm.widthMm / 2} className="pcb-pad" /><circle r={pad.drillDiameterMm / 2} className="pcb-hole" /></g>)}
            {side === 'top' && footprint.pads.map((pad) => { const mark = polarityMark(pad.terminalId); if (!mark) return null; const offsetMm = Math.max(pad.sizeMm.heightMm / 2 + .9, 1.7); return <text key={`polarity-${pad.number}`} className={`pcb-polarity-mark ${mark === '+' ? 'positive' : 'negative'}`} x={pad.positionMm.xMm} y={pad.positionMm.yMm - offsetMm}>{mark}</text>; })}
          </g>; })}
        </svg>
        <span className="pcb-scale">{pcb.board.widthMm} × {pcb.board.heightMm} mm · {pcb.board.layerMode === 'double' ? 'F.Cu + B.Cu' : 'B.Cu only'} · {scale} px/mm preview</span>
      </div>
    </section>
    <aside className="pcb-inspector panel">
      <div className="panel-heading"><span className="eyebrow">Manufacturing</span><h2>{drc.status === 'manufacturing-checks-passed' ? 'Checks Passed' : 'Not Ready'}</h2></div>
      {selected && <section><strong>{selected.reference}</strong><small>{PCB_FOOTPRINTS[selected.footprintId]?.name}</small><button onClick={rotate}>Rotate 90°</button></section>}
      <h3>Design rule check</h3><ul className="drc-list">{drc.issues.length ? drc.issues.map((issue) => <li key={issue.id} className={issue.severity}><strong>{issue.code}</strong>{issue.message}</li>) : <li className="pass">No blocking geometry or routing errors.</li>}</ul>
      {hasRepairableProblems && <button className="primary pcb-fix-button" onClick={fixAutomatically}>{repairing ? 'Cancel repair' : 'Fix automatically'}</button>}{repairMessage && <p className="pcb-repair-result" role="status">{repairMessage}</p>}
      <div className="export-actions"><button onClick={() => downloadTextFile(exportKicadPcb(pcb), `${pcb.board.title}.kicad_pcb`, 'application/x-kicad-pcb')}>Export KiCad PCB</button><button onClick={() => downloadTextFile(exportBomCsv(pcb), `${pcb.board.title}-bom.csv`, 'text/csv')}>Export BOM</button><button onClick={() => downloadTextFile(manufacturingSummary(pcb), 'manufacturing-summary.txt')}>Summary</button><button disabled title="Requires a validated KiCad CLI fabrication adapter.">Manufacturing ZIP unavailable</button></div>
      <p className="pcb-safety">DRC checks board geometry and routing—not circuit safety, compliance, or function.</p>
    </aside>
  </main>;
}
