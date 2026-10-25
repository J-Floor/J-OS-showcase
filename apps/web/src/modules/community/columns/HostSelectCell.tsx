import { Skeleton } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, createSignal, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import { hostDisplay } from "../hostDisplay.ts";

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
	const { error, trackResult, clear } = createActionError();

	function host() {
		return hostDisplay(boardLevel.data(), props.row);
	}

	function engage(): void {
		clear();
		setEngaged(true);
	}

	async function commitHost(value: Id<"people"> | null): Promise<void> {
		const result = await trackResult(
			call(
				setHost.mutateAsync({ id: props.row._id, hostedById: value }),
				"Could not change the host."
			)
		);
		if (result.isOk()) return;
		// Back to the plain cell, which shows the host the server still has.
		setEngaged(false);
	}

	return (
		<>
			<Show
				when={engaged()}
				fallback={
					<button
						type="button"
						class={styles.placeholder}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ")
								return;
							event.preventDefault();
							engage();
						}}
						onClick={() => {
							engage();
						}}
					>
						<Show
							when={!host().loading}
							fallback={<Skeleton width="medium" />}
						>
							<Show
								when={host().name}
								fallback={
									<span class={styles.empty}>
										Pick a board member
									</span>
								}
							>
								{(name) => <span>{name()}</span>}
							</Show>
						</Show>
					</button>
				}
			>
				<HostSelect
					autofocus
					// Opened either way: both routes here are deliberate (a click,
					// or Enter/Space), so there is no case where the picker should
					// appear already mounted but closed.
					defaultOpen
					value={props.row.hostedById ?? null}
					legacyHost={props.row.hostedBy}
					onCommit={(value: Id<"people"> | null) => {
						void commitHost(value);
					}}
				/>
			</Show>
			<InlineError message={error()} />
		</>
	);
}
