import { createToaster } from "@j-os/design-system";

const EDGE_OFFSET = "1rem";

/** For a failure with no area of its own to show it in. Mounted once, in
 *  `index.tsx`. Fixed to the viewport, so on a phone it rises above the bottom
 *  bar and a page's floating toolbar while they show. */
export const toaster = createToaster({
	placement: "bottom-end",
	offsets: {
		top: EDGE_OFFSET,
		left: EDGE_OFFSET,
		right: EDGE_OFFSET,
		bottom: `calc(${EDGE_OFFSET} + var(--jf-bottom-nav-height) + var(--jf-floating-toolbar-offset))`,
	},
});
