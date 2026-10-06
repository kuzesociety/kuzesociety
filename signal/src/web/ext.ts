/** Hooks that let another shell (the in-browser demo) extend the dashboard without forking it. */
import type { VNode } from "preact";

export interface Extensions {
  /** the engine runs inside this page on a simulated market (no server, no real coins) */
  demo: boolean;
  /** extra sections for the More tab */
  moreTabs: { key: string; label: string; render: () => VNode }[];
  /** a control at the end of the simulated-market banner */
  bannerAction?: () => VNode | null;
}

export const ext: Extensions = { demo: false, moreTabs: [] };
