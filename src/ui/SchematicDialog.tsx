import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorkbenchProject } from '../domain/project';
import { buildSchematic } from '../domain/schematic/buildSchematic';
import { canDrawConnectedWires, renderSchematicSvg, type SchematicLayout } from '../schematic/renderSvg';
import { copySchematicImage, downloadSchematic, schematicFilename, schematicPng } from './schematicExport';

export function SchematicDialog({ project, onClose }: { project: WorkbenchProject; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [layout, setLayout] = useState<SchematicLayout>('wires');
  const [zoom, setZoom] = useState('fit');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const schematic = useMemo(() => buildSchematic(project), [project]);
  const drawing = useMemo(() => renderSchematicSvg(schematic, layout), [schematic, layout]);
  const imageSource = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}`, [drawing.svg]);
  const empty = schematic.components.length === 0;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  async function exportImage(action: 'copy' | 'png') {
    setBusy(true);
    setMessage('');
    try {
      if (action === 'copy') {
        await copySchematicImage(drawing);
        setMessage('Circuit drawing copied. Paste it into your document or message.');
      } else {
        downloadSchematic(await schematicPng(drawing), schematicFilename(project.name, 'png'));
        setMessage('PNG downloaded.');
      }
    } catch (error) {
      setMessage(action === 'copy'
        ? 'Could not copy the image. Allow clipboard access in your browser, or download PNG or SVG instead.'
        : error instanceof Error ? error.message : 'Image export failed. Download SVG instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog className="schematic-dialog" ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} onKeyDown={(event) => event.stopPropagation()}>
      <header className="schematic-heading">
        <div><span className="eyebrow">From your breadboard</span><h2 id={titleId}>Circuit drawing</h2></div>
        <button type="button" onClick={onClose} aria-label="Close circuit drawing">Close ×</button>
      </header>
      <div className="schematic-toolbar">
        <label>Connections<select aria-label="Connection style" value={drawing.layout} onChange={(event) => { setLayout(event.target.value as SchematicLayout); setMessage(''); }}>
          <option value="wires" disabled={!canDrawConnectedWires(schematic)}>Connected wires</option>
          <option value="labels">Net labels</option>
        </select></label>
        <label>Zoom<select aria-label="Drawing zoom" value={zoom} onChange={(event) => setZoom(event.target.value)}>
          <option value="fit">Fit width</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option>
        </select></label>
        <div className="schematic-export-actions">
          <button type="button" className="schematic-copy" disabled={empty || busy} onClick={() => void exportImage('copy')}>Copy image</button>
          <button type="button" disabled={empty || busy} onClick={() => void exportImage('png')}>Download PNG</button>
          <button type="button" disabled={empty || busy} onClick={() => {
            downloadSchematic(new Blob([drawing.svg], { type: 'image/svg+xml;charset=utf-8' }), schematicFilename(project.name, 'svg'));
            setMessage('SVG downloaded.');
          }}>Download SVG</button>
        </div>
      </div>
      <p className="schematic-explanation">Generated from breadboard strips and jumper connections. Switches show their current position. {drawing.layout === 'labels' ? 'Pins with matching net labels are connected.' : 'Dots mark connections; crossings without dots are not connected.'}</p>
      {!canDrawConnectedWires(schematic) && <p className="schematic-explanation">This circuit uses net labels to keep the drawing readable.</p>}
      {schematic.warnings.length > 0 && <details className="schematic-warnings"><summary>{schematic.warnings.length} board connection warning(s)</summary><ul>{schematic.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
      <p className="schematic-export-status" role="status">{busy ? 'Preparing image…' : message}</p>
      <div className="schematic-preview" tabIndex={0} aria-label="Scrollable circuit drawing">
        {empty ? <p className="schematic-empty">Add a component to the breadboard to create a circuit drawing.</p> : <img
          src={imageSource}
          alt={`Circuit schematic for ${project.name}. ${schematic.components.length} components and ${schematic.nets.length} electrical nets.`}
          style={{ width: zoom === 'fit' ? '100%' : `${drawing.width * Number(zoom)}px`, maxWidth: zoom === 'fit' ? `${drawing.width}px` : 'none' }}
        />}
      </div>
    </dialog>
  );
}
