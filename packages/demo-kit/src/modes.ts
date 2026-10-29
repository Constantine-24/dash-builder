import type { DropMode } from '@grid-master/core';

/** Hints follow the "Drop modes" section of packages/core/README.md. */
export const MODES: readonly { mode: DropMode; label: string; hint: string }[] = [
  { mode: 'insert', label: 'Insert', hint: 'The dragged widget is inserted at the drop position and everything after it moves on.' },
  { mode: 'block', label: 'Block', hint: 'A drop is refused if it would change which widgets share a row.' },
  { mode: 'shrink', label: 'Shrink to fit', hint: "Widgets in the target row are narrowed, down to their minimum width, to make room; the drop is refused if they can't fit." },
  { mode: 'swap', label: 'Swap', hint: 'The dragged widget trades places with the widget it is dropped on.' },
];
