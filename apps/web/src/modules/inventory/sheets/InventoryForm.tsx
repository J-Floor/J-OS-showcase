import {
	type FieldDefinition,
	Input,
	PropertyRow,
	Select,
} from "@j-os/design-system";
import type { Accessor } from "solid-js";

import type { SyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { SelectOptionList } from "../../../shared/components/SelectOptionList.tsx";

import styles from "./InventorySheet.module.scss";

/** The required name box, saved as it is typed. `onElement` receives the
 *  input so the sheet can focus it on open. */
export function NameField(props: {
	name: SyncedField<string>;
	hasError: boolean;
	onElement: (element: HTMLInputElement) => void;
}) {
	return (
		<Input
			label="Name"
			required
			ref={(element: HTMLInputElement) => {
				props.onElement(element);
			}}
			value={props.name.value()}
			onInput={(event) => {
				props.name.set(event.currentTarget.value);
			}}
			onBlur={props.name.flush}
			invalid={props.hasError}
		/>
	);
}

/** One option of an {@link OptionSelect}. */
type SelectOption<Value extends string> = {
	value: Value;
	title: string;
};

/** The entity's description, marked as its `field` so the table's
 *  description cell flies into it. */
export function DescriptionValue(props: {
	field: FieldDefinition<"description">;
	description: SyncedField<string>;
}) {
	return (
		<DescriptionField
			class={styles.description}
			field={props.field}
			description={props.description}
		/>
	);
}

/** A single-choice picker row over `options` showing `property`, bound to
 *  `field`. */
export function OptionSelect<Value extends string>(props: {
	property: FieldDefinition;
	placeholder: string;
	options: SelectOption<Value>[];
	field: {
		value: Accessor<Value | undefined>;
		set: (value: Value | undefined) => void;
	};
}) {
	function selected(): string[] {
		const id = props.field.value();
		return id === undefined ? [] : [id];
	}

	return (
		<PropertyRow field={props.property}>
			<Select.Root
				options={props.options}
				value={selected()}
				placeholder={props.placeholder}
				sameWidth
				onValueChange={(details) => {
					props.field.set(details.value[0] as Value | undefined);
				}}
			>
				<SelectOptionList options={props.options} />
			</Select.Root>
		</PropertyRow>
	);
}
