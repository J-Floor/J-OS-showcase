import { PropertyRow } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PERK_CATEGORY_LABELS } from "../../../convex/lib/perks.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { createEntityPatch } from "../../shared/entity/createEntityPatch.ts";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";
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
 * The perk as every viewer reads it, under the title its sheet heads with:
 * its partner, until when it runs, who on the board handles requests, and
 * its terms. The link opens in a new tab and gives the partner's page no
 * handle on this one.
 */
function PerkReadOnlyRows(props: { perk: Accessor<PerkRow> }) {
	return (
		<>
			<PropertyRow field={perkFields.partner}>
				<span>{props.perk().partner}</span>
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
	const updatePerk = useMutation(api.perks.updatePerk);
	// A refusal belongs to the perk it was made for: the sheet steps from
	// perk to perk.
	const { patch, error } = createEntityPatch<PerkPatch, Id<"perks">>({
		key: () => props.perk()._id,
		write: (perkId, change) =>
			updatePerk.mutateAsync({ perkId, ...change }),
		isOpen: () => props.isOpen(),
	});
	return (
		<SheetSection value="details" title="Details">
			<Show
				when={props.isEditing()}
				fallback={<PerkReadOnlyRows perk={props.perk} />}
			>
				<PerkEditorRows perk={props.perk} onPatch={patch} />
			</Show>
			<InlineError message={error()} />
		</SheetSection>
	);
}
