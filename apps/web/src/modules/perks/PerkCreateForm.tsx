import { DatePicker, Input, TextArea } from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createSignal, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PerkCategory } from "../../../convex/lib/perks.ts";
import { NAME_MAX, TEXT_MAX } from "../../../convex/lib/validate.ts";
import { call } from "../../lib/call.ts";
import { ActionForm } from "../../shared/actions/ActionForm.tsx";
import {
	CREATE_TARGET,
	type ActionDescriptor,
	type CreateTarget,
	type SettledAction,
} from "../../shared/actions/shortcuts.ts";
import { OptionSelect } from "../../shared/components/OptionSelect.tsx";
import { PersonSelect } from "../../shared/components/PersonSelect.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { useBoardLevel } from "../../shared/data/boardLevel.tsx";
import { InlineError } from "../../shared/InlineError.tsx";

import { perkFields } from "./fields.ts";
import styles from "./PerkCreateForm.module.scss";
import { PERK_CATEGORY_OPTIONS } from "./perkOptions.ts";

const MISSING_FIELDS_REASON =
	"Add the partner, perk, category, contact and terms first";

type PerkCreateArgs = FunctionArgs<typeof api.perks.createPerk>;

/** The form's fields, each a signal and its setter. The link and the end
 *  date are optional; no end date means the perk never expires. */
function createPerkFields() {
	const [partner, setPartner] = createSignal("");
	const [title, setTitle] = createSignal("");
	const [category, setCategory] = createSignal<PerkCategory>();
	const [contactId, setContactId] = createSignal<Id<"people">>();
	const [terms, setTerms] = createSignal("");
	const [link, setLink] = createSignal("");
	const [validUntil, setValidUntil] = createSignal<string | null>(null);
	return {
		partner,
		setPartner,
		title,
		setTitle,
		category,
		setCategory,
		contactId,
		setContactId,
		terms,
		setTerms,
		link,
		setLink,
		validUntil,
		setValidUntil,
		/** Every field back to empty. */
		clearFields: (): void => {
			setPartner("");
			setTitle("");
			setCategory(undefined);
			setContactId(undefined);
			setTerms("");
			setLink("");
			setValidUntil(null);
		},
	};
}

type PerkFields = ReturnType<typeof createPerkFields>;

/** What `createPerk` gets from the form, or null while a required field is
 *  empty. Text is trimmed; an empty link or end date is left out. */
function createArgs(
	fields: Omit<PerkFields, "clearFields">
): PerkCreateArgs | null {
	const category = fields.category();
	const contactId = fields.contactId();
	const partner = fields.partner().trim();
	const title = fields.title().trim();
	const terms = fields.terms().trim();
	if (
		category === undefined ||
		contactId === undefined ||
		[partner, title, terms].includes("")
	)
		return null;
	return {
		partner,
		title,
		terms,
		category,
		contactId,
		link: fields.link().trim() || undefined,
		validUntil: fields.validUntil() ?? undefined,
	};
}

/**
 * The create form's state: its fields, and the mutation that submits them.
 * `onCreated` runs after the perk is created.
 */
export function createPerkCreateForm(options: { onCreated: () => void }) {
	const createPerk = useMutation(api.perks.createPerk);
	// `clearFields` stays inside: `reset` is the one public way to empty the form.
	const { clearFields, ...fields } = createPerkFields();
	const { error, trackResult, clear } = createActionError();

	/** Creates the perk. `undefined` when nothing was sent (a field is
	 *  missing). */
	async function submit(): Promise<SettledAction | undefined> {
		const args = createArgs(fields);
		if (args === null) return undefined;
		const result = await trackResult(
			call(createPerk.mutateAsync(args), "Could not create the perk.")
		);
		if (result.isErr()) return { refused: true };
		options.onCreated();
		return { refused: false };
	}

	return {
		...fields,
		submit,
		error,
		/** A fresh, empty create form. */
		reset(): void {
			clearFields();
			clear();
		},
		canSubmit(): boolean {
			return createArgs(fields) !== null;
		},
		/** Why Create is disabled: what the form still needs. */
		disabledReason(): string {
			return MISSING_FIELDS_REASON;
		},
	};
}

export type PerkCreateFormState = ReturnType<typeof createPerkCreateForm>;

/** What the perk is: who offers it, its name, its category and its
 *  terms. */
function PerkOfferFields(props: { form: PerkCreateFormState }): JSX.Element {
	return (
		<>
			<Input
				label={perkFields.partner.label}
				maxLength={NAME_MAX}
				required
				value={props.form.partner()}
				onInput={(event) => {
					props.form.setPartner(event.currentTarget.value);
				}}
			/>
			<Input
				label={perkFields.title.label}
				maxLength={NAME_MAX}
				required
				value={props.form.title()}
				onInput={(event) => {
					props.form.setTitle(event.currentTarget.value);
				}}
			/>
			<OptionSelect
				label={perkFields.category.label}
				placeholder="Pick a category"
				options={PERK_CATEGORY_OPTIONS}
				value={props.form.category()}
				onChange={(category) => {
					props.form.setCategory(category);
				}}
			/>
			<TextArea
				label={perkFields.terms.label}
				maxLength={TEXT_MAX}
				required
				value={props.form.terms()}
				onInput={(value) => {
					props.form.setTerms(value);
				}}
			/>
		</>
	);
}

/** Who handles it and for how long: the board contact who hears about each
 *  request, the partner's link, and the end date when there is one. */
function PerkHandlingFields(props: { form: PerkCreateFormState }): JSX.Element {
	const boardLevel = useBoardLevel();
	return (
		<>
			<PersonSelect
				label={perkFields.contact.label}
				labelHidden={false}
				placeholder="Pick a board member"
				people={boardLevel.data() ?? []}
				value={props.form.contactId()}
				onChange={(contactId) => {
					props.form.setContactId(contactId);
				}}
			/>
			<Input
				label={perkFields.link.label}
				inputMode="url"
				maxLength={TEXT_MAX}
				placeholder="https://…"
				value={props.form.link()}
				onInput={(event) => {
					props.form.setLink(event.currentTarget.value);
				}}
			/>
			<DatePicker
				label={perkFields.validUntil.label}
				helperText="Leave it empty if the perk never ends."
				value={props.form.validUntil()}
				onValueChange={props.form.setValidUntil}
			/>
		</>
	);
}

/** The fields for a new perk. Enter in a field runs `create`, as the
 *  footer's button and its key do. */
export function PerkCreateForm(props: {
	form: PerkCreateFormState;
	create: ActionDescriptor<CreateTarget>;
}): JSX.Element {
	return (
		<ActionForm
			class={styles.form}
			action={props.create}
			target={CREATE_TARGET}
		>
			<PerkOfferFields form={props.form} />
			<PerkHandlingFields form={props.form} />
			<InlineError message={props.form.error()} />
		</ActionForm>
	);
}
