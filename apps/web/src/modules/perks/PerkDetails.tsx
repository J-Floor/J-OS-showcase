import { Accordion, PropertyRow, useSaveTracker } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, createMemo, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { PERK_CATEGORY_LABELS } from "../../../convex/lib/perks.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { call } from "../../lib/call.ts";
import { reportSave } from "../../lib/reportSave.ts";
import {
	createActionError,
	scopeOfFields,
} from "../../shared/createActionError.ts";
import { InlineError } from "../../shared/InlineError.tsx";

import { perkFields } from "./fields.ts";
import { formatValidUntil } from "./perkDate.ts";
import {
	NoContactHint,
	PerkEditorRows,
	type PerkPatch,
} from "./PerkEditor.tsx";
import styles from "./PerkSheet.module.scss";

/**
 * The perk as every viewer reads it: the perk, its partner, until when it
 * runs, who on the board handles requests, and its terms. The link opens in
 * a new tab and gives the partner's page no handle on this one.
 */
function PerkReadOnlyRows(props: { perk: Accessor<PerkRow> }) {
	return (
		<>
			<PropertyRow field={perkFields.partner}>
				<span>{props.perk().partner}</span>
			</PropertyRow>
			<PropertyRow field={perkFields.title}>
				<span>{props.perk().title}</span>
			</PropertyRow>
			<PropertyRow field={perkFields.category}>
				<span>{PERK_CATEGORY_LABELS[props.perk().category]}</span>
			</PropertyRow>
			<PropertyRow field={perkFields.validUntil}>
				<span>{formatValidUntil(props.perk().validUntil)}</span>
			</PropertyRow>
			<Show when={props.perk().link}>
				{(link) => (
					<PropertyRow field={perkFields.link}>
						<a
							class={styles.link}
							href={link()}
							target="_blank"
							rel="noopener noreferrer"
						>
							{link()}
						</a>
					</PropertyRow>
				)}
			</Show>
			<PropertyRow field={perkFields.contact}>
				<Show
					when={props.perk().contactName}
					fallback={<NoContactHint />}
				>
					{(name) => <span>{name()}</span>}
				</Show>
			</PropertyRow>
			<PropertyRow field={perkFields.terms}>
				<p class={styles.terms}>{props.perk().terms}</p>
			</PropertyRow>
		</>
	);
}

/** One change to the open perk, saved at once and reported to the sheet's
 *  save status. A refusal shows under the fields, for the perk it was made
 *  for only (the sheet steps from perk to perk, and a memo of the id lets a
 *  refetch of the same perk keep it); once the sheet has closed, it toasts
 *  instead. */
function createPerkPatch(perk: Accessor<PerkRow>, isOpen: Accessor<boolean>) {
	const updatePerk = useMutation(api.perks.updatePerk);
	const tracker = useSaveTracker();
	const perkId = createMemo(() => perk()._id);
	const { error, trackResult } = createActionError(() => perkId());
	function patch(change: PerkPatch): void {
		// Taken now: a Retry writes to the perk the change was made on.
		const id = perkId();
		const scope = scopeOfFields(change);
		reportSave(
			tracker?.track(scope),
			() =>
				trackResult(
					call(
						updatePerk.mutateAsync({ perkId: id, ...change }),
						"Could not save that change."
					),
					scope
				),
			isOpen
		);
	}
	return { patch, error };
}

/** The "Details" section: the perk as anyone reads it or, while the board
 *  has the sheet unlocked, as editors that save each change at once. The
 *  save and its refusal live here, not in the editors, which unmount when
 *  the board locks the sheet: a refusal that lands just after still shows,
 *  as on the event sheet. */
export function PerkDetailsItem(props: {
	perk: Accessor<PerkRow>;
	isEditing: Accessor<boolean>;
	/** The sheet is open: a change failing once it closed toasts. */
	isOpen: Accessor<boolean>;
}) {
	const { patch, error } = createPerkPatch(
		() => props.perk(),
		() => props.isOpen()
	);
	return (
		<Accordion.Item value="details">
			<Accordion.ItemTitle>Details</Accordion.ItemTitle>
			<Accordion.ItemContent>
				<div class={styles.section}>
					<Show
						when={props.isEditing()}
						fallback={<PerkReadOnlyRows perk={props.perk} />}
					>
						<PerkEditorRows perk={props.perk} onPatch={patch} />
					</Show>
					<InlineError message={error()} />
				</div>
			</Accordion.ItemContent>
		</Accordion.Item>
	);
}
