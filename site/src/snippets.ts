export type Framework = 'vanilla' | 'angular' | 'react';
export type Lang = 'html' | 'ts' | 'tsx';

/** Short quickstarts. Each uses the same API as its demo. */
export const SNIPPETS: Record<Framework, string> = {
  vanilla: `<!-- Assumes a bundler such as Vite: bare package imports and the CSS import need one. -->
<div id="grid">
  <div data-grid-id="revenue">Revenue</div>
  <div data-grid-id="map">
    <span data-grid-handle>drag here</span> Map
  </div>
</div>

<script type="module">
  import { createGrid } from '@dash-builder/core';
  import '@dash-builder/core/grid.css';

  // Persist the layout however you like; here, in localStorage.
  const save = (layout) => localStorage.setItem('layout', JSON.stringify(layout));

  const grid = createGrid(document.getElementById('grid'), {
    columns: 4,
    dropMode: 'insert',
    layout: [
      { id: 'revenue', w: 2, h: 2 },
      { id: 'map', w: 2, h: 2 },
    ],
    onLayoutChange: (layout) => save(layout),
  });
</script>`,
  angular: `<!-- imports: DashGrid, DashWidget, DashHandle from '@dash-builder/angular' -->
<dash-grid [columns]="4" dropMode="insert" [(layout)]="layout">
  @for (item of layout(); track item.id) {
    <div [dashWidget]="item.id">
      <header dashHandle>{{ item.id }}</header>
      <p>Widget content</p>
    </div>
  }
</dash-grid>`,
  react: `import { useState } from 'react';
import { Grid, Widget } from '@dash-builder/react';
import type { LayoutItem } from '@dash-builder/react';
import '@dash-builder/core/grid.css';

const initial: LayoutItem[] = [
  { id: 'revenue', w: 2, h: 2 },
  { id: 'map', w: 2, h: 2 },
];

export function Dashboard() {
  const [layout, setLayout] = useState(initial);

  return (
    <Grid columns={4} dropMode="insert" layout={layout} onLayoutChange={setLayout}>
      {layout.map((item) => (
        <Widget key={item.id} id={item.id}>
          <Widget.Handle>{item.id}</Widget.Handle>
          <p>Widget content</p>
        </Widget>
      ))}
    </Grid>
  );
}`,
};

export const SNIPPET_LANG: Record<Framework, Lang> = { vanilla: 'html', angular: 'html', react: 'tsx' };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const KEYWORDS = 'import|from|export|function|const|let|return|new|type|as';

// Order matters: the first alternative that matches at a position wins.
const TOKEN = new RegExp(
  [
    String.raw`(?<comment><!--[\s\S]*?-->|\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
    String.raw`(?<string>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\x60(?:\\.|[^\x60\\])*\x60)`,
    String.raw`(?<tag><\/?[A-Za-z][\w.-]*)`,
    String.raw`(?<attr>[\[(]*[\w-]+[\])]*(?==["{]))`,
    String.raw`(?<keyword>\b(?:${KEYWORDS})\b)`,
  ].join('|'),
  'g',
);

/**
 * A tiny tokenizer: wraps comments, strings, tags, attribute names and keywords in
 * `<span class="tok-*">`. The input is escaped first (token by token), so the result is safe HTML.
 */
export function highlight(code: string, lang: Lang): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const kind = Object.entries(m.groups!).find(([, v]) => v !== undefined)![0];
    if (kind === 'tag' && lang === 'ts') continue; // plain TypeScript has no tags (generics look like them)
    out += escapeHtml(code.slice(last, m.index));
    out += `<span class="tok-${kind}">${escapeHtml(m[0])}</span>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}
