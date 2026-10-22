import {
	Avatar,
	Confetti,
	Input,
	Kbd,
	NumberInput,
	Skeleton,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import {
	type Accessor,
	For,
	Show,
	createContext,
	createSignal,
	onCleanup,
	onMount,
	useContext,
} from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { call } from "../../../lib/call.ts";
import {
	FREE_TEXT_SIZE,
	SHORT_TEXT_SIZE,
} from "../../../shared/columnSizes.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import { formatDate } from "../../../shared/time.ts";
import { useApplicationDecisions } from "../actions/applicationDecisions.ts";
import { personFields } from "../fields.ts";
import { noteAuthor } from "../noteAuthor.ts";

import styles from "./applicationColumns.module.scss";
import {
	actionsColumnSize,
	RowActionButton,
	RowActions,
} from "./RowActions.tsx";
import { useScoreDraft } from "./useScoreDraft.ts";
import { ventureColumns } from "./ventureColumns.tsx";

/**
 * All three tabs read one table and one query shape now, so an application row
 * IS a person row — which is what let the three separate detail sheets become
 * one. Kept as an alias rather than deleted: the name still says which tab's
 * columns these are.
 */
export type ApplicationRow = Doc<"people"> & {
	status: PersonStatus;
	hasAgreement: boolean;
};

/**
 * Current board member, provided ONCE by the tab. ScoreCells read it from here
 * instead of each opening their own `getCurrentPerson` subscription — otherwise
 * every table re-render (e.g. after saving a score) remounts all cells, each
 * spawning a fresh query that suspends, flickering the whole table.
 */
export type CurrentPerson = Doc<"people"> | null | undefined;
function noCurrentPerson(): CurrentPerson {
	return;
}
export const CurrentPersonContext =
	createContext<Accessor<CurrentPerson>>(noCurrentPerson);

const APPLICATION_ACTION_COUNT = 4;

/** Why a row's action button is disabled, per action id. Kept out of the
 *  descriptor (which is shared with the decision bar, which hides rather than
 *  disables) so each row keeps its own wording. */
const DISABLED_REASON: Record<string, string> = {
	guest: "Not available for this application",
	member: "Not available for this application",
	deny: "Already denied",
	undeny: "Application is not currently denied",
};

/** Per-row triage buttons for the Applications tab: make guest / make member /
 * turn down / undo. The decisions themselves — including which are on offer and
 * what each confirms — live in `useApplicationDecisions`, shared with the
 * sheet's decision bar. */
function ApplicationActions(props: { row: ApplicationRow }) {
	const decide = useApplicationDecisions();
	return (
		<RowActions>
			<For each={decide.actions()}>
				{(action) => {
					const button = (
						<RowActionButton
							action={action}
							row={props.row}
							disabledReason={DISABLED_REASON[action.id]}
						/>
					);
					return action.id === "member" ? (
						<Confetti>{button}</Confetti>
					) : (
						button
					);
				}}
			</For>
		</RowActions>
	);
}

/**
 * How the score field is being changed, read from the pointerdown that started
 * it (capture phase, before ark's own handler): a scrubber drag, a +/- button,
 * or neither (typing). Calls `onScrubberRelease` when a scrubber drag ends.
 */
function usePointerEditSource(onScrubberRelease: () => void) {
	let source: "scrubber" | "button" | null = null;
	function onDown(event: PointerEvent) {
		const target = event.target as Element | null;
		if (target?.closest('[data-part="scrubber"]')) source = "scrubber";
		else if (
			target?.closest(
				'button[aria-label="Increment"], button[aria-label="Decrement"]'
			)
		)
			source = "button";
		else source = null;
	}
	function onUp() {
		if (source === "scrubber") onScrubberRelease();
		source = null;
	}
	onMount(() => {
		document.addEventListener("pointerdown", onDown, true);
		document.addEventListener("pointerup", onUp, true);
		onCleanup(() => {
			document.removeEventListener("pointerdown", onDown, true);
			document.removeEventListener("pointerup", onUp, true);
		});
	});
	return () => source;
}

/**
 * Per-row score editor. The displayed/editable value is *this* board member's
 * own score (not the aggregate mean used for sorting). Setting it calls
 * `applications.setScore` with the current board member's id, resolved from
 * `people.getCurrentPerson`.
 *
 * Each cell subscribes to `getCurrentPerson` independently; the Convex client
 * dedupes that subscription, and these columns are static module-scope exports
 * so the hooks must live inside the cell component.
 */
export function ScoreCell(props: { row: ApplicationRow }) {
	const currentPerson = useContext(CurrentPersonContext);
	// The score is global — shared by all board members — so it's a single
	// entry, not one per board member.
	const { setDraft, draft, display, commit, error } = useScoreDraft({
		personId: () => props.row._id,
		currentScore: () => props.row.board?.score,
		canScore: () => Boolean(currentPerson()),
	});

	// WHEN we commit depends on how the value is changed (detected on
	// pointerdown, capture phase, before ark's own handler):
	//  - scrubber drag   → defer, commit on release (pointerup); committing each
	//    tick would refetch + re-render the table mid-drag and drop the scrub;
	//  - +/- buttons     → discrete, commit immediately;
	//  - keyboard typing → defer, commit on blur (focus-out) so a multi-digit
	//    value isn't committed (and the row re-rendered) per keystroke.
	const editSource = usePointerEditSource(() => {
		if (draft() !== null) commit();
	});

	return (
		<div class={styles.scoreCell}>
			<NumberInput
				label=""
				min={0}
				max={11}
				disabled={!currentPerson()}
				disabledReason="Only board members can score applications"
				value={display()}
				onFocusChange={(detail) => {
					if (!detail.focused && draft() !== null) commit();
				}}
				onValueChange={(detail) => {
					setDraft(detail.value);
					// Discrete +/- press commits now; scrubber waits for release,
					// typing (incl. backspacing to empty, which clears the score)
					// for blur. The table cell has no clear button — it would crowd
					// out the value at this width; the sheet's ScoreField has one.
					if (editSource() === "button") commit();
				}}
			/>
			{/* Peek hint: a digit sets the ringed row's score. `inline` shows it
			    only while peeking; the CSS limits it to the focused row. */}
			<Kbd label="0–9" inline class={styles.scoreKbd} />
			<InlineError message={error()} />
		</div>
	);
}

/**
 * Applicant notes in the roster: the most recent board note (author avatar + one
 * clamped line) above a quick composer that APPENDS a new, attributed note. The
 * single-field editor this replaced overwrote one shared string; notes are an
 * authored thread now (the sheet shows the whole thing).
 *
 * The `data-note-cell` marker is what the `n` shortcut looks for — it focuses
 * the composer of the ringed row so a note can be added without the mouse.
 *
 * Reused by the Guests tab (which reads the same `board.noteLog`); it only
 * touches `_id` + `board`, so it takes any person row. Tabs that don't bind the
 * `n` shortcut pass `showShortcutHint={false}` so the peek chip doesn't promise a
 * key that isn't wired there.
 */
export function NotesCell(props: {
	row: Doc<"people">;
	showShortcutHint?: boolean;
}) {
	const boardLevel = useBoardLevel();
	const addNote = useMutation(api.people.addNote);
	const [draft, setDraft] = createSignal("");
	const { error: noteError, trackResult } = createActionError();
	let isSaving = false;
	let refusedText: string | undefined;

	function latest() {
		const log = props.row.board?.noteLog ?? [];
		return log.length > 0 ? log[log.length - 1] : undefined;
	}
	async function submit(isRetry: boolean): Promise<void> {
		const text = draft().trim();
		// Enter and blur both submit; the draft outlives the save, so
		// without this one note would be sent twice. After a refusal only
		// Enter sends the same text again, not every blur.
		if (!text || isSaving || (!isRetry && text === refusedText)) return;
		isSaving = true;
		const result = await trackResult(
			call(
				addNote.mutateAsync({ id: props.row._id, text }),
				"Could not save the note."
			)
		);
		isSaving = false;
		if (result.isErr()) {
			refusedText = text;
			return;
		}
		refusedText = undefined;
		setDraft("");
	}

	return (
		<div class={styles.noteCell} data-note-cell>
			<Show when={latest()}>
				{(entry) => (
					<div class={styles.latest} title={entry().text}>
						<Show
							when={noteAuthor(
								boardLevel.data(),
								entry().authorId
							)}
							fallback={<Skeleton width="short" />}
						>
							{(name) => (
								<Avatar
									name={name()}
									class={styles.noteAvatar}
								/>
							)}
						</Show>
						<span class={styles.latestText}>{entry().text}</span>
					</div>
				)}
			</Show>
			<Input
				label=""
				aria-label="Add a note"
				placeholder="Add a note…"
				value={draft()}
				// Peek hint: `N` focuses this composer on the ringed row. `inline`
				// shows it only while peeking; the CSS limits it to the focused row.
				// Omitted where the tab doesn't bind `n` (e.g. the Guests tab).
				trailing={
					(props.showShortcutHint ?? true) ? (
						<Kbd shortcut="N" inline class={styles.noteKbd} />
					) : undefined
				}
				onValueChange={(event) => setDraft(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key !== "Enter") return;
					event.preventDefault();
					void submit(true);
				}}
				onBlur={() => void submit(false)}
			/>
			<InlineError message={noteError()} />
		</div>
	);
}

