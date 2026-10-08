import { Show, createSignal, type ParentProps } from "solid-js";

import styles from "./ImageCursorZone.module.scss";

type Point = { x: number; y: number };

/** Wraps media so that, on a fine pointer (mouse/trackpad), the default cursor
 * is hidden over the zone and a small "<label> ↗" pill follows the pointer —
 * the custom image cursor from the live thejfloor.com site. Touch pointers are
 * ignored (they keep the normal behaviour). */
export function ImageCursorZone(props: ParentProps<{ label?: string }>) {
	const [point, setPoint] = createSignal<Point | null>(null);

	function handleMove(event: PointerEvent) {
		if (event.pointerType !== "mouse") return;
		setPoint({ x: event.clientX, y: event.clientY });
	}

	function handleLeave() {
		setPoint(null);
	}

	return (
		<div
			class={styles.zone}
			classList={{ [styles.active]: point() !== null }}
			onPointerMove={handleMove}
			onPointerLeave={handleLeave}
		>
			{props.children}
			<Show when={point()}>
				{(p) => (
					<span
						class={styles.cursor}
						style={{
							transform: `translate(${String(p().x)}px, ${String(p().y)}px) translate(-50%, -50%)`,
						}}
						aria-hidden="true"
					>
						{props.label ?? "View"}
						<span class={styles.arrow}>↗</span>
					</span>
				)}
			</Show>
		</div>
	);
}
