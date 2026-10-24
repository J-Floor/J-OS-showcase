import type { Demo } from "../../../demo/types.ts";
import { Button } from "../Button/Button.tsx";
import { FloatingToolbar } from "../FloatingToolbar/FloatingToolbar.tsx";

import { FloatingStack } from "./FloatingStack.tsx";
import styles from "./FloatingStack.demo.module.scss";

export default {
	title: "FloatingStack",
	render: (p) => (
		<div class={styles.box}>
			<FloatingStack>
				<Button variant="secondary">{p.pill}</Button>
				{/* On a phone the toolbar joins the stack, below the pill. */}
				<FloatingToolbar>
					<Button>{p.action}</Button>
				</FloatingToolbar>
			</FloatingStack>
		</div>
	),
	controls: {
		pill: { type: "text", default: "A prompt" },
		action: { type: "text", default: "Save" },
	},
} satisfies Demo;
