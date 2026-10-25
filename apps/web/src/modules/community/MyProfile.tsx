import { Input, PropertyRow, Query, SkeletonList } from "@j-os/design-system";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createSignal, For, Show, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { displayName } from "../../../convex/lib/names.ts";
import { MAX_LINKS } from "../../../convex/lib/safeUrl.ts";
import { call } from "../../lib/call.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { buildLinks } from "../signup/links.ts";

import styles from "./MyProfile.module.scss";
import {
	CompanyField,
	DescriptionRow,
	FundingStageField,
	PhoneField,
	ProductStageField,
	TeamSizeField,
	VerticalField,
} from "./ProfileFields.tsx";
import type { VentureLinkValue } from "./VentureLink.tsx";

const LINK_SLOTS = [...Array.from({ length: MAX_LINKS }).keys()];
const OPTIONAL_LINK_SLOTS = LINK_SLOTS.slice(1);
const PROFILE_SKELETON_ROWS = 6;

type OwnPerson = NonNullable<
	FunctionReturnType<typeof api.people.getCurrentPerson>
>;

/** The fields one save changes: `updateOwnProfile`'s arguments. */
export type ProfilePatch = FunctionArgs<typeof api.people.updateOwnProfile>;

// A `type="tel"`/text input isn't sanitised by the browser (tel only hints
// the mobile keypad), so drop anything that isn't a phone character before
// saving — `+`, digits, spaces, hyphens, parens, matching the lenient
// `isValidPhone` rule the sign-up form validates against.
function sanitizePhone(value: string): string {
	return value.replaceAll(/[^\d+()\s-]/g, "");
}

/**
 * A non-board member's own editable profile. Reads the caller's live row from
 * `getCurrentPerson` each render (never a snapshot — apps/web/AGENTS.md's
 * sheet-snapshot rule) and saves each field via the self-scoped
 * `updateOwnProfile`. Name/email are read-only; the application answers
 * (whyJoin/pastBuilt) are not rendered. Field editors are the SAME shared
 * components the board sheet uses, so the two never drift.
 */
export function MyProfile() {
	const me = useQuery(api.people.getCurrentPerson, {});
	const update = useMutation(api.people.updateOwnProfile);
	const { error, trackResult } = createActionError();
	async function patch(fields: ProfilePatch): Promise<void> {
		await trackResult(
			call(update.mutateAsync(fields), "Could not save your profile.")
		);
	}
	return (
		<Query.Root data={me.data()}>
			<Query.Skeleton>
				<SkeletonList rows={PROFILE_SKELETON_ROWS} />
			</Query.Skeleton>
			<Query.Empty>
				<p>No profile found.</p>
			</Query.Empty>
			<Query.Content of={me.data()}>
				{(person) => (
					<>
						<ProfileForm
							person={person}
							onPatch={(fields) => void patch(fields)}
						/>
						<InlineError message={error()} />
					</>
				)}
			</Query.Content>
		</Query.Root>
	);
}

/** The member's profile fields, each saved on commit through `onPatch`. Takes
 *  the person as an accessor so a query push updates the fields in place. */
function ProfileForm(props: {
	person: Accessor<OwnPerson>;
	onPatch: (fields: ProfilePatch) => void;
}) {
	function person() {
		return props.person();
	}
	return (
		<div class={styles.form}>
			<PropertyRow icon={ICONS.email} label="Email">
				<span>{person().email}</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.name} label="Name">
				<span>{displayName(person())}</span>
			</PropertyRow>
			<PhoneField
				value={person().phone}
				onCommit={(value) => {
					props.onPatch({ phone: sanitizePhone(value) });
				}}
			/>
			<CompanyField
				label="Company"
				value={person().venture?.name}
				onCommit={(value) => {
					props.onPatch({ ventureName: value });
				}}
			/>
			<DescriptionRow
				value={person().venture?.description}
				onCommit={(value) => {
					props.onPatch({ description: value });
				}}
			/>
			<VerticalField
				value={person().vertical}
				onCommit={(value) => {
					props.onPatch({ vertical: value });
				}}
			/>
			<ProductStageField
				value={person().venture?.productStage}
				onCommit={(value) => {
					props.onPatch({ productStage: value });
				}}
			/>
			<FundingStageField
				value={person().venture?.fundingStage}
				onCommit={(value) => {
					props.onPatch({ fundingStage: value });
				}}
			/>
			<TeamSizeField
				value={person().venture?.teamSize}
				onCommit={(value) => {
					props.onPatch({ teamSize: value });
				}}
			/>
			<PropertyRow icon={ICONS.link} label="Links">
				<LinksEditor
					initial={person().venture?.links ?? []}
					onSave={(links) => {
						props.onPatch({ links });
					}}
				/>
			</PropertyRow>
		</div>
	);
}

/**
 * Up to 4 URL slots with the sign-up form's progressive reveal
 * (`SignUp.tsx:551-586`): each optional slot appears once the previous has a
 * value, and only the contiguous filled prefix is saved (via the shared
 * `buildLinks`). Seeded once from the member's current links at mount; on blur
 * it rebuilds the array and calls `onSave`. The parent `Query.Content` is
 * non-keyed (see `MyProfile`), so this mounts once and `slots` persists in
 * place across saves — a query push after saving one field no longer remounts
 * this editor and drops whatever the user is mid-typing into another slot.
 */
function LinksEditor(props: {
	initial: VentureLinkValue[];
	onSave: (links: NonNullable<ProfilePatch["links"]>) => void;
}) {
	const seed = LINK_SLOTS.map((index) => props.initial[index]?.url ?? "");
	const [slots, setSlots] = createSignal<string[]>(seed);
	function setSlot(index: number, value: string): void {
		setSlots((prev) => {
			const next = [...prev];
			next[index] = value;
			return next;
		});
	}
	function commit(): void {
		// Pass the member's existing links so an unchanged slot keeps its label.
		props.onSave(buildLinks(slots(), props.initial));
	}
	return (
		<div class={styles.links}>
			<Input
				label="Link 1"
				labelHidden
				type="url"
				placeholder="https://…"
				leadingIconName={ICONS.link}
				value={slots()[0]}
				onValueChange={(event) => {
					setSlot(0, event.currentTarget.value);
				}}
				onBlur={commit}
			/>
			<For each={OPTIONAL_LINK_SLOTS}>
				{(index) => (
					<Show when={slots()[index - 1].trim() !== ""}>
						<Input
							label={`Link ${index + 1}`}
							labelHidden
							type="url"
							placeholder="https://… (optional)"
							leadingIconName={ICONS.link}
							value={slots()[index]}
							onValueChange={(event) => {
								setSlot(index, event.currentTarget.value);
							}}
							onBlur={commit}
						/>
					</Show>
				)}
			</For>
		</div>
	);
}
