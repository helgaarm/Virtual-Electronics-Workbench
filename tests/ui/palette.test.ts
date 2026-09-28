// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentKind } from '../../src/domain/components/types';
import { componentDisplayName } from '../../src/domain/components/types';
import { Palette } from '../../src/ui/Palette';
import { getPaletteFolders } from '../../src/ui/paletteCatalog';

let container: HTMLDivElement;
let root: Root;
const onAdd = vi.fn<(kind: ComponentKind) => void>();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onAdd.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Palette, { onAdd })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function folderButton(name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
    .find((element) => element.textContent?.includes(name));
  if (!button) throw new Error(`Missing folder: ${name}`);
  return button;
}

function visibleParts(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.palette-list:not([hidden]) .part-card')];
}

async function search(query: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    // Use the native setter so React observes the same change as a user's input.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('component folders', () => {
  it('starts compact and opens and closes folders independently without adding a part', async () => {
    expect(visibleParts()).toHaveLength(0);
    const passive = folderButton('Passive components');
    const power = folderButton('Power & wiring');
    await act(async () => passive.click());
    await act(async () => power.click());
    expect(passive.getAttribute('aria-expanded')).toBe('true');
    expect(power.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(passive.getAttribute('aria-controls')!)?.hidden).toBe(false);
    expect(visibleParts().map((part) => part.title)).toEqual(expect.arrayContaining(['Add Resistor', 'Add Ground']));

    await act(async () => passive.click());
    expect(passive.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(passive.getAttribute('aria-controls')!)?.hidden).toBe(true);
    expect(power.getAttribute('aria-expanded')).toBe('true');
    expect(visibleParts().map((part) => part.title)).not.toContain('Add Resistor');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps every component available exactly once and passes its kind when added', async () => {
    for (const button of container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')) {
      await act(async () => button.click());
    }
    const kinds = getPaletteFolders('').flatMap((folder) => folder.parts.map((part) => part.kind));
    expect(visibleParts()).toHaveLength(kinds.length);
    expect(new Set(visibleParts().map((part) => part.title)).size).toBe(kinds.length);
    for (const kind of kinds) {
      const button = visibleParts().find((part) => part.title === `Add ${componentDisplayName(kind)}`)!;
      await act(async () => button.click());
      expect(onAdd).toHaveBeenLastCalledWith(kind);
    }
    expect(onAdd).toHaveBeenCalledTimes(kinds.length);
  });

  it('finds parts in closed folders, allows adding them, and restores browsing after clearing', async () => {
    await act(async () => folderButton('Passive components').click());
    await search('  555  ');
    expect(visibleParts().map((part) => part.title)).toEqual(['Add NE555N timer']);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('1 component found');
    expect(container.querySelectorAll('.palette-folder')).toHaveLength(1);
    await act(async () => visibleParts()[0].click());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('ne555');

    const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear component search"]')!;
    await act(async () => clear.click());
    expect(folderButton('Passive components').getAttribute('aria-expanded')).toBe('true');
    expect(folderButton('Integrated circuits').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect(visibleParts().map((part) => part.title)).toContain('Add Resistor');
  });

  it('shows a useful empty state and recovers when the query changes', async () => {
    await search('not-a-component');
    expect(visibleParts()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('0 components found');
    expect(container.textContent).toContain('No matching components');
    await search('DIP-8');
    expect(visibleParts().map((part) => part.title)).toEqual([
      'Add NE555N timer', 'Add ATtiny85 microcontroller', 'Add LM358B dual op-amp',
    ]);
    expect(container.textContent).not.toContain('No matching components');
  });
});

describe('component search', () => {
  it('matches folder names, descriptions, kinds, and multiple case-insensitive terms', () => {
    const kinds = (query: string) => getPaletteFolders(query).flatMap((folder) => folder.parts.map((part) => part.kind));
    expect(kinds('Passive components')).toEqual(['heater-resistor', 'resistor', 'capacitor', 'potentiometer']);
    expect(kinds('  nPn   to-92 ')).toEqual(['bc547', '2n3904']);
    expect(kinds('potentiometer')).toEqual(['potentiometer']);
    expect(kinds('transistors MOSFET')).toEqual(['2n7000']);
    expect(kinds('   ')).toEqual(kinds(''));
  });
});
