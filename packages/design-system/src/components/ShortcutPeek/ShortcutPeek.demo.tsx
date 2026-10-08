import {
	Button,
	ShortcutPeekProvider,
	useShortcutPeek,
} from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";
import styles from "./ShortcutPeek.demo.module.scss";

// A probe component so `useShortcutPeek` has an owner inside the provider —
// the same shape as the Tour demo, which needs a hook owner for the same reason.
function ShortcutPeekDemo() {
	const peek = useShortcutPeek();
	return (
		<div class={styles.column}>
			<p>peeking: {peek.peeking() ? "on" : "off"}</p>
			<Button onClick={peek.toggleLatched}>
				{peek.latched() ? "Un-latch" : "Latch"}
			</Button>
			<p class={styles.hint}>Or hold Alt to peek without latching.</p>
		</div>
	);
}

export default {
	title: "ShortcutPeek",
	render: () => (
		<ShortcutPeekProvider>
			<ShortcutPeekDemo />
		</ShortcutPeekProvider>
	),
	controls: {},
} satisfies Demo;
