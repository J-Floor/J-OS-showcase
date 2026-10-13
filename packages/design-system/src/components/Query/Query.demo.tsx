import { createSignal, For } from "solid-js";

import { Button, Query, SkeletonList } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

import styles from "./Query.demo.module.scss";

const CUSTOM_SKELETON_ROWS = 6;

type Item = { id: string; name: string };

const ROWS: Item[] = [
	{ id: "1", name: "Ada" },
	{ id: "2", name: "Alan" },
	{ id: "3", name: "Grace" },
];

const STATES: Record<string, Item[] | null | undefined> = {
	loading: undefined,
	empty: [],
	null: null,
	rows: ROWS,
};

function QueryDemo() {
	const [state, setState] = createSignal("loading");
	const data = (): Item[] | null | undefined => STATES[state()];

	return (
		<div class={styles.stack}>
			<div class={styles.controls}>
				<For each={Object.keys(STATES)}>
					{(key) => (
						<Button
							onClick={() => {
								setState(key);
							}}
						>
							{key}
						</Button>
					)}
				</For>
			</div>
			<p class={styles.caption}>Default skeleton</p>
			<Query.Root data={data()}>
				<h3 class={styles.heading}>
					Items (<Query.Count />)
				</h3>
				<Query.Empty>
					<p class={styles.empty}>No items yet</p>
				</Query.Empty>
				<Query.Content of={data()}>
					{(rows) => (
						<ul class={styles.list}>
							<For each={rows()}>{(r) => <li>{r.name}</li>}</For>
						</ul>
					)}
				</Query.Content>
			</Query.Root>
			<p class={styles.caption}>Custom Query.Skeleton</p>
			<Query.Root data={data()}>
				<Query.Skeleton>
					<SkeletonList rows={CUSTOM_SKELETON_ROWS} />
				</Query.Skeleton>
				<Query.Content of={data()}>
					{(rows) => (
						<ul class={styles.list}>
							<For each={rows()}>{(r) => <li>{r.name}</li>}</For>
						</ul>
					)}
				</Query.Content>
			</Query.Root>
		</div>
	);
}

export default {
	title: "Query",
	render: () => <QueryDemo />,
	controls: {},
} satisfies Demo;
