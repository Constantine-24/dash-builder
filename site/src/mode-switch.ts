import { MODES } from '@grid-master/demo-kit';
import type { DropMode } from '@grid-master/core';

export type ModeSwitch = HTMLElement & {
  /** Selects the option at `index` and notifies `onChange`. */
  select(index: number, focus?: boolean): void;
};

/**
 * The drop-mode segmented control (an ARIA radiogroup with roving tabindex).
 * The first mode starts selected without notifying `onChange`; the caller applies it.
 * Pass `signal` to remove the listeners on teardown.
 */
export function createModeSwitch(onChange: (mode: DropMode, index: number) => void, signal?: AbortSignal): ModeSwitch {
  const group = document.createElement('div') as unknown as ModeSwitch; // `select` is attached below
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Drop mode');
  const radios = MODES.map((m) => {
    const b = document.createElement('button');
    b.className = 'segmented__option';
    b.textContent = m.label;
    b.type = 'button';
    b.setAttribute('role', 'radio');
    return b;
  });
  group.append(...radios);

  function mark(index: number): void {
    radios.forEach((r, i) => {
      r.setAttribute('aria-checked', String(i === index));
      r.tabIndex = i === index ? 0 : -1;
    });
  }
  group.select = (index, focus = false) => {
    mark(index);
    onChange(MODES[index]!.mode, index);
    if (focus) radios[index]!.focus();
  };

  radios.forEach((r, i) => r.addEventListener('click', () => group.select(i), { signal }));
  group.addEventListener(
    'keydown',
    (e) => {
      const n = radios.length;
      const from = radios.indexOf(e.target as HTMLButtonElement);
      if (from < 0) return;
      let to: number;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          to = (from + 1) % n;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          to = (from + n - 1) % n;
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
      group.select(to, true);
    },
    { signal },
  );

  mark(0);
  return group;
}
