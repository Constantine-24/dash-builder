import { blockInfo } from '@grid-master/demo-kit';

const SVG_NS = 'http://www.w3.org/2000/svg';

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

/** A small decorative area chart; colour comes from `currentColor` (the block accent). */
function chart(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'demo-block__chart');
  svg.setAttribute('viewBox', '0 0 100 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const points = '0,32 12,26 24,29 36,18 48,22 60,12 72,16 84,6 100,10';
  const area = document.createElementNS(SVG_NS, 'polygon');
  area.setAttribute('points', `${points} 100,40 0,40`);
  area.setAttribute('fill', 'currentColor');
  area.setAttribute('opacity', '0.12');
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(area, line);
  return svg;
}

function form(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'demo-block__form';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Your email';
  input.setAttribute('aria-label', 'Your email');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'demo-block__button';
  button.textContent = 'Send';
  wrap.append(input, button);
  return wrap;
}

/** One grid widget: a direct child of the grid container, identified by `data-grid-id`. */
export function renderBlock(id: string, locked: boolean): HTMLElement {
  const info = blockInfo(id);
  const block = document.createElement('div');
  block.dataset.gridId = id;
  block.className = `demo-block demo-block--${info.kind}`;
  if (locked) block.classList.add('demo-block--locked');
  block.style.setProperty('--block-accent', info.accent);

  if (info.kind === 'map') {
    const grip = text('span', 'demo-block__grip', '⠿ drag');
    grip.setAttribute('data-grid-handle', '');
    block.append(grip);
  }
  block.append(text('h3', 'demo-block__title', info.title));

  switch (info.kind) {
    case 'number':
    case 'note':
      if (info.value) block.append(text('div', info.kind === 'number' ? 'demo-block__value' : 'demo-block__text', info.value));
      break;
    case 'chart':
      block.append(chart());
      break;
    case 'list': {
      const list = document.createElement('ul');
      list.className = 'demo-block__list';
      for (const item of info.items ?? []) list.append(text('li', '', item));
      block.append(list);
      break;
    }
    case 'form':
      block.append(form());
      break;
    case 'map':
      block.append(text('div', 'demo-block__text', 'Only this handle starts a drag.'));
      break;
  }
  return block;
}
