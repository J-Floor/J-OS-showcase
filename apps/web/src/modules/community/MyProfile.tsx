import { Input, PropertyRow } from "@j-os/design-system";
import { useMutation, useQuery } from "convex-solidjs";
import { createSignal, For, Show, Suspense } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { ICONS } from "../../shared/icons.ts";
import { buildLinks } from "../signup/links.ts";

import styles from "./MyProfile.module.scss";
import {
	CompanyField,
	DescriptionField,
	FundingStageField,
	PhoneField,
	ProductStageField,
	TeamSizeField,
	VerticalField,
} from "./ProfileFields.tsx";

/**
 * A non-board member's own editable profile. Reads the caller's live row from
 * `getCurrentPerson` each render (never a snapshot — apps/web/AGENTS.md's
 * drawer-snapshot rule) and saves each field via the self-scoped
 * `updateOwnProfile`. Name/email are read-only; the application answers
 * (whyJoin/pastBuilt) are not rendered. Field editors are the SAME shared
 * components the board drawer uses, so the two never drift.
 */
export function MyProfile() {
	const me = useQuery(api.people.getCurrentPerson, {});
	const update = useMutation(api.people.updateOwnProfile);
	function patch(fields: Record<string, unknown>): void {
		void update.mutateAsync(fields);
	}
	// A `type="tel"`/text input isn't sanitised by the browser (tel only hints
	// the mobile keypad), so drop anything that isn't a phone character before
	// saving — `+`, digits, spaces, hyphens, parens, matching the lenient
	// `isValidPhone` rule the sign-up form validates against.
	function sanitizePhone(value: string): string {
		return value.replace(/[^\d+()\s-]/g, "");
	}
	return (
		<Suspense fallback={<p>Loading your profile…</p>}>
			<Show when={me.data()} fallback={<p>No profile found.</p>}>
				{(p) => (
					<div class={styles.form}>
						<PropertyRow icon={ICONS.email} label="Email">
							<span>{p().email}</span>
						</PropertyRow>
						<PropertyRow icon={ICONS.name} label="Name">
							<span>
								{`${p().firstName} ${p().lastName}`.trim()}
							</span>
						</PropertyRow>
						<PhoneField
							value={p().phone}
							onCommit={(v) => {
								patch({ phone: sanitizePhone(v) });
							}}
						/>
						<CompanyField
							label="Company"
							value={p().venture?.name}
							onCommit={(v) => {
								patch({ ventureName: v });
							}}
						/>
						<DescriptionField
							value={p().venture?.description}
							onCommit={(v) => {
								patch({ description: v });
							}}
						/>
						<VerticalField
							value={p().vertical}
							onCommit={(v) => {
								patch({ vertical: v });
							}}
						/>
						<ProductStageField
							value={p().venture?.productStage}
							onCommit={(v) => {
								patch({ productStage: v });
							}}
						/>
						<FundingStageField
							value={p().venture?.fundingStage}
							onCommit={(v) => {
								patch({ fundingStage: v });
							}}
						/>
						<TeamSizeField
							value={p().venture?.teamSize}
							onCommit={(v) => {
								patch({ teamSize: v });
							}}
						/>
						<PropertyRow icon={ICONS.link} label="Links">
							<LinksEditor
								initial={p().venture?.links ?? []}
								onSave={(links) => {
									patch({ links });
								}}
							/>
						</PropertyRow>
					</div>
				)}
			</Show>
		</Suspense>
	);
}

/**
 * Up to 4 URL slots with the sign-up form's progressive reveal
 * (`SignUp.tsx:551-586`): each optional slot appears once the previous has a
 * value, and only the contiguous filled prefix is saved (via the shared
 * `buildLinks`). Seeded once from the member's current links at mount; on blur
 * it rebuilds the array and calls `onSave`. The parent `<Show>` is non-keyed
 * (see `MyProfile`), so this mounts once and `slots` persists in place across
 * saves — a query push after saving one field no longer remounts this editor
 * and drops whatever the user is mid-typing into another slot.
 */
function LinksEditor(props: {
	initial: { label: string; url: string }[];
	onSave: (links: { label: string; url: string }[]) => void;
}) {
	const seed = [0, 1, 2, 3].map((i) => props.initial[i]?.url ?? "");
	const [slots, setSlots] = createSignal<string[]>(seed);
	function setSlot(i: number, value: string): void {
		setSlots((prev) => {
			const next = [...prev];
			next[i] = value;
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
				type="url"
				placeholder="https://…"
				leadingIconName={ICONS.link}
				value={slots()[0]}
				onValueChange={(e) => {
					setSlot(0, e.currentTarget.value);
				}}
				onBlur={commit}
			/>
			<For each={[1, 2, 3]}>
				{(i) => (
					<Show when={slots()[i - 1].trim() !== ""}>
						<Input
							type="url"
							placeholder="https://… (optional)"
							leadingIconName={ICONS.link}
							value={slots()[i]}
							onValueChange={(e) => {
								setSlot(i, e.currentTarget.value);
							}}
							onBlur={commit}
						/>
					</Show>
				)}
			</For>
		</div>
	);
}
