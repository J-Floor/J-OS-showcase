import { createToaster } from "@j-os/design-system";

const EDGE_OFFSET = "1rem";

/** For a failure with no area of its own to show it in. Mounted once, in
 *  `index.tsx`. Fixed to the viewport, so on a phone it rises above the bottom
 *  bar and the floating pills (FloatingStack) while they show. */
export const toaster = createToaster({
	placement: "bottom-end",
	offsets: {
		top: EDGE_OFFSET,
		left: EDGE_OFFSET,
		right: EDGE_OFFSET,
		bottom: `calc(${EDGE_OFFSET} + var(--app-bottom-nav-height, 0px) + var(--jf-floating-stack-block-size))`,
	},
});
