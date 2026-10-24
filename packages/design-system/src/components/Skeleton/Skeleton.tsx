import clsx from "clsx";
import {
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	type JSX,
} from "solid-js";

import styles from "./Skeleton.module.scss";
import {
	measureLeaves,
	observeResize,
	type LeafRect,
} from "./skeletonMeasure.ts";

/**
 * Two modes, picked by whether `visible` is passed.
 *
 * - **Measured** (`visible` + children): shimmer over the children while
 *   `visible`, else the children. The children are rendered hidden and each
 *   leaf's box is measured, so this suits content that is cheap to build and
 *   whose shape is not known up front. Gate it with
 *   `visible={data() === undefined}`. A data source that exposes a plain
 *   undefined-then-value accessor, not a suspending resource, needs no
 *   Suspense here. `Sheet.Skeleton` is the main consumer: a surface
 *   that knows the shape of its own loaded body passes placeholder markup,
 *   and the sheet wraps it in this mode so the shimmer matches that shape
 *   instead of generic bars.
 * - **Manual** (no `visible`, no children): one shimmer bar whose shape is
 *   known up front. It is sized by a `width` preset (a share of the parent) or
 *   by the caller's `class`. Tables and sheets use this for skeletons that
 *   must paint BEFORE the real content is built, since measuring would mean
 *   building it.
 */
export type SkeletonProps =
	| {
			visible: boolean;
			children: JSX.Element;
			width?: never;
			class?: never;
	  }
	| {
			visible?: never;
			children?: never;
			/** Share of the parent's width. @default "medium" */
			width?: "short" | "medium" | "long" | "full";
			/** Sets the bar's own dimensions instead of a preset. */
			class?: string;
	  };

export function Skeleton(props: SkeletonProps): JSX.Element {
	return (
		<Show
			when={props.visible !== undefined}
			fallback={
				<span
					class={clsx(styles.bar, props.class)}
					data-width={
						props.class ? undefined : (props.width ?? "medium")
					}
					aria-hidden="true"
				/>
			}
		>
			<Show when={props.visible} fallback={props.children}>
				<Shimmer>{props.children}</Shimmer>
			</Show>
		</Show>
	);
}

function Shimmer(props: { children: JSX.Element }): JSX.Element {
	const [rects, setRects] = createSignal<LeafRect[]>([]);
	let measureElement: HTMLDivElement | undefined;

	function remeasure(): void {
		if (measureElement) setRects(measureLeaves(measureElement));
	}
	onMount(() => {
		remeasure();
		if (measureElement) onCleanup(observeResize(measureElement, remeasure));
	});

	return (
		<div class={styles.container} data-shimmer-container="true">
			<div
				ref={(element) => (measureElement = element)}
				class={styles.measure}
				data-measured={rects().length > 0 ? "" : undefined}
				aria-hidden="true"
			>
				{props.children}
			</div>
			<div class={styles.overlay}>
				{/* When nothing measured (jsdom / no layout), the measure layer
				    above already shows the children; render no blocks. */}
				<For each={rects()}>
					{(rect) => (
						<span
							class={styles.block}
							style={{
								"--x": `${rect.x}px`,
								"--y": `${rect.y}px`,
								"--w": `${rect.width}px`,
								"--h": `${rect.height}px`,
								"--r":
									rect.borderRadius === "0px"
										? undefined
										: rect.borderRadius,
							}}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
