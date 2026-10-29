import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LAYOUT, MODES } from '@grid-master/demo-kit';
import { App } from '../react/app.js';

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, 'error');
});
afterEach(() => {
  cleanup();
  // no React warnings (act, keys, unknown props, ...) in any test
  expect(errors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('React tab app', () => {
  it('renders the 8 widgets in DEMO_LAYOUT order', () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const ids = Array.from(container.querySelectorAll('.gm-grid > [data-grid-id]')).map((n) => n.getAttribute('data-grid-id'));
    expect(ids).toEqual(DEMO_LAYOUT.map((i) => i.id));
    expect(ids).toHaveLength(8);
  });

  it('gives the map block a drag handle', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('[data-grid-handle]')).toHaveLength(1);
    expect(container.querySelector('.demo-block--map [data-grid-handle]')).not.toBeNull();
    expect(container.querySelector('[data-grid-handle] [aria-hidden="true"]')!.textContent).toBe('⠿');
    expect(container.querySelector('.gm-grid h2, .gm-grid h3')).toBeNull();
  });

  it('has an ARIA radiogroup that updates the hint', () => {
    render(<App />);
    const group = screen.getByRole('radiogroup', { name: 'Drop mode' });
    expect(group.className).toBe('segmented');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(MODES.map((m) => m.label));
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
    expect(radios[1]!.tabIndex).toBe(-1);
    expect(screen.getByText(MODES[0]!.hint)).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Swap' }));
    expect(screen.getByText(MODES[3]!.hint)).toBeTruthy();
    expect(screen.queryByText(MODES[0]!.hint)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Swap' }).getAttribute('aria-checked')).toBe('true');
  });

  it('moves the selection with the arrow keys', () => {
    render(<App />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Insert' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Swap' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(MODES[3]!.hint)).toBeTruthy();
  });

  it('shows the caption and no add/remove controls', () => {
    render(<App />);
    expect(screen.getByText(/Built with @grid-master\/react/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add|remove/i })).toBeNull();
  });
});
