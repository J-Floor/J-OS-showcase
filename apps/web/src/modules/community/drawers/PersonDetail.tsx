import {
	Accordion,
	Button,
	EditableText,
	isTypingTarget,
	PropertyRow,
} from "@j-os/design-system";
import { createHotkey, type Hotkey } from "@tanstack/solid-hotkeys";
import { useMutation, useQuery } from "convex-solidjs";
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { formatDate } from "../../../shared/time.ts";
import { userErrorMessage } from "../../../shared/userErrorMessage.ts";
import { HostSelect } from "../columns/HostSelect.tsx";
import {
	CompanyField,
	DescriptionField,
	FundingStageField,
	PastBuiltField,
	PhoneField,
	ProductStageField,
	ReferralField,
	VerticalField,
	WhyJoinField,
} from "../ProfileFields.tsx";
import { headline } from "../status/copy.ts";
import { PersonTimeline } from "../status/PersonTimeline.tsx";
import { StatusSection } from "../status/StatusSection.tsx";
import { VentureLink } from "../VentureLink.tsx";

import { BoardNotes } from "./BoardNotes.tsx";
import {
	fundingStageLabel,
	productStageLabel,
	verticalsLabel,
} from "./labels.ts";
import styles from "./PersonDetail.module.scss";

/** The drawer's collapsible sections and the key that toggles each — the key is
 * the section's own initial (Status/Info/Notes/History), shown as a header chip
 * while peeking and bound below. */
const ACCORDION_SECTIONS: { value: string; key: Hotkey }[] = [
	{ value: "status", key: "S" },
	{ value: "info", key: "I" },
	{ value: "notes", key: "N" },
	{ value: "history", key: "H" },
];

/** Resolves a person's host to a display name: the referenced board member's
 * name via `hostedById`, falling back to the legacy `hostedBy` string. */
