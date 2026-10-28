import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Widget } from '../src/index.js';

afterEach(cleanup);

it('renders a div with data-grid-id, no DOM id, and a handle span', () => {
  const { container } = render(
    <Widget id="a" className="x">
      <Widget.Handle>h</Widget.Handle>
    </Widget>,
  );
  const div = container.firstElementChild as HTMLElement;
  expect(div.tagName).toBe('DIV');
  expect(div.getAttribute('data-grid-id')).toBe('a');
  expect(div.classList.contains('x')).toBe(true);
  expect(div.hasAttribute('id')).toBe(false);
  const span = div.firstElementChild as HTMLElement;
  expect(span.tagName).toBe('SPAN');
  expect(span.getAttribute('data-grid-handle')).toBe('');
});

it('grid attributes win over consumer props', () => {
  const props = { 'data-grid-id': 'z' };
  const { container } = render(<Widget id="a" {...props} />);
  expect((container.firstElementChild as HTMLElement).getAttribute('data-grid-id')).toBe('a');
});

it('forwards ref to the div', () => {
  const ref = createRef<HTMLDivElement>();
  const { container } = render(<Widget id="b" ref={ref} />);
  expect(ref.current).toBe(container.firstElementChild);
});
