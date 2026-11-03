import { Accordion, useOverlayCovered } from "@j-os/design-system";
import type { Hotkey } from "@tanstack/solid-hotkeys";
import { useMutation } from "convex-solidjs";
import { type Accessor, createSignal, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { PersonRow } from "../../../../convex/people.ts";
import { call } from "../../../lib/call.ts";
import { createActionKeys } from "../../../shared/actions/createActionKeys.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { headline } from "../status/copy.ts";
import { PersonTimeline } from "../status/PersonTimeline.tsx";
import { StatusSection } from "../status/StatusSection.tsx";

import { BoardNotes } from "./BoardNotes.tsx";
import { EditableDetail } from "./PersonEditor.tsx";
import { ReadOnlyDetail } from "./PersonReadOnly.tsx";

/** The sheet's collapsible sections and the key that toggles each — the key is
 * the section's own initial (Status/Info/Notes/History), shown as a header chip
 * while peeking and bound below. */
const SECTION_KEYS = {
	status: "S",
	info: "I",
	notes: "N",
	history: "H",
} as const satisfies Record<string, Hotkey>;

/** Where the section keys are live: the person sheet they sit in. */
const SECTIONS_SCOPE = "person-sections";

/**
 * Which accordion sections are open, controlled so the S/I/N/H keys can toggle
 * them. N is the exception: it opens Notes if collapsed, never closes it, and
 * puts the cursor in the composer, so one key starts a note. The keys are
 * bound inside the sheet (`createActionKeys`), so they are live only while it
 * is open (`isOpen`), quiet under anything shown over it and while typing
 * into one of its fields, and a held key fires once. `shortcut` is a
 * section's chip: none while the sheet is covered, where its key does
 * nothing. `assignNotes` goes on the Notes item as its `ref`.
 */
function useSheetSections(isOpen: Accessor<boolean>, person: () => PersonRow) {
	// Status, Info and Notes start open; History is the long audit log you
	// open deliberately.
	const [openSections, setOpenSections] = createSignal<string[]>([
		"status",
		"info",
		"notes",
	]);
	function toggleSection(value: string): void {
		setOpenSections((prev) =>
			prev.includes(value)
				? prev.filter((entry) => entry !== value)
				: [...prev, value]
		);
	}
	let notesItem: HTMLDivElement | undefined;
	function startNote(): void {
		setOpenSections((prev) =>
			prev.includes("notes") ? prev : [...prev, "notes"]
		);
		// A collapsed Notes mounts its composer on the next frame.
		requestAnimationFrame(() => {
			notesItem?.querySelector("textarea")?.focus();
		});
	}

	const actions = Object.entries(SECTION_KEYS).map(
		([value, hotkey]): ActionDescriptor<PersonRow> => ({
			id: `section-${value}`,
			label: value === "notes" ? "Write a note" : `Toggle ${value}`,
			icon: ICONS.expandAll,
			hotkey,
			can: () => true,
			run: () => {
				if (value === "notes") startNote();
				else toggleSection(value);
			},
		})
	);
	createActionKeys<PersonRow>({
		scope: SECTIONS_SCOPE,
		actions: () => actions,
		target: () => (isOpen() ? person() : undefined),
		active: isOpen,
	});
	const isCovered = useOverlayCovered();
	function shortcut(section: keyof typeof SECTION_KEYS): Hotkey | undefined {
		return isCovered() ? undefined : SECTION_KEYS[section];
	}

	return {
		openSections,
		setOpenSections,
		shortcut,
		assignNotes: (element: HTMLDivElement) => {
			notesItem = element;
		},
	};
}

function StatusSectionItem(props: {
	person: PersonRow;
	editing?: boolean;
	shortcut?: Hotkey;
}) {
	const completeBoardStep = useMutation(api.people.completeBoardStep);
	const { error: stepError, trackResult } = createActionError(
		() => props.person._id
	);
	return (
		<Accordion.Item value="status">
			{/* Plain text, not a Badge: the accordion's subtitle is a
		    second line under the title, and a pill there wraps onto
		    its own line and drags the header out of alignment. The
		    colour it carried was misleading anyway — it went red for a
		    missing agreement, which made a perfectly active member
		    read as though their membership were the problem. */}
			<Accordion.ItemTitle shortcut={props.shortcut}>
				Status
				<Accordion.ItemSubtitle>
					{headline(props.person.status)}
				</Accordion.ItemSubtitle>
			</Accordion.ItemTitle>
			<Accordion.ItemContent>
				<StatusSection
					status={props.person.status}
					person={props.person}
					editing={props.editing}
					onCompleteBoardTask={(stepId) => {
						// `stepId` comes from the task itself. Hardcoding
						// "whatsapp" here is right only for as long as
						// BOARD_STEPS has exactly one entry, which is not a
						// property anything enforces.
						void trackResult(
							call(
								completeBoardStep.mutateAsync({
									personId: props.person._id,
									stepId,
								}),
								"Could not complete that step."
							)
						);
					}}
				/>
				<InlineError message={stepError()} />
			</Accordion.ItemContent>
		</Accordion.Item>
	);
}

/**
 * Detail panel for a person inside the sheet, in four collapsible sections:
 * **Status** (what the machine says), **Info** (their profile), **Notes** (the
 * board's attributed thread) and **History** (the audit log).
 *
 * Status, Info and Notes open by default; History does not — it is the longest
 * section and the one you go looking for deliberately. All four can be open at
 * once.
 *
 * Info is read-only by default; when `editing` is set, the profile fields become
 * inputs that save (board-gated `people.update`) on blur/change. Identity and
 * workflow fields (email, access window) stay read-only regardless — they're
 * managed by the role dialog and the triage actions, and reported by the Status
 * section instead.
 */
export function PersonDetail(props: {
	person: PersonRow;
	editing?: boolean;
	/** The sheet is open: its section keys are live, and an edit failing
	 *  once it closed toasts. */
	isOpen: Accessor<boolean>;
}) {
	const sections = useSheetSections(
		() => props.isOpen(),
		() => props.person
	);

	return (
		<Accordion.Root
			multiple
			lazyMount
			value={sections.openSections()}
			onValueChange={(details) => {
				sections.setOpenSections(details.value);
			}}
		>
			<StatusSectionItem
				person={props.person}
				editing={props.editing}
				shortcut={sections.shortcut("status")}
			/>
			<Accordion.Item value="info">
				<Accordion.ItemTitle shortcut={sections.shortcut("info")}>
					Info
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<Show
						when={props.editing}
						fallback={<ReadOnlyDetail person={props.person} />}
					>
						<EditableDetail
							person={props.person}
							isOpen={props.isOpen}
						/>
					</Show>
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="notes" ref={sections.assignNotes}>
				{/* The board's own channel, its own section — a thread you add to
				    without entering edit mode, open by default because it is where
				    triage happens. */}
				<Accordion.ItemTitle shortcut={sections.shortcut("notes")}>
					Notes
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<BoardNotes person={props.person} />
				</Accordion.ItemContent>
			</Accordion.Item>
			<Accordion.Item value="history">
				<Accordion.ItemTitle shortcut={sections.shortcut("history")}>
					History
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					{/* Mounted only once the section is opened: the timeline
			    opens its own Convex subscription, and the sheet is
			    re-rendered for every row the board steps through. */}
					<PersonTimeline personId={props.person._id} />
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}