function HostName(props: { person: Doc<"people"> }) {
	const boardLevel = useBoardLevel();
	function name(): string | undefined {
		const id = props.person.hostedById;
		if (id) {
			const s = (boardLevel.data() ?? []).find((p) => p._id === id);
			if (s) return `${s.firstName} ${s.lastName}`.trim();
		}
		return props.person.hostedBy;
	}
	return <span>{name() ?? "—"}</span>;
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
	const completeBoardStep = useMutation(api.people.completeBoardStep);

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
				? prev.filter((v) => v !== value)
				: [...prev, value]
		);
	}

	// Scope the S/I/H keys to the open drawer, the DrawerNav way: a ref on this
	// panel's root, `closest` up to Ark's dialog content, and `target` on each
	// binding so they fire only while focus is inside the drawer — never on the
	// roster behind it, and never once it has closed (Ark keeps the content
	// mounted, but focus has left). `isTypingTarget` still guards the editable
	// fields inside, so typing into one never toggles a section.
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref` binding below
	let anchorRef: HTMLDivElement | undefined;
	const [drawerEl, setDrawerEl] = createSignal<HTMLElement>();
	onMount(() => {
		setDrawerEl(
			anchorRef?.closest<HTMLElement>(
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
				target: drawerEl(),
				ignoreInputs: false,
				preventDefault: false,
			})
		);
	}

	return (
		<div ref={anchorRef}>
			<Accordion.Root
				multiple
				lazyMount
				value={openSections()}
				onValueChange={(details) => {
					setOpenSections(details.value);
				}}
			>
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
								void completeBoardStep.mutateAsync({
									personId: props.person._id,
									stepId,
								});
							}}
						/>
					</Accordion.ItemContent>
				</Accordion.Item>
				<Accordion.Item value="info" class={styles.section}>
					<Accordion.ItemTitle shortcut="I">Info</Accordion.ItemTitle>
					<Accordion.ItemContent class={styles.sectionBody}>
						<Show
							when={props.editing}
							fallback={<ReadOnly person={props.person} />}
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

/** Editable field list; saves each field via `people.update` on blur/change.
 * Mounted only in edit mode (so the read-only view needs no Convex mutation). */
function EditableDetail(props: { person: Doc<"people"> }) {
	const update = useMutation(api.people.update);
	const setHost = useMutation(api.people.setHost);
	function p() {
		return props.person;
	}
	function patch(fields: Record<string, unknown>): void {
		void update.mutateAsync({ id: p()._id, ...fields });
	}
	const cancelEmailChange = useMutation(api.people.cancelEmailChange);
	// The stored email stays until the new address confirms
	// (`people.confirmEmailChange`); until then the change is pending here.
	const pendingEmail = useQuery(api.people.pendingEmailChange, () => ({
		personId: p()._id,
	}));
	const [emailError, setEmailError] = createSignal<string | null>(null);
	// The drawer is re-used as the board steps through rows, so a clash error
	// for one person must not linger on the next.
	createEffect(
		on(
			() => p()._id,
			() => {
				setEmailError(null);
			},
			{ defer: true }
		)
	);
	async function commitEmail(next: string): Promise<void> {
		setEmailError(null);
		const id = p()._id;
		try {
			await update.mutateAsync({ id, email: next });
		} catch (err) {
			// The board may have stepped to another person while this was in
			// flight; the refusal belongs to the person it was made for.
			if (p()._id === id)
				setEmailError(
					userErrorMessage(err, "Could not change the email.")
				);
		}
	}
	return (
		<div>
			<PropertyRow icon={ICONS.email} label="Email">
				<EditableText
					value={p().email}
					onCommit={(v) => {
						void commitEmail(v);
					}}
				/>
			</PropertyRow>
			<Show when={emailError()}>
				{(message) => (
					<p class={styles.fieldError} role="alert">
						{message()}
					</p>
				)}
			</Show>
			<Show when={pendingEmail.data()?.newEmail} keyed>
				{(address) => (
					<div class={styles.pendingEmail} role="status">
						<p class={styles.fieldNote}>
							Waiting for {address} to confirm
						</p>
						<Button
							variant="tertiary"
							onClick={() =>
								void cancelEmailChange.mutateAsync({
									personId: p()._id,
								})
							}
						>
							Cancel
						</Button>
					</div>
				)}
			</Show>
			<PropertyRow icon={ICONS.name} label="First name">
				<EditableText
					value={p().firstName}
					onCommit={(v) => {
						patch({ firstName: v });
					}}
				/>
			</PropertyRow>
			<PropertyRow icon={ICONS.name} label="Last name">
				<EditableText
					value={p().lastName}
					onCommit={(v) => {
						patch({ lastName: v });
					}}
				/>
			</PropertyRow>
			<PhoneField
				value={p().phone}
				onCommit={(v) => {
					patch({ phone: v });
				}}
			/>
			<CompanyField
				label="Venture"
				value={p().venture?.name}
				onCommit={(v) => {
					patch({ ventureName: v });
				}}
			/>
			<VerticalField
				value={p().vertical}
				onCommit={(v) => {
					patch({ vertical: v });
				}}
			/>
			{/* Hosting stays here — guest-only, board-managed, not a shared field. */}
			<Show when={p().tier === "guest"}>
				<PropertyRow icon={ICONS.host} label="Hosted by">
					<HostSelect
						value={p().hostedById ?? null}
						placeholder={
							p().hostedBy
								? `${p().hostedBy} — re-pick`
								: undefined
						}
						onCommit={(id) => {
							void setHost.mutateAsync({
								id: p()._id,
								hostedById: id,
							});
						}}
					/>
				</PropertyRow>
			</Show>
			<VentureEditor person={p()} patch={patch} />
		</div>
	);
}

/**
 * The applicant's own answers, editable. Kept beside the read-only version in
 * {@link VentureDetail}: the two must offer the same fields, or editing a
 * person silently hides half their profile — which is exactly what happened
 * when the Applications drawer was a separate component from this one.
 */
function VentureEditor(props: {
	person: Doc<"people">;
	patch: (fields: Record<string, unknown>) => void;
}) {
	function v() {
		return props.person.venture;
	}
	return (
		<>
			<DescriptionField
				value={v()?.description}
				onCommit={(value) => {
					props.patch({ description: value });
				}}
			/>
			<PastBuiltField
				value={v()?.pastBuilt}
				onCommit={(value) => {
					props.patch({ pastBuilt: value });
				}}
			/>
			<WhyJoinField
				value={v()?.whyJoin}
				onCommit={(value) => {
					props.patch({ whyJoin: value });
				}}
			/>
			<ProductStageField
				value={v()?.productStage}
				onCommit={(value) => {
					props.patch({ productStage: value });
				}}
			/>
			<FundingStageField
				value={v()?.fundingStage}
				onCommit={(value) => {
					props.patch({ fundingStage: value });
				}}
			/>
			<ReferralField
				value={v()?.referral}
				onCommit={(value) => {
					props.patch({ referral: value });
				}}
			/>
		</>
	);
}

/** The original read-only field list, shown when not editing. */
function ReadOnly(props: { person: Doc<"people"> }) {
	function p() {
		return props.person;
	}
	return (
		<div>
			<PropertyRow icon={ICONS.email} label="Email">
				<span>{p().email}</span>
			</PropertyRow>
			<Show when={p().phone}>
				<PropertyRow icon={ICONS.phone} label="Phone">
					<span>{p().phone}</span>
				</PropertyRow>
			</Show>
			{/* Access has moved to the Status section, as "Access until" and
			    only for the people who have an end date — it is a fact about
			    their standing, not a profile field, and it read as a permanent
			    "—" on everyone who never expires. */}
			<PropertyRow icon={ICONS.vertical} label="Verticals">
				<span>{verticalsLabel(p().vertical) || "—"}</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.venture} label="Venture">
				<span>{p().venture?.name ?? "—"}</span>
			</PropertyRow>
			<Show when={p().hostedById ?? p().hostedBy}>
				<PropertyRow icon={ICONS.host} label="Hosted by">
					<HostName person={p()} />
				</PropertyRow>
			</Show>
			<AttendedEvents personId={p()._id} />
			<VentureDetail person={p()} />
			<BoardDetail person={p()} />
		</div>
	);
}

/**
 * The event(s) that brought this person in, e.g. a hackathon visitor who later
 * applied — the visitor flow's own origin story. Read-only: derived from
 * attendance rows, not something edited here. Renders nothing for the common
 * case of someone who never attended an event.
 */
function AttendedEvents(props: { personId: Id<"people"> }) {
	const events = useQuery(
		api.people.attendedEvents,
		() => ({
			personId: props.personId,
		}),
		{ keepPreviousData: true }
	);
	function names(): string {
		return (events.data() ?? []).map((e) => e.name).join(", ");
	}
	return (
		<Show when={names()}>
			<PropertyRow icon={ICONS.events} label="Came from">
				<span>{names()}</span>
			</PropertyRow>
		</Show>
	);
}

/**
 * What the board recorded about this person: the score they were given and any
 * notes, plus when they applied.
 *
 * Only shown where there is something to show. A board member has no score and
 * no submission date; an applicant has both. This is the other half of the old
 * `ApplicationDetail`, which existed only because applications used to be a
 * separate table — the moment someone was approved, their score and the board's
 * own notes became unreachable.
 */
function BoardDetail(props: { person: Doc<"people"> }) {
	function p() {
		return props.person;
	}
	return (
		<>
			<Show when={p().board?.score != null}>
				<PropertyRow icon="star" label="Score">
					<span>{String(p().board?.score)}</span>
				</PropertyRow>
			</Show>
			<Show when={p().submittedAt}>
				{(at) => (
					<PropertyRow icon={ICONS.date} label="Applied">
						<span>{formatDate(at())}</span>
					</PropertyRow>
				)}
			</Show>
		</>
	);
}

/**
 * What they told us when they applied: what they are building, what they have
 * built before, why they want in.
 *
 * This lived only in the Applications drawer, which meant the moment someone
 * was approved the board could no longer see why they had approved them —
 * their own notes and the founder's own words disappeared behind the tab
 * change. The fields are on the person now, so the drawer shows them for the
 * whole lifecycle. Every row is conditional: a board member has none of this
 * and should not see nine empty labels.
 */
function VentureDetail(props: { person: Doc<"people"> }) {
	function v() {
		return props.person.venture;
	}
	return (
		<>
			<Show when={v()?.description}>
				<PropertyRow icon={ICONS.description} label="Description">
					<span class={styles.multiline}>{v()?.description}</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.pastBuilt}>
				<PropertyRow icon={ICONS.pastBuilt} label="Past built">
					<span class={styles.multiline}>{v()?.pastBuilt}</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.whyJoin}>
				<PropertyRow icon={ICONS.whyJoin} label="Why join">
					<span class={styles.multiline}>{v()?.whyJoin}</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.productStage}>
				<PropertyRow icon={ICONS.productStage} label="Product stage">
					<span>{productStageLabel(v()?.productStage)}</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.fundingStage}>
				<PropertyRow icon={ICONS.fundingStage} label="Funding stage">
					<span>{fundingStageLabel(v()?.fundingStage)}</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.teamSize != null}>
				<PropertyRow icon={ICONS.teamSize} label="Team size">
					<span>{String(v()?.teamSize)}</span>
				</PropertyRow>
			</Show>
			<Show when={(v()?.links ?? []).length > 0}>
				<PropertyRow icon={ICONS.link} label="Links">
					<span class={styles.links}>
						<For each={v()?.links}>
							{(l) => <VentureLink link={l} />}
						</For>
					</span>
				</PropertyRow>
			</Show>
			<Show when={v()?.referral}>
				<PropertyRow icon={ICONS.share} label="Referral">
					<span>{v()?.referral}</span>
				</PropertyRow>
			</Show>
		</>
	);
}
