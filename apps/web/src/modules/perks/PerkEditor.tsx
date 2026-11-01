import {
	DatePicker,
	EditableText,
	IconButton,
	PropertyRow,
} from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { Show, type Accessor, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { NAME_MAX, TEXT_MAX } from "../../../convex/lib/validate.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { Can } from "../../lib/ability.tsx";
import { PersonSelect } from "../../shared/components/PersonSelect.tsx";
import { useBoardLevel } from "../../shared/data/boardLevel.tsx";
import { ICONS } from "../../shared/icons.ts";

import { EnumSelect } from "./EnumSelect.tsx";
import { perkFields } from "./fields.ts";
import styles from "./PerkEditor.module.scss";
import { PERK_CATEGORY_OPTIONS } from "./perkOptions.ts";

/** The fields one edit writes: any subset of what `updatePerk` takes. */
export type PerkPatch = Omit<
	FunctionArgs<typeof api.perks.updatePerk>,
	"perkId"
>;

/** Where the contact goes on a perk without one, for the board, who can
 *  pick one. */
const NO_CONTACT_HINT = "No contact. Pick one.";

type RowProps = {
	perk: Accessor<PerkRow>;
	onPatch: (patch: PerkPatch) => void;
};

/** The required text fields: their row, their limit and the patch a commit
 *  writes. The terms run long, so they get a multiline editor. */
const TEXT_FIELDS = {
	partner: {
		field: perkFields.partner,
		maxLength: NAME_MAX,
		isMultiline: false,
		patch: (value: string): PerkPatch => ({ partner: value }),
	},
	title: {
		field: perkFields.title,
		maxLength: NAME_MAX,
		isMultiline: false,
		patch: (value: string): PerkPatch => ({ title: value }),
	},
	terms: {
		field: perkFields.terms,
		maxLength: TEXT_MAX,
		isMultiline: true,
		patch: (value: string): PerkPatch => ({ terms: value }),
	},
};

/** A required text field, committed on blur. The server refuses one left
 *  blank ("Partner, perk and terms are required."), and the refusal shows
 *  under the fields. */
function TextRow(
	props: RowProps & { name: keyof typeof TEXT_FIELDS }
): JSX.Element {
	function textField() {
		return TEXT_FIELDS[props.name];
	}
	return (
		<PropertyRow field={textField().field}>
			<EditableText
				label={textField().field.label}
				value={props.perk()[props.name]}
				maxLength={textField().maxLength}
				multiline={textField().isMultiline}
				onCommit={(value) => {
					props.onPatch(textField().patch(value));
				}}
			/>
		</PropertyRow>
	);
}

/** The category, saved as soon as another one is picked. */
function CategoryRow(props: RowProps): JSX.Element {
	return (
		<PropertyRow field={perkFields.category}>
			<EnumSelect
				label={perkFields.category.label}
				labelHidden
				options={PERK_CATEGORY_OPTIONS}
				value={props.perk().category}
				onChange={(category) => {
					props.onPatch({ category });
				}}
			/>
		</PropertyRow>
	);
}

/** The end date, saved when another one is picked. The date field has no
 *  clear of its own, so a button beside it removes the date, and the perk
 *  then never expires. */
function ValidUntilRow(props: RowProps): JSX.Element {
	function current(): string | null {
		return props.perk().validUntil ?? null;
	}
	return (
		<PropertyRow field={perkFields.validUntil}>
			<div class={styles.dateRow}>
				<DatePicker
					label={perkFields.validUntil.label}
					labelHidden
					value={current()}
					onValueChange={(validUntil) => {
						if (validUntil !== current())
							props.onPatch({ validUntil });
					}}
				/>
				<Show when={current() !== null}>
					<IconButton
						tooltipLabel="Clear the end date"
						onClick={() => {
							props.onPatch({ validUntil: null });
						}}
					>
						{ICONS.close}
					</IconButton>
				</Show>
			</div>
		</PropertyRow>
	);
}

/** The partner's link, committed on blur. Emptying it sends `null`, which
 *  removes the link. */
function LinkRow(props: RowProps): JSX.Element {
	return (
		<PropertyRow field={perkFields.link}>
			<EditableText
				label={perkFields.link.label}
				value={props.perk().link ?? ""}
				placeholder="https://…"
				maxLength={TEXT_MAX}
				onCommit={(value) => {
					props.onPatch({ link: value.trim() === "" ? null : value });
				}}
			/>
		</PropertyRow>
	);
}

/** The board contact, picked from the board and admins with access. A perk
 *  needs one, so it can be changed but not cleared. */
function ContactRow(props: RowProps): JSX.Element {
	const boardLevel = useBoardLevel();
	return (
		<PropertyRow field={perkFields.contact}>
			<PersonSelect
				label={perkFields.contact.label}
				people={boardLevel.data() ?? []}
				value={props.perk().contactId}
				placeholder={NO_CONTACT_HINT}
				allowClearing={false}
				onChange={(contactId) => {
					if (
						contactId === undefined ||
						contactId === props.perk().contactId
					)
						return;
					props.onPatch({ contactId });
				}}
			/>
		</PropertyRow>
	);
}

/**
 * The perk's fields as editors, for the board while the sheet is unlocked,
 * in the order the read-only rows show them. Each change saves on its own
 * through `onPatch`: text on blur, pickers on change. Clearing the link or
 * the end date sends `null`, which removes it.
 */
export function PerkEditorRows(props: RowProps): JSX.Element {
	return (
		<>
			<TextRow name="partner" perk={props.perk} onPatch={props.onPatch} />
			<TextRow name="title" perk={props.perk} onPatch={props.onPatch} />
			<CategoryRow perk={props.perk} onPatch={props.onPatch} />
			<ValidUntilRow perk={props.perk} onPatch={props.onPatch} />
			<LinkRow perk={props.perk} onPatch={props.onPatch} />
			<ContactRow perk={props.perk} onPatch={props.onPatch} />
			<TextRow name="terms" perk={props.perk} onPatch={props.onPatch} />
		</>
	);
}

/** The read-only contact row of a perk without a contact. The board, who
 *  can pick one, is told to. */
export function NoContactHint(): JSX.Element {
	return (
		<Can
			I="manage"
			the="Perks"
			fallback={<span class={styles.hint}>No contact</span>}
		>
			<span class={styles.hint}>{NO_CONTACT_HINT}</span>
		</Can>
	);
}
