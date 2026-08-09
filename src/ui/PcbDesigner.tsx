import { useMemo, useState } from 'react';
import { PCB_FOOTPRINTS } from '../domain/pcb/footprints';
import { padPosition, pointForViewedSide } from '../domain/pcb/geometry';
import { runPcbDrc } from '../domain/pcb/drc';
import { clearAutoRoutes, routeRemainingConnections } from '../domain/pcb/router';
import { downloadTextFile, exportBomCsv, exportKicadPcb, manufacturingSummary } from '../domain/pcb/exporters';
import type { PcbProject } from '../domain/pcb/types';

interface Props { pcb: PcbProject; onChange: (pcb: PcbProject) => void; onBack: () => void }

export function PcbDesigner({ pcb, onChange, onBack }: Props) {
  const [side, setSide] = useState<'top' | 'bottom'>('top');
  const [selectedId, setSelectedId] = useState(pcb.components[0]?.id ?? '');
  const [showRatsnest, setShowRatsnest] = useState(true);
  const drc = useMemo(() => runPcbDrc(pcb), [pcb]);
  const scale = 10;
  const flip = (point: { xMm: number; yMm: number }) => pointForViewedSide(point, pcb.board.widthMm, side);
  const selected = pcb.components.find((component) => component.id === selectedId);
  const routedNetIds = new Set(pcb.traces.map((trace) => trace.netId));
  const rotate = () => selected && onChange({ ...pcb, components: pcb.components.map((component) => component.id === selected.id ? { ...component, rotationDegrees: ((component.rotationDegrees + 90) % 360) as 0 | 90 | 180 | 270 } : component) });
  return <main className="pcb-layout">
    <aside className="pcb-tools panel">
      <div className="panel-heading"><span className="eyebrow">Single-sided THT</span><h2>PCB Designer</h2></div>
      <button onClick={onBack}>← Breadboard</button><button className="primary" onClick={() => onChange(routeRemainingConnections(pcb).pcb)}>Auto Route Remaining</button><button onClick={() => onChange(clearAutoRoutes(pcb))}>Clear auto-routes</button>
      <label>Board width (mm)<input type="number" min="20" max="300" value={pcb.board.widthMm} onChange={(event) => onChange({ ...pcb, board: { ...pcb.board, widthMm: Number(event.target.value) } })} /></label>
      <label>Board height (mm)<input type="number" min="20" max="300" value={pcb.board.heightMm} onChange={(event) => onChange({ ...pcb, board: { ...pcb.board, heightMm: Number(event.target.value) } })} /></label>
      <label><input type="checkbox" checked={showRatsnest} onChange={(event) => setShowRatsnest(event.target.checked)} /> Ratsnest</label>
      <p className="pcb-help">Pads are the solderable copper around each hole. Ratsnest lines show connections still needing bottom-copper traces.</p>
    </aside>
    <section className="pcb-stage">
      <div className="stage-toolbar"><strong>{side === 'top' ? 'Component Side' : 'Solder Side'}</strong><button onClick={() => setSide(side === 'top' ? 'bottom' : 'top')}>Flip Board</button><span>Connections: {drc.routedConnections} / {drc.totalConnections} routed</span></div>
      <div className="pcb-canvas-wrap">
        <svg className={`pcb-board pcb-${side}`} viewBox={`-3 -3 ${pcb.board.widthMm + 6} ${pcb.board.heightMm + 6}`} aria-label={`${side === 'top' ? 'Component' : 'Solder'} side PCB preview`}>
          <rect width={pcb.board.widthMm} height={pcb.board.heightMm} rx="1" className="board-substrate" />
          {showRatsnest && pcb.nets.filter((net) => !routedNetIds.has(net.id)).flatMap((net) => net.pads.slice(1).map((pad, index) => { const first = net.pads[0]; const aComponent = pcb.components.find((c) => c.id === first.componentId); const bComponent = pcb.components.find((c) => c.id === pad.componentId); const a = aComponent && padPosition(aComponent, first.padNumber); const b = bComponent && padPosition(bComponent, pad.padNumber); if (!a || !b) return null; const av = flip(a); const bv = flip(b); return <line key={`${net.id}-${index}`} x1={av.xMm} y1={av.yMm} x2={bv.xMm} y2={bv.yMm} className="ratsnest" />; }))}
          {pcb.traces.flatMap((trace) => trace.pointsMm.slice(1).map((point, index) => { const a = flip(trace.pointsMm[index]); const b = flip(point); return <line key={`${trace.id}-${index}`} x1={a.xMm} y1={a.yMm} x2={b.xMm} y2={b.yMm} className="copper-trace" style={{ strokeWidth: trace.widthMm }} />; }))}
          {pcb.components.map((component) => { const footprint = PCB_FOOTPRINTS[component.footprintId]; const p = flip(component.positionMm); return <g key={component.id} transform={`translate(${p.xMm} ${p.yMm}) rotate(${side === 'bottom' ? -component.rotationDegrees : component.rotationDegrees})`} onClick={() => setSelectedId(component.id)} className={selectedId === component.id ? 'pcb-component selected' : 'pcb-component'}>
            {side === 'top' && <><rect x={-footprint.bodySizeMm.widthMm / 2} y={-footprint.bodySizeMm.heightMm / 2} width={footprint.bodySizeMm.widthMm} height={footprint.bodySizeMm.heightMm} rx=".6" className="component-body" /><text y={1}>{component.reference}</text></>}
            {footprint.pads.map((pad) => <g key={pad.number} transform={`translate(${pad.positionMm.xMm} ${pad.positionMm.yMm})`}><circle r={pad.sizeMm.widthMm / 2} className="pcb-pad" /><circle r={pad.drillDiameterMm / 2} className="pcb-hole" /></g>)}
          </g>; })}
        </svg>
        <span className="pcb-scale">{pcb.board.widthMm} × {pcb.board.heightMm} mm · bottom copper only · {scale} px/mm preview</span>
      </div>
    </section>
    <aside className="pcb-inspector panel">
      <div className="panel-heading"><span className="eyebrow">Manufacturing</span><h2>{drc.status === 'manufacturing-checks-passed' ? 'Checks Passed' : 'Not Ready'}</h2></div>
      {selected && <section><strong>{selected.reference}</strong><small>{PCB_FOOTPRINTS[selected.footprintId]?.name}</small><button onClick={rotate}>Rotate 90°</button></section>}
      <h3>Design rule check</h3><ul className="drc-list">{drc.issues.length ? drc.issues.map((issue) => <li key={issue.id} className={issue.severity}><strong>{issue.code}</strong>{issue.message}</li>) : <li className="pass">No blocking geometry or routing errors.</li>}</ul>
      <div className="export-actions"><button onClick={() => downloadTextFile(exportKicadPcb(pcb), `${pcb.board.title}.kicad_pcb`, 'application/x-kicad-pcb')}>Export KiCad PCB</button><button onClick={() => downloadTextFile(exportBomCsv(pcb), `${pcb.board.title}-bom.csv`, 'text/csv')}>Export BOM</button><button onClick={() => downloadTextFile(manufacturingSummary(pcb), 'manufacturing-summary.txt')}>Summary</button><button disabled title="Requires a validated KiCad CLI fabrication adapter.">Manufacturing ZIP unavailable</button></div>
      <p className="pcb-safety">DRC checks board geometry and routing—not circuit safety, compliance, or function.</p>
    </aside>
  </main>;
}
