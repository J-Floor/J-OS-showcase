import {
	Avatar,
	Morph,
	createHoverIntent,
	morphOpener,
	morphTitle,
} from "@j-os/design-system";
import { Show, children, type JSX } from "solid-js";

import styles from "./PersonListItem.module.scss";

type PersonListItemProps = {
	name: string;
	detail?: string;
	/** Opens what the row shows (the person, their request). The avatar and
	 *  name become a button; the trailing slot stays outside it. */
	open?: () => void;
	/** Readies what `open` shows (loads its peek) ahead of the open: once the
	 *  pointer rests on the person, and on the press itself, since a touch
	 *  has no hover. Without it, a first open has nothing to morph into. */
	warm?: () => void;
	/** The id of the record `open` shows: the row morphs into its sheet and
	 *  the sheet back into the row. */
	morphOf?: string;
	children?: JSX.Element;
};

/** The avatar and the name column, as a button when the row opens. With
 *  `morphOf` the button is the row's opener: what it opens grows out of the
 *  whole row, not out of the button. */
function Who(
	props: Pick<
		PersonListItemProps,
		"name" | "detail" | "open" | "warm" | "morphOf"
	>
): JSX.Element {
	const hoverIntent = createHoverIntent(() => {
		props.warm?.();
	});
	function content(): JSX.Element {
		return (
			<>
				<Avatar name={props.name} />
				<span class={styles.who}>
					<span
						class={styles.name}
						{...(props.morphOf === undefined ? {} : morphTitle)}
					>
						{props.name}
					</span>
					<Show when={props.detail}>
						<span class={styles.detail}>{props.detail}</span>
					</Show>
				</span>
			</>
		);
	}
	return (
		<Show when={props.open} fallback={content()}>
			{(open) => (
				<button
					type="button"
					class={styles.open}
					{...(props.morphOf === undefined ? {} : morphOpener)}
					onPointerEnter={hoverIntent.onPointerEnter}
					onPointerLeave={hoverIntent.onPointerLeave}
					onPointerDown={() => {
						props.warm?.();
					}}
					onClick={() => {
						open()();
					}}
				>
					{content()}
				</button>
			)}
		</Show>
	);
}

/**
 * One person in a sheet list: avatar, name, an optional muted detail line
 * (an email) and a trailing slot for what belongs to that row (a status
 * picker, a date). The trailing slot drops under the name on a narrow sheet.
 * With `open`, the person is a button (Enter and Space come with it) that
 * opens what the row shows, and with `morphOf` the row morphs into it.
 */
export function PersonListItem(props: PersonListItemProps): JSX.Element {
	// Resolved once: reading `props.children` twice would build the trailing
	// content (a stateful status picker) twice per row.
	const trailing = children(() => props.children);
	function row(attributes: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
		return (
			<div {...attributes} class={styles.row}>
				<Who
					name={props.name}
					detail={props.detail}
					open={props.open}
					warm={props.warm}
					morphOf={props.morphOf}
				/>
				<Show when={trailing()}>
					<div class={styles.trailing}>{trailing()}</div>
				</Show>
			</div>
		);
	}
	return (
		<Show when={props.morphOf} keyed fallback={row({})}>
			{(morphId) => (
				<Morph morphId={morphId} asChild={(morph) => row(morph())} />
			)}
		</Show>
	);
}
