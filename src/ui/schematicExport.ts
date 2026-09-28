import type { SchematicDrawing } from '../schematic/renderSvg';

export function schematicFilename(title: string, extension: 'svg' | 'png'): string {
  const name = Array.from(title).filter((character) => character.charCodeAt(0) >= 32).join('')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100);
  return `${name || 'circuit'}-schematic.${extension}`;
}

export function downloadSchematic(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function schematicPngSize(drawing: Pick<SchematicDrawing, 'width' | 'height'>) {
  // Limit canvas memory to 16 million pixels and 8192 pixels on either side.
  const scale = Math.min(2, 8192 / drawing.width, 8192 / drawing.height, Math.sqrt(16_000_000 / (drawing.width * drawing.height)));
  return { width: Math.max(1, Math.floor(drawing.width * scale)), height: Math.max(1, Math.floor(drawing.height * scale)) };
}

export async function schematicPng(drawing: SchematicDrawing): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([drawing.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not create the image. Download SVG instead.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const size = schematicPngSize(drawing);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable. Download SVG instead.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the image. Download SVG instead.'));
    }, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copySchematicImage(drawing: SchematicDrawing): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image copying is unavailable in this browser. Download PNG or SVG instead.');
  }
  const png = schematicPng(drawing);
  // Some browsers reject clipboard access before consuming the image promise.
  void png.catch(() => undefined);
  // Start writing during the click gesture, including in browsers requiring transient activation.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
