import {
	Combobox,
	EditableText,
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

/** Shared, presentational editors for the venture/profile fields. Each takes a
 * value and an `onCommit`; the caller wires `onCommit` to whichever mutation it
 * owns (board `people.update` in the drawer, `updateOwnProfile` in MyProfile).
 * Extracted so the two editors cannot drift — they must offer the same fields. */

export function PhoneField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow icon={ICONS.phone} label="Phone">
			<EditableText
				value={props.value ?? ""}
				maxLength={PHONE_MAX}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

/** The venture-name row. `label` is a prop because the board drawer calls it
 * "Venture" (matching its read-only view) while the member profile calls it
 * "Company" — same editor, different surface copy. */
export function CompanyField(props: {
	value?: string;
	label: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow icon={ICONS.venture} label={props.label}>
			<EditableText
				value={props.value ?? ""}
				maxLength={VENTURE_NAME_MAX}
				onCommit={props.onCommit}
			/>
		</PropertyRow>
	);
}

export function DescriptionField(props: {
	value?: string;
	onCommit: (v: string) => void;
}) {
	return (
		<PropertyRow icon={ICONS.description} label="Description">
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
		<PropertyRow icon={ICONS.teamSize} label="Team size">
			<NumberInput
				min={1}
				value={props.value != null ? String(props.value) : ""}
				onValueChange={(d) => {
					props.onCommit(
						Number.isFinite(d.valueAsNumber)
							? d.valueAsNumber
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
				items={verticalOptions.map((o) => ({
					value: o.value,
					label: o.label,
				}))}
				value={props.value ?? []}
				onValueChange={(d) => {
					props.onCommit(d.value as Vertical[]);
				}}
			/>
		</PropertyRow>
	);
}

/** Generic single-select stage row backing Product/Funding stage. */
function StageSelect<T extends string>(props: {
	icon: string;
	label: string;
	options: { value: T; label: string }[];
	value?: T;
	onCommit: (v: T | undefined) => void;
}) {
	return (
		<PropertyRow icon={props.icon} label={props.label}>
			<Select.Root
				placeholder="Pick one"
				allowClearing
				options={props.options.map((o) => ({
					value: o.value,
					title: o.label,
				}))}
				value={props.value ? [props.value] : []}
				onValueChange={(d) => {
					props.onCommit(d.value[0] as T | undefined);
				}}
			>
				<Select.Content>
					<For each={props.options}>
						{(o) => (
							<Select.Option value={o.value} title={o.label} />
						)}
					</For>
				</Select.Content>
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
			icon={ICONS.productStage}
			label="Product stage"
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
			icon={ICONS.fundingStage}
			label="Funding stage"
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
		<PropertyRow icon={ICONS.whyJoin} label="Why join">
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
		<PropertyRow icon={ICONS.pastBuilt} label="Past built">
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
		<PropertyRow icon={ICONS.share} label="Referral">
			<EditableText value={props.value ?? ""} onCommit={props.onCommit} />
		</PropertyRow>
	);
}
