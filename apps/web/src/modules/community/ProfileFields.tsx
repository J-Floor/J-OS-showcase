import {
	Combobox,
	EditableText,
	type FieldDefinition,
	NumberInput,
	PropertyRow,
	Select,
} from "@j-os/design-system";
import { For } from "solid-js";

import {
	PHONE_MAX,
	TEXT_MAX,
	VENTURE_NAME_MAX,
} from "../../../convex/lib/validate.ts";
import { LabelledOptions } from "../../shared/components/LabelledOptions.tsx";
import { ICONS } from "../../shared/icons.ts";
import type {
	FundingStage,
	ProductStage,
	Vertical,
} from "../signup/options.ts";
import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
} from "../signup/options.ts";

import { personFields } from "./fields.ts";

/** Shared, presentational editors for the venture/profile fields. Each takes a
 * value and an `onCommit`; the caller wires `onCommit` to whichever mutation it
 * owns (board `people.update` in the sheet, `updateOwnProfile` in MyProfile).
 * Extracted so the two editors cannot drift — they must offer the same fields. */

export function PhoneField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow field={personFields.phone}>
			<EditableText
				label={personFields.phone.label}
				value={props.value ?? ""}
				maxLength={PHONE_MAX}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

/** The venture-name row. The board sheet shows it as the roster's Venture
 * field (so it pairs with that column); the member profile passes its own
 * `label`, "Company" — same editor, different surface copy. */
export function CompanyField(props: {
	value?: string;
	label?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow
			{...(props.label === undefined
				? { field: personFields.ventureName }
				: { icon: ICONS.venture, label: props.label })}
		>
			<EditableText
				label={props.label ?? personFields.ventureName.label}
				value={props.value ?? ""}
				maxLength={VENTURE_NAME_MAX}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

export function DescriptionRow(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow field={personFields.description}>
			<EditableText
				label={personFields.description.label}
				multiline
				maxLength={TEXT_MAX}
				value={props.value ?? ""}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

export function TeamSizeField(props: {
	value?: number;
	onCommit: (n: number | undefined) => void;
}) {
	return (
		<PropertyRow field={personFields.teamSize}>
			<NumberInput
				label={personFields.teamSize.label}
				labelHidden
				min={1}
				value={
					typeof props.value === "number" ? String(props.value) : ""
				}
				onValueChange={(details) => {
					props.onCommit(
						Number.isFinite(details.valueAsNumber)
							? details.valueAsNumber
							: undefined
					);
				}}
			/>
		</PropertyRow>
	);
}

export function VerticalField(props: {
	value?: Vertical[];
	onCommit: (v: Vertical[]) => void;
}) {
	return (
		<PropertyRow icon={ICONS.vertical} label="Verticals">
			<Combobox.Root
				label="Verticals"
				labelHidden
				placeholder="Pick one or more"
				multiple
				allowClearing
				value={props.value ?? []}
				onValueChange={(details) => {
					props.onCommit(details.value as Vertical[]);
				}}
			>
				<For each={verticalOptions}>
					{(option) => (
						<Combobox.Option value={option.value}>
							{option.label}
						</Combobox.Option>
					)}
				</For>
			</Combobox.Root>
		</PropertyRow>
	);
}

/** Generic single-select stage row backing Product/Funding stage. */
function StageSelect<T extends string>(props: {
	field: FieldDefinition;
	options: { value: T; label: string }[];
	value?: T;
	onCommit: (v: T | undefined) => void;
}) {
	return (
		<PropertyRow field={props.field}>
			<Select.Root
				label={props.field.label}
				labelHidden
				placeholder="Pick one"
				allowClearing
				value={props.value ? [props.value] : []}
				onValueChange={(details) => {
					props.onCommit(details.value[0] as T | undefined);
				}}
			>
				<LabelledOptions options={props.options} />
			</Select.Root>
		</PropertyRow>
	);
}

export function ProductStageField(props: {
	value?: ProductStage;
	onCommit: (v: ProductStage | undefined) => void;
}) {
	return (
		<StageSelect
			field={personFields.productStage}
			options={productStageOptions}
			value={props.value}
			onCommit={props.onCommit}
		/>
	);
}

export function FundingStageField(props: {
	value?: FundingStage;
	onCommit: (v: FundingStage | undefined) => void;
}) {
	return (
		<StageSelect
			field={personFields.fundingStage}
			options={fundingStageOptions}
			value={props.value}
			onCommit={props.onCommit}
		/>
	);
}

export function WhyJoinField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow field={personFields.whyJoin}>
			<EditableText
				label={personFields.whyJoin.label}
				multiline
				value={props.value ?? ""}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

export function PastBuiltField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow field={personFields.pastBuilt}>
			<EditableText
				label={personFields.pastBuilt.label}
				multiline
				value={props.value ?? ""}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

export function ReferralField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow field={personFields.referral}>
			<EditableText
				label={personFields.referral.label}
				value={props.value ?? ""}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}
