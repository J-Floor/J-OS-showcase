import { useMutation } from "convex-solidjs";
import { Show, createSignal, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";

import { HostSelect } from "./HostSelect.tsx";
import styles from "./HostSelectCell.module.scss";

/**
 * "Hosted by" cell: a board-member picker (not free text). Commits the chosen
 * board member's id to `people.setHost`. An imported guest whose host hasn't
 * been resolved yet shows the legacy name as a re-pick hint.
 *
 * Until you engage with it, this renders as plain text. A `Select` is the most
 * expensive component in the design system — an Ark machine, a collection, a
 * portal and a listbox each — and the Guests tab has one per row. Mounting them
 * all so that one might be used froze the console for seconds; mounting on
 * first interaction costs a frame, on the single row being edited.
 *
 * A click opens the picker straight away, so swapping the control in stays
 * invisible and does not cost the board a second click. Keyboard users swap it
 * in with Enter or Space — NOT by focusing it. Swapping on focus unmounts the
 * very node that has focus, so tabbing across the table could drop the caret
 * entirely, and it would leave a trail of mounted selects behind anyone simply
 * passing through.
 */
export function HostSelectCell(props: { row: Doc<"people"> }): JSX.Element {
	const setHost = useMutation(api.people.setHost);
	const boardLevel = useBoardLevel();
	const [engaged, setEngaged] = createSignal(false);

	function hostName(): string | undefined {
		const id = props.row.hostedById;
		if (id) {
			const found = (boardLevel.data() ?? []).find((s) => s._id === id);
			if (found) return `${found.firstName} ${found.lastName}`.trim();
		}
		return props.row.hostedBy;
	}

	return (
		<Show
			when={engaged()}
			fallback={
				<button
					type="button"
					class={styles.placeholder}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						setEngaged(true);
					}}
					onClick={() => {
						setEngaged(true);
					}}
				>
					<Show
						when={hostName()}
						fallback={
							<span class={styles.empty}>
								Pick a board member
							</span>
						}
					>
						{(name) => <span>{name()}</span>}
					</Show>
				</button>
			}
		>
			<HostSelect
				autoFocus
				// Opened either way: both routes here are deliberate (a click,
				// or Enter/Space), so there is no case where the picker should
				// appear already mounted but closed.
				defaultOpen
				value={props.row.hostedById ?? null}
				placeholder={
					props.row.hostedBy
						? `${props.row.hostedBy} — re-pick`
						: undefined
				}
				onCommit={(value: Id<"people"> | null) => {
					void setHost.mutateAsync({
						id: props.row._id,
						hostedById: value,
					});
				}}
			/>
		</Show>
	);
}
