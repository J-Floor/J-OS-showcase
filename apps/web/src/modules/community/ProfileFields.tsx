import {
	Combobox,
	EditableText,
	type FieldDefinition,
	NumberInput,
	PropertyRow,
	Select,
} from "@j-os/design-system";
import { createMemo } from "solid-js";

import {
	PHONE_MAX,
	TEXT_MAX,
	VENTURE_NAME_MAX,
} from "../../../convex/lib/validate.ts";
import { SelectOptionList } from "../../shared/components/SelectOptionList.tsx";
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
				placeholder="Pick one or more"
				multiple
				allowClearing
				items={verticalOptions.map((option) => ({
					value: option.value,
					label: option.label,
				}))}
				value={props.value ?? []}
				onValueChange={(details) => {
					props.onCommit(details.value as Vertical[]);
				}}
			/>
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
	const selectItems = createMemo(() =>
		props.options.map((option) => ({
			value: option.value,
			title: option.label,
		}))
	);
	return (
		<PropertyRow field={props.field}>
			<Select.Root
				placeholder="Pick one"
				allowClearing
				options={selectItems()}
				value={props.value ? [props.value] : []}
				onValueChange={(details) => {
					props.onCommit(details.value[0] as T | undefined);
				}}
			>
				<SelectOptionList options={selectItems()} />
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
			<EditableText value={props.value ?? ""} onCommit={props.onCommit} />
		</PropertyRow>
	);
}
