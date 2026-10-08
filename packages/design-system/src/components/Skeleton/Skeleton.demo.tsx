import { createSignal, onCleanup } from "solid-js";

import { Skeleton } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Skeleton.demo.module.scss";

function SkeletonDemo() {
	const [loading, setLoading] = createSignal(true);
	const timer = setInterval(() => setLoading((v) => !v), 2000);
	onCleanup(() => clearInterval(timer));

	return (
		<div class={styles.stack}>
			<p class={styles.caption}>Measured — shimmers over its children</p>
			<Skeleton visible={loading()}>
				<div class={styles.row}>
					<div class={styles.avatar} />
					<div>
						<p class={styles.name}>Jane Doe</p>
						<p class={styles.line}>
							Loaded a couple lines of text here
						</p>
					</div>
				</div>
			</Skeleton>
			<p class={styles.caption}>Manual — bars of a known shape</p>
			<Skeleton width="short" />
			<Skeleton width="long" />
			<Skeleton width="medium" />
		</div>
	);
}

export default {
	title: "Skeleton",
	render: () => <SkeletonDemo />,
	controls: {},
} satisfies Demo;
