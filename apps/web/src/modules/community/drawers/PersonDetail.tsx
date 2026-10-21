import { Accordion, isTypingTarget } from "@j-os/design-system";
import { createHotkey, type Hotkey } from "@tanstack/solid-hotkeys";
import { useMutation } from "convex-solidjs";
import { createSignal, onMount, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { call } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { headline } from "../status/copy.ts";
import { PersonTimeline } from "../status/PersonTimeline.tsx";
import { StatusSection } from "../status/StatusSection.tsx";

import { BoardNotes } from "./BoardNotes.tsx";
import styles from "./PersonDetail.module.scss";
import { EditableDetail } from "./PersonEditor.tsx";
import { ReadOnlyDetail } from "./PersonReadOnly.tsx";

/** The drawer's collapsible sections and the key that toggles each — the key is
 * the section's own initial (Status/Info/Notes/History), shown as a header chip
 * while peeking and bound below. */
const ACCORDION_SECTIONS: { value: string; key: Hotkey }[] = [
	{ value: "status", key: "S" },
	{ value: "info", key: "I" },
	{ value: "notes", key: "N" },
	{ value: "history", key: "H" },
];

/**
 * Which accordion sections are open, controlled so the S/I/N/H keys can toggle
 * them. `assignAnchor` goes on the panel's root as its `ref`.
 */
function useDrawerSections() {
	// Section open state, controlled so the S/I/N/H keys can toggle it. Status,
	// Info and Notes start open; History is the long audit log you open
	// deliberately.
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

	// Scope the S/I/H keys to the open drawer, the DrawerNav way: a ref on this
	// panel's root, `closest` up to Ark's dialog content, and `target` on each
	// binding so they fire only while focus is inside the drawer — never on the
	// roster behind it, and never once it has closed (Ark keeps the content
	// mounted, but focus has left). `isTypingTarget` still guards the editable
	// fields inside, so typing into one never toggles a section.
	let anchorElement: HTMLDivElement | undefined;
	function assignAnchor(element: HTMLDivElement): void {
		anchorElement = element;
	}
	const [drawerElement, setDrawerElement] = createSignal<HTMLElement>();
	onMount(() => {
		setDrawerElement(
			anchorElement?.closest<HTMLElement>(
				'[data-scope="dialog"][data-part="content"]'
			) ?? undefined
		);
	});
	for (const section of ACCORDION_SECTIONS) {
		createHotkey(
			section.key,
			(event) => {
				if (event.repeat || isTypingTarget(event.target)) return;
				event.preventDefault();
				toggleSection(section.value);
			},
			() => ({
				target: drawerElement(),
				ignoreInputs: false,
				preventDefault: false,
			})
		);
	}

	return { openSections, setOpenSections, assignAnchor };
}

function StatusSectionItem(props: {
	person: Doc<"people"> & { status: PersonStatus };
	editing?: boolean;
}) {
	const completeBoardStep = useMutation(api.people.completeBoardStep);
	const { error: stepError, trackResult } = createActionError(
		() => props.person._id
	);
	return (
		<Accordion.Item value="status" class={styles.section}>
			{/* Plain text, not a Badge: the accordion's subtitle is a
		    second line under the title, and a pill there wraps onto
		    its own line and drags the header out of alignment. The
		    colour it carried was misleading anyway — it went red for a
		    missing agreement, which made a perfectly active member
		    read as though their membership were the problem. */}
			<Accordion.ItemTitle
				subtitle={headline(props.person.status)}
				shortcut="S"
			>
				Status
			</Accordion.ItemTitle>
			<Accordion.ItemContent class={styles.sectionBody}>
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
 * Detail panel for a person inside the drawer, in four collapsible sections:
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
	person: Doc<"people"> & { status: PersonStatus };
	editing?: boolean;
}) {
	const sections = useDrawerSections();

	return (
		<div ref={sections.assignAnchor}>
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
				/>
				<Accordion.Item value="info" class={styles.section}>
					<Accordion.ItemTitle shortcut="I">Info</Accordion.ItemTitle>
					<Accordion.ItemContent class={styles.sectionBody}>
						<Show
							when={props.editing}
							fallback={<ReadOnlyDetail person={props.person} />}
						>
							<EditableDetail person={props.person} />
						</Show>
					</Accordion.ItemContent>
				</Accordion.Item>
				<Accordion.Item value="notes" class={styles.section}>
					{/* The board's own channel, its own section — a thread you add to
					    without entering edit mode, open by default because it is where
					    triage happens. */}
					<Accordion.ItemTitle shortcut="N">
						Notes
					</Accordion.ItemTitle>
					<Accordion.ItemContent class={styles.sectionBody}>
						<BoardNotes person={props.person} />
					</Accordion.ItemContent>
				</Accordion.Item>
				<Accordion.Item value="history" class={styles.section}>
					<Accordion.ItemTitle shortcut="H">
						History
					</Accordion.ItemTitle>
					<Accordion.ItemContent class={styles.sectionBody}>
						{/* Mounted only once the section is opened: the timeline
				    opens its own Convex subscription, and the drawer is
				    re-rendered for every row the board steps through. */}
						<PersonTimeline personId={props.person._id} />
					</Accordion.ItemContent>
				</Accordion.Item>
			</Accordion.Root>
		</div>
	);
}
