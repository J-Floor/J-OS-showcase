import {
	type JSX,
	Match,
	Show,
	Switch,
	createComputed,
	createEffect,
	createMemo,
	createSignal,
} from "solid-js";

import {
	type SaveState,
	type SaveTracker,
	useSaveTracker,
} from "../../utils/saveTracker.ts";
import { Button } from "../Button/Button.tsx";

import styles from "./SaveStatus.module.scss";

const NO_DURATION = /^(?:0m?s,?\s*)+$/;

/** Every transition on `element` takes no time. */
function hasNoFade(element: HTMLElement): boolean {
	return NO_DURATION.test(getComputedStyle(element).transitionDuration);
}

/** The tracker's state, and what it last said: the label stays while it
 *  fades out at idle. */
function StatusLine(props: { tracker: SaveTracker }): JSX.Element {
	const said = createMemo<SaveState>((last) => {
		const state = props.tracker.state();
		return state === "idle" ? last : state;
	}, "idle");
	// Idle after its fade, it takes no space, so the header's gap before the
	// next action goes too. Starts collapsed: nothing was said yet.
	const [isCollapsed, setCollapsed] = createSignal(true);
	const [status, setStatus] = createSignal<HTMLSpanElement>();
	createComputed(() => {
		if (props.tracker.state() !== "idle") setCollapsed(false);
	});
	// With no fade to wait for (reduced motion zeroes the durations), no
	// transitionend comes: collapse at once.
	createEffect(() => {
		const element = status();
		if (props.tracker.state() === "idle" && element && hasNoFade(element))
			setCollapsed(true);
	});
	return (
		<span
			ref={setStatus}
			class={styles.status}
			role="status"
			aria-label="Save status"
			data-state={props.tracker.state()}
			data-collapsed={isCollapsed() ? "" : undefined}
			onTransitionEnd={(event) => {
				if (
					// Its one transition is the fade.
					event.target === event.currentTarget &&
					props.tracker.state() === "idle"
				) {
					setCollapsed(true);
				}
			}}
		>
			{/* Faded out, the last label is no news. */}
			<span
				class={styles.label}
				aria-hidden={
					props.tracker.state() === "idle" ? "true" : undefined
				}
			>
				<Switch>
					<Match when={said() === "pending"}>Saving…</Match>
					<Match when={said() === "saved"}>Changes saved</Match>
					<Match when={said() === "failed"}>
						Couldn't save
						<Button
							variant="tertiary"
							onClick={() => {
								props.tracker.retry();
							}}
						>
							Retry
						</Button>
					</Match>
				</Switch>
			</span>
		</span>
	);
}

/**
 * `Sheet.SaveStatus`: what the sheet's fields have saved, from the save
 * tracker `Sheet.Root` provides ("Saving…", "Changes saved", then nothing;
 * "Couldn't save" with a Retry). Nothing before the first write; nothing
 * outside a sheet.
 */
export function SaveStatus(): JSX.Element {
	const tracker = useSaveTracker();
	return (
		<Show when={tracker}>
			{(shown) => <StatusLine tracker={shown()} />}
		</Show>
	);
}
