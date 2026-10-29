import type { CSSProperties } from 'react';
import { Widget } from '@grid-master/react';
import { CHART_POINTS, blockInfo } from '@grid-master/demo-kit';

/** A small decorative area chart; colour comes from `currentColor` (the block accent). */
function Chart() {
  return (
    <svg className="demo-block__chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`${CHART_POINTS} 100,40 0,40`} fill="currentColor" opacity="0.12" />
      <polyline
        points={CHART_POINTS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One grid widget: renders `blockInfo(id)` with the same markup as the vanilla blocks. */
export function Block({ id, locked }: { id: string; locked: boolean }) {
  const info = blockInfo(id);
  const className = `demo-block demo-block--${info.kind}${locked ? ' demo-block--locked' : ''}`;
  const style = { '--block-accent': info.accent } as CSSProperties;

  return (
    <Widget id={id} className={className} style={style}>
      {info.kind === 'map' && (
        <Widget.Handle className="demo-block__grip">
          <span aria-hidden="true">⠿</span> drag
        </Widget.Handle>
      )}
      <div className="demo-block__title">{info.title}</div>
      {info.kind === 'number' && info.value && <div className="demo-block__value">{info.value}</div>}
      {info.kind === 'note' && info.value && <div className="demo-block__text">{info.value}</div>}
      {info.kind === 'chart' && <Chart />}
      {info.kind === 'list' && (
        <ul className="demo-block__list">
          {(info.items ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {info.kind === 'form' && (
        <div className="demo-block__form">
          <input type="text" placeholder="Your email" aria-label="Your email" />
          <button type="button" className="demo-block__button">
            Send
          </button>
        </div>
      )}
      {info.kind === 'map' && <div className="demo-block__text">Only this handle starts a drag.</div>}
    </Widget>
  );
}
