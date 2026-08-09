import { PCB_FOOTPRINTS } from './footprints';
import { runPcbDrc } from './drc';
import type { PcbProject } from './types';

function cleanName(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'pcb'; }
function escapeText(value: string): string { return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"'); }

export function exportKicadPcb(pcb: PcbProject): string {
  const netNumbers = new Map(pcb.nets.map((net, index) => [net.id, index + 1]));
  const padNets = new Map(pcb.nets.flatMap((net) => net.pads.map((pad) => [`${pad.componentId}:${pad.padNumber}`, net] as const)));
  const lines = ['(kicad_pcb (version 20240108) (generator virtual-electronics-workbench)', '  (general (thickness 1.6))', '  (paper "A4")', '  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (44 "Edge.Cuts" user))', '  (setup (pad_to_mask_clearance 0))'];
  for (const net of pcb.nets) lines.push(`  (net ${netNumbers.get(net.id)} "${escapeText(net.name)}")`);
  for (const component of pcb.components) {
    const footprint = PCB_FOOTPRINTS[component.footprintId]; if (!footprint) continue;
    lines.push(`  (footprint "VEW:${escapeText(footprint.id)}" (layer "F.Cu") (at ${component.positionMm.xMm} ${component.positionMm.yMm} ${component.rotationDegrees})`);
    lines.push(`    (property "Reference" "${escapeText(component.reference)}" (at 0 -4 0) (layer "F.SilkS"))`);
    lines.push(`    (property "Value" "${escapeText(component.value)}" (at 0 4 0) (layer "F.Fab") hide)`);
    lines.push(`    (fp_rect (start ${-footprint.bodySizeMm.widthMm / 2} ${-footprint.bodySizeMm.heightMm / 2}) (end ${footprint.bodySizeMm.widthMm / 2} ${footprint.bodySizeMm.heightMm / 2}) (stroke (width 0.25) (type default)) (fill none) (layer "F.SilkS"))`);
    for (const pad of footprint.pads) {
      const net = padNets.get(`${component.id}:${pad.number}`); const netClause = net ? ` (net ${netNumbers.get(net.id)} "${escapeText(net.name)}")` : '';
      lines.push(`    (pad "${pad.number}" thru_hole ${pad.shape === 'rect' ? 'rect' : 'circle'} (at ${pad.positionMm.xMm} ${pad.positionMm.yMm}) (size ${pad.sizeMm.widthMm} ${pad.sizeMm.heightMm}) (drill ${pad.drillDiameterMm}) (layers "*.Cu" "*.Mask")${netClause})`);
    }
    lines.push('  )');
  }
  for (const trace of pcb.traces) for (let index = 1; index < trace.pointsMm.length; index += 1) { const a = trace.pointsMm[index - 1]; const b = trace.pointsMm[index]; lines.push(`  (segment (start ${a.xMm} ${a.yMm}) (end ${b.xMm} ${b.yMm}) (width ${trace.widthMm}) (layer "B.Cu") (net ${netNumbers.get(trace.netId) ?? 0}))`); }
  const w = pcb.board.widthMm; const h = pcb.board.heightMm;
  lines.push(`  (gr_rect (start 0 0) (end ${w} ${h}) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))`, ')');
  return `${lines.join('\n')}\n`;
}

export function exportBomCsv(pcb: PcbProject): string {
  const rows = [['Reference', 'Component', 'Value', 'Package', 'Quantity'], ...pcb.components.map((component) => [component.reference, component.sourceComponentId, component.value, PCB_FOOTPRINTS[component.footprintId]?.name ?? component.footprintId, '1']), ...pcb.jumpers.map((jumper) => [jumper.reference, 'Wire jumper', 'Insulated wire', 'THT jumper', '1'])];
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
}

export function manufacturingSummary(pcb: PcbProject): string {
  const drc = runPcbDrc(pcb); const holes = pcb.components.reduce((sum, component) => sum + (PCB_FOOTPRINTS[component.footprintId]?.pads.length ?? 0), 0) + pcb.mountingHoles.length + pcb.jumpers.length * 2;
  return [`Board: ${pcb.board.widthMm} × ${pcb.board.heightMm} mm`, 'Layers: 1 copper layer', 'Copper: Bottom', `Components: ${pcb.components.length}`, `Through holes: ${holes}`, `Minimum trace: ${pcb.rules.minimumTrackWidthMm.toFixed(2)} mm`, `Minimum clearance: ${pcb.rules.copperClearanceMm.toFixed(2)} mm`, `Jumpers: ${pcb.jumpers.length}`, `DRC: ${drc.status === 'manufacturing-checks-passed' ? 'Passed' : 'Not passed'}`].join('\n');
}

export function downloadTextFile(contents: string, filename: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = cleanName(filename); anchor.click(); URL.revokeObjectURL(url);
}

export function exportReadiness(pcb: PcbProject): { ready: boolean; reason?: string } {
  const result = runPcbDrc(pcb); return result.status === 'manufacturing-checks-passed' ? { ready: true } : { ready: false, reason: result.issues.find((issue) => issue.severity === 'error')?.message ?? 'Manufacturing checks have not passed.' };
}
