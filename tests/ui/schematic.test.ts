// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../src/domain/project';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import { createStarterProject } from '../../src/domain/starterProjects';
import { renderSchematicSvg } from '../../src/schematic/renderSvg';
import { SchematicDialog } from '../../src/ui/SchematicDialog';
import { schematicFilename, schematicPngSize } from '../../src/ui/schematicExport';
import * as exporter from '../../src/ui/schematicExport';

describe('schematic SVG and export bounds', () => {
  it('exports standalone, deterministic SVG and treats project names and labels as text', () => {
    const project = createStarterProject('voltage-divider');
    project.name = 'Circuit <script>alert("x")</script> & test';
    project.components[0].label = '</text><image href="https://invalid.example" onload="alert(1)"/>';
    project.components[0].id = '" onclick="alert(1)';
    const model = buildSchematic(project);
    for (const layout of ['wires', 'labels'] as const) {
      const drawing = renderSchematicSvg(model, layout);
      const document = new DOMParser().parseFromString(drawing.svg, 'image/svg+xml');
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.querySelector('script, image, foreignObject, [onclick], [onload]')).toBeNull();
      expect(document.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(document.querySelector('title')?.textContent).toContain(project.name);
      expect(document.querySelectorAll('[data-component-id]')).toHaveLength(model.components.length);
      expect(document.querySelectorAll('[data-net]')).toHaveLength(model.components.reduce((count, component) => count + component.pins.length, 0));
      expect(renderSchematicSvg(model, layout)).toEqual(drawing);
    }
  });

  it('constrains raster export memory and sanitizes filenames', () => {
    for (const [width, height] of [[1240, 500], [1240, 60_000], [30_000, 20_000]]) {
      const size = schematicPngSize({ width, height });
      expect(size.width).toBeLessThanOrEqual(8192);
      expect(size.height).toBeLessThanOrEqual(8192);
      expect(size.width * size.height).toBeLessThanOrEqual(16_000_000);
    }
    expect(schematicFilename('../Board:<test>\\name', 'svg')).not.toMatch(/[<>:"/\\|?*]/);
    expect(schematicFilename('', 'png')).toBe('circuit-schematic.png');
  });
});

describe('circuit drawing dialog', () => {
  let container: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;
  const onClose = vi.fn();

  // jsdom has the dialog element but does not implement the browser's modal methods.
  beforeAll(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
      close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
    });
  });
  afterAll(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onClose.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    trigger.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function button(label: string) {
    const result = [...container.querySelectorAll('button')].find((element) => element.textContent === label);
    if (!result) throw new Error(`Missing ${label}`);
    return result;
  }

  it('shows the current circuit and regenerates after an edit without changing the project', async () => {
    const project = createStarterProject('voltage-divider');
    const before = JSON.stringify(project);
    await act(async () => root.render(createElement(SchematicDialog, { project, onClose })));
    expect(container.querySelector('dialog')?.open).toBe(true);
    const first = container.querySelector('img')!.src;
    expect(decodeURIComponent(first)).toContain('Voltage divider');
    expect(JSON.stringify(project)).toBe(before);
    await act(async () => root.render(createElement(SchematicDialog, { project: { ...project, name: 'Renamed circuit' }, onClose })));
    expect(container.querySelector('img')!.src).not.toBe(first);
    expect(decodeURIComponent(container.querySelector('img')!.src)).toContain('Renamed circuit');
    await act(async () => button('Close ×').click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables exports for an empty board and leaves close available', async () => {
    await act(async () => root.render(createElement(SchematicDialog, { project: createEmptyProject(), onClose })));
    expect(container.textContent).toContain('Add a component');
    expect(button('Copy image').disabled).toBe(true);
    expect(button('Download SVG').disabled).toBe(true);
    expect(button('Download PNG').disabled).toBe(true);
    expect(button('Close ×').disabled).toBe(false);
  });

  it('copies the current drawing, downloads both formats, and reports clipboard denial', async () => {
    const copy = vi.spyOn(exporter, 'copySchematicImage').mockResolvedValue(undefined);
    const download = vi.spyOn(exporter, 'downloadSchematic').mockImplementation(() => undefined);
    const png = vi.spyOn(exporter, 'schematicPng').mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    await act(async () => root.render(createElement(SchematicDialog, { project: createStarterProject('voltage-divider'), onClose })));
    await act(async () => button('Copy image').click());
    expect(copy).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('copied');
    await act(async () => button('Download PNG').click());
    expect(png).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][1]).toBe('Voltage divider-schematic.png');
    await act(async () => button('Download SVG').click());
    expect(download.mock.calls[1][0].type).toBe('image/svg+xml;charset=utf-8');
    expect(download.mock.calls[1][1]).toBe('Voltage divider-schematic.svg');
    copy.mockRejectedValueOnce(new Error('NotAllowedError'));
    await act(async () => button('Copy image').click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain('download PNG or SVG');
    expect(button('Download SVG').disabled).toBe(false);
  });

  it('isolates board shortcuts, permits Escape cancellation, and restores focus', async () => {
    const shortcut = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      await act(async () => root.render(createElement(SchematicDialog, { project: createStarterProject('switched-led'), onClose })));
      await act(async () => button('Copy image').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
      expect(shortcut).not.toHaveBeenCalled();
      await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel')));
      expect(onClose).toHaveBeenCalledOnce();
      await act(async () => root.render(null));
      expect(document.activeElement).toBe(trigger);
    } finally {
      window.removeEventListener('keydown', shortcut);
    }
  });
});
