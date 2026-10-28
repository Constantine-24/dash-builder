import { createContext } from 'react';

export interface GridContextValue {
  /**
   * Asks the grid to rescan and re-render its widgets. Calls coalesce into one refresh;
   * outside a `<Grid>` (or during server rendering) this does nothing.
   */
  requestRefresh(): void;
}

export const GridContext = createContext<GridContextValue>({ requestRefresh() {} });
