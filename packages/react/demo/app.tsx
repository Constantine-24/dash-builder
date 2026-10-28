import { useRef, useState } from 'react';
import { Grid, Widget } from '../src/index.js';
import type { DropMode, GridHandle, LayoutItem, RejectReason } from '../src/index.js';
import { BLOCKS, DEFAULT_LAYOUT, type Block } from './blocks.js';

const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
const MODES: DropMode[] = ['insert', 'block', 'shrink', 'swap'];

export function App() {
  const grid = useRef<GridHandle>(null);
  const [layout, setLayout] = useState<LayoutItem[]>(() => structuredClone(DEFAULT_LAYOUT));
  const [mode, setMode] = useState<DropMode>('insert');
  /** Clicked blocks get a "selected" class: a runtime className change on a Widget. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [limit, setLimit] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [status, setStatus] = useState('Ready. Click a block to select it.');
  /** Content for blocks added at runtime; the layout JSON stays content-free. */
  const [extra, setExtra] = useState<Record<string, Block>>({});
  const nextId = useRef(1);

  const block = (id: string): Block => {
    if (Object.hasOwn(BLOCKS, id)) return BLOCKS[id]!;
    if (Object.hasOwn(extra, id)) return extra[id]!;
    return { title: id, kind: 'note', color: '#e5e7eb' };
  };

  const add = () => {
    let id: string;
    do {
      id = `new-${nextId.current++}`;
    } while (layout.some((i) => i.id === id));
    const w = 1 + Math.floor(Math.random() * 2);
    const color = COLORS[nextId.current % COLORS.length]!;
    const result = grid.current!.addItem({ id, w, h: 1 });
    if (result.ok) {
      setExtra((m) => ({ ...m, [id]: { title: `New ${id}`, kind: 'note', color } }));
      setStatus(`Added ${id} (${w}x1).`);
    }
    // A refusal also arrives through onReject, which sets the reason in the status line.
  };

  const removeLast = () => {
    const item = [...layout].reverse().find((i) => !i.locked);
    if (!item) {
      setStatus('Nothing to remove.');
      return;
    }
    grid.current!.removeItem(item.id);
    setStatus(`Removed ${item.id}.`);
  };

  const onReject = (reason: RejectReason) => setStatus(`Add refused: ${reason}`);

  const toggleSelected = (id: string, target: EventTarget) => {
    // Clicks on the block's own controls don't select it.
    if (target instanceof Element && target.closest('input, button, select, textarea, [data-grid-handle], .gm-resize-handle')) return;
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  return (
    <>
      <header className="toolbar">
        <label>
          Drop mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as DropMode)}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} /> Limit to 6 rows
        </label>
        <button type="button" onClick={add}>
          Add block
        </button>
        <button type="button" onClick={removeLast}>
          Remove last unlocked
        </button>
        <label>
          <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} /> Narrow preview
        </label>
        <span className="status" role="status">
          {status}
        </span>
      </header>

      <main>
        <div className={narrow ? 'frame narrow' : 'frame'}>
          <Grid
            ref={grid}
            columns={4}
            layout={layout}
            onLayoutChange={setLayout}
            dropMode={mode}
            maxRows={limit ? 6 : undefined}
            rowHeight={100}
            gap={8}
            breakpoint={640}
            onReject={onReject}
          >
            {layout.map((item) => {
              const b = block(item.id);
              return (
                <Widget
                  key={item.id}
                  id={item.id}
                  className={['block', item.locked && 'locked', selected.has(item.id) && 'selected']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ background: b.color }}
                  onClick={(e) => toggleSelected(item.id, e.target)}
                >
                  <header className="block-head">
                    <strong>{b.title}</strong>
                    <span className="dim">
                      {item.w}×{item.h}
                    </span>
                  </header>
                  <Content kind={b.kind} item={item} />
                </Widget>
              );
            })}
          </Grid>
        </div>

        <h2>Layout JSON</h2>
        <pre>{JSON.stringify(layout, null, 2)}</pre>
      </main>
    </>
  );
}

function Content({ kind, item }: { kind: Block['kind']; item: LayoutItem }) {
  switch (kind) {
    case 'number':
      return <div className="big">{item.id.length * 137}</div>;
    case 'chart':
      return (
        <svg className="chart" viewBox="0 0 100 40" preserveAspectRatio="none">
          <polyline points="0,35 15,25 30,28 45,12 60,18 75,6 100,10" fill="none" stroke="#334155" strokeWidth="2" />
        </svg>
      );
    case 'list':
      return (
        <ul>
          <li>First item</li>
          <li>Second item</li>
          <li>Third item</li>
        </ul>
      );
    case 'map':
      return (
        <>
          <Widget.Handle className="grip" title="Drag here">
            ⠿ drag handle
          </Widget.Handle>
          <div className="map">Fake pannable area</div>
        </>
      );
    case 'form':
      return (
        <div className="form">
          <input type="text" placeholder="Type here" />
          <button type="button">Send</button>
        </div>
      );
    default:
      return <p className="dim">{item.locked ? 'Locked: cannot be dragged or resized.' : 'A plain note block.'}</p>;
  }
}
