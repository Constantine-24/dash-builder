import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Grid } from '@grid-master/react';
import type { LayoutItem } from '@grid-master/react';
import { DEMO_LAYOUT, MODES } from '@grid-master/demo-kit';
import { Block } from './block.js';

/** The drop-mode segmented control: same classes and ARIA as the vanilla `createModeSwitch`. */
function ModeSwitch({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const n = MODES.length;
    let to: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        to = (index + 1) % n;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        to = (index + n - 1) % n;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onSelect(to);
    radios.current[to]?.focus();
  }

  return (
    <div className="segmented" role="radiogroup" aria-label="Drop mode" onKeyDown={onKeyDown}>
      {MODES.map((m, i) => (
        <button
          key={m.mode}
          ref={(node) => {
            radios.current[i] = node;
          }}
          type="button"
          role="radio"
          className="segmented__option"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onSelect(i)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [layout, setLayout] = useState<LayoutItem[]>(() => structuredClone(DEMO_LAYOUT));
  const [modeIndex, setModeIndex] = useState(0);
  const mode = MODES[modeIndex]!;

  return (
    <div className="react-app">
      <ModeSwitch index={modeIndex} onSelect={setModeIndex} />
      <p className="hero-hint" aria-live="polite">
        {mode.hint}
      </p>
      <Grid columns={4} rowHeight={72} gap={10} layout={layout} onLayoutChange={setLayout} dropMode={mode.mode}>
        {layout.map((item) => (
          <Block key={item.id} id={item.id} locked={item.locked === true} />
        ))}
      </Grid>
      <p className="react-app__caption">Built with @grid-master/react</p>
    </div>
  );
}
