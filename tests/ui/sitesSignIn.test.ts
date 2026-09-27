// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SitesSignIn } from '../../src/ui/SitesSignIn';

vi.mock('../../src/App', () => ({ default: ({ accountEmail }: { accountEmail?: string }) => createElement('div', { 'data-workbench': true }, accountEmail ?? 'gateway') }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const render = () => act(async () => root.render(createElement(SitesSignIn)));
async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }

describe('Sites email sign-in boundary', () => {
  it('does not mount the workbench on missing, unrecognized or failed session responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ mode: 'unexpected' })).mockResolvedValueOnce(json({ error: 'Try later' }, 503));
    vi.stubGlobal('fetch', fetch); await render();
    expect(container.querySelector('[data-workbench]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-workbench]')).toBeNull();
    expect(container.textContent).toContain('Try later');
  });

  it('waits for successful code verification, then binds the workbench to that email', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ mode: 'email', user: null }))
      .mockResolvedValueOnce(json({ challengeId: 'challenge' }, 202))
      .mockResolvedValueOnce(json({ error: 'Invalid code' }, 400))
      .mockResolvedValueOnce(json({ user: { email: 'owner@example.test' } }));
    vi.stubGlobal('fetch', fetch); await render();
    await fill('sign-in-email', 'owner@example.test'); await submit();
    expect(container.querySelector('[data-workbench]')).toBeNull();
    expect(container.querySelector('#sign-in-code')?.getAttribute('autocomplete')).toBe('one-time-code');
    await fill('sign-in-code', '12345678'); await submit();
    expect(container.textContent).toContain('Invalid code');
    expect(container.querySelector('[data-workbench]')).toBeNull();
    await submit();
    expect(container.querySelector('[data-workbench]')?.textContent).toBe('owner@example.test');
    expect(container.querySelector('#sign-in-code')).toBeNull();
    expect(fetch).toHaveBeenLastCalledWith('/api/auth/verify-code', expect.objectContaining({ body: JSON.stringify({ challengeId: 'challenge', code: '12345678' }) }));
  });

  it('keeps unsaved work mounted on cancelled or failed sign-out', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ mode: 'email', user: { email: 'owner@example.test' } }))
      .mockResolvedValueOnce(json({ error: 'Network unavailable' }, 503)).mockResolvedValueOnce(json({ signedOut: true }));
    vi.stubGlobal('fetch', fetch); await render();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => container.querySelector('button')!.click());
    expect(fetch).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-workbench]')).not.toBeNull();
    expect(container.textContent).toContain('Network unavailable');
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-workbench]')).toBeNull();
    expect(container.querySelector('#sign-in-email')).not.toBeNull();
  });

  it('preserves the existing Sites gateway mode during setup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ mode: 'sites' }))); await render();
    expect(container.querySelector('[data-workbench]')?.textContent).toBe('gateway');
  });
});
