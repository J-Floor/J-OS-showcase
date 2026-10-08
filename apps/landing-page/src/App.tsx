import { JFloorProvider } from "@j-os/design-system";
import type { ParentProps } from "solid-js";

/** Root layout shell shared by every route. Mounts the design-system provider
 * (forced dark for the marketing site), which injects the global reset, design
 * tokens, and web fonts. The site's footer lives in the home `FooterCta`
 * section; there is intentionally no persistent top nav (the live site has none). */
export function App(props: ParentProps) {
	return <JFloorProvider theme="dark">{props.children}</JFloorProvider>;
}