/** Triage buckets the Applications tab groups by. Group order follows this
 * `enumOptions` order: what still needs scoring comes first (it's the board's
 * open work), then the scored queue, then the terminal denied pile. */
const triageGroupOptions = [
	{ value: "toScore", label: "To score" },
	{ value: "queue", label: "Queue" },
	{ value: "denied", label: "Denied" },
] as const;

/** Bucket a prospect for the tab's grouping. Denied is terminal, so it buckets
 * there regardless of score; everything else splits on whether the board has
 * entered a score yet — presence of a value, not its size (a deliberate 0
 * counts as scored). */
export function triageGroupOf(row: ApplicationRow): string {
	if (row.stage === "denied") return "denied";
	return typeof row.board?.score === "number" ? "queue" : "toScore";
}

/** The submission date as the Date column shows it: the explicit
 *  `submittedAt` when present (the seed varies it), else Convex's automatic
 *  `_creationTime`. */
export function submissionDateText(row: ApplicationRow): string {
	return formatDate(row.submittedAt ?? row._creationTime);
}

export function applicationColumns(): JfColumnDefinition<ApplicationRow>[] {
	return [
		{
			// Hidden grouping column (`Table` hides whatever it groups by): it must
			// exist for `groupBy="triageGroup"` to resolve — without it tanstack
			// silently renders flat (ungrouped) rows.
			id: "triageGroup",
			header: "Group",
			dataType: "enum",
			enumOptions: triageGroupOptions,
			accessorFn: triageGroupOf,
		},
		fieldColumn(personFields.firstName, {
			accessorKey: "firstName",
			dataType: "string",
		}),
		fieldColumn(personFields.lastName, {
			accessorKey: "lastName",
			dataType: "string",
		}),
		fieldColumn(personFields.score, {
			dataType: "number",
			disableRowClick: true,
			size: 124,
			accessorFn: (row) => row.board?.score ?? 0,
			cell: (info) => <ScoreCell row={info.row.original} />,
		}),
		fieldColumn(personFields.createdAt, {
			dataType: "date",
			size: "content",
			accessorFn: (row) => row.submittedAt ?? row._creationTime,
			cell: (info) => submissionDateText(info.row.original),
			measureText: submissionDateText,
		}),
		fieldColumn(personFields.email, {
			accessorKey: "email",
			dataType: "string",
		}),
		fieldColumn(personFields.phone, {
			accessorKey: "phone",
			dataType: "string",
		}),
		fieldColumn(personFields.ventureName, {
			dataType: "string",
			size: SHORT_TEXT_SIZE,
			measureText: false,
			accessorFn: (row) => row.venture?.name ?? "",
		}),
		fieldColumn(personFields.notes, {
			dataType: "string",
			disableRowClick: true,
			size: FREE_TEXT_SIZE,
			measureText: false,
			// Sort/filter on the latest note's text — what the cell shows.
			accessorFn: (row) => {
				const log = row.board?.noteLog ?? [];
				return log.length > 0 ? log[log.length - 1].text : "";
			},
			cell: (info) => <NotesCell row={info.row.original} />,
		}),
		...ventureColumns<ApplicationRow>(),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			// Make guest, make member, turn down, undo deny.
			size: actionsColumnSize(APPLICATION_ACTION_COUNT),
			cell: (info) => <ApplicationActions row={info.row.original} />,
		},
	];
}
