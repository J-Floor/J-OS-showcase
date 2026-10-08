import { createSignal, For, Show } from "solid-js";

import { Button, Deferred } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Deferred.demo.module.scss";

const ROWS = Array.from({ length: 2000 }, (_, i) => i);

function SlowList() {
	// Deliberately heavy: 2 000 rows built synchronously, so the "build" half
	// of Deferred's paint-first-build-second contract is visible.
	return (
		<ul class={styles.list}>
			<For each={ROWS}>{(i) => <li class={styles.item}>Row {i}</li>}</For>
		</ul>
	);
}

function DeferredDemo() {
	const [visible, setVisible] = createSignal(true);
	const remount = () => {
		setVisible(false);
		requestAnimationFrame(() => setVisible(true));
	};

	return (
		<div class={styles.wrap}>
			<Button onClick={remount}>Remount</Button>
			<Show when={visible()}>
				<Deferred fallback={<p class={styles.skeleton}>Loading…</p>}>
					<SlowList />
				</Deferred>
			</Show>
		</div>
	);
}

export default {
	title: "Deferred",
	render: () => <DeferredDemo />,
	controls: {},
} satisfies Demo;
