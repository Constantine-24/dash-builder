import { useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GridController } from '@grid-master/core';
import { Grid, Widget } from '../src/index.js';

/** Every refresh/destroy call on any controller, in order. */
const calls: string[] = [];

vi.mock('@grid-master/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@grid-master/core')>();
  return {
    ...core,
    createGrid(...args: Parameters<typeof core.createGrid>): GridController {
      const g = core.createGrid(...args);
      let destroyed = false;
      return {
        ...g,
        refresh() {
          calls.push(destroyed ? 'refresh-after-destroy' : 'refresh');
          g.refresh();
        },
        destroy() {
          destroyed = true;
          calls.push('destroy');
          g.destroy();
        },
      };
    },
  };
});

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  calls.length = 0;
  errors = vi.spyOn(console, 'error');
});
afterEach(() => {
  cleanup();
  expect(errors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

const LAYOUT = [
  { id: 'a', w: 1, h: 1 },
  { id: 'b', w: 1, h: 1 },
];

const tickers: Record<string, () => void> = {};
/** Re-renders every Ticking widget from its own state; the Grid does not re-render. */
const tick = () => Object.values(tickers).forEach((t) => t());

function Ticking({ id }: { id: string }) {
  const [n, setN] = useState(0);
  tickers[id] = () => setN((x) => x + 1);
  return <Widget id={id}>{`${id} ${n}`}</Widget>;
}

/** Mounts and lets the requests from the mount commit settle. */
async function mount() {
  for (const k of Object.keys(tickers)) delete tickers[k];
  const r = render(
    <Grid columns={4} breakpoint={0} layout={LAYOUT}>
      <Ticking id="a" />
      <Ticking id="b" />
    </Grid>,
  );
  await act(async () => {});
  return r;
}

it('mounting needs no extra refresh (createGrid places the widgets)', async () => {
  await mount();
  expect(calls).toEqual([]);
});

it('widget commits without a Grid render coalesce into one refresh', async () => {
  await mount();
  await act(async () => tick()); // both widgets commit
  expect(calls).toEqual(['refresh']);
});

it('unmounting right after a widget commit never refreshes a destroyed controller', async () => {
  const { unmount } = await mount();
  act(() => tick()); // queues a refresh
  unmount(); // before the queued refresh runs
  await act(async () => {}); // let it run
  expect(calls).toEqual(['destroy']);
});
