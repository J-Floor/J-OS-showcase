import {
	type FieldDefinition,
	Input,
	PropertyRow,
	Select,
} from "@j-os/design-system";
import { type Accessor } from "solid-js";

import type { SyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { LabelledOptions } from "../../../shared/components/LabelledOptions.tsx";

import styles from "./InventorySheet.module.scss";

/** The required name box, saved as it is typed; invalid while the form has
 *  an error. `ref` receives the input so the sheet can focus it on open. */
export function NameField(props: {
	form: { name: SyncedField<string>; formError: Accessor<unknown> };
	ref: (element: HTMLInputElement) => void;
}) {
	return (
		<Input
			label="Name"
			required
			ref={(element: HTMLInputElement) => {
				props.ref(element);
			}}
			value={props.form.name.value()}
			onInput={(event) => {
				props.form.name.set(event.currentTarget.value);
			}}
			onBlur={props.form.name.flush}
			invalid={props.form.formError() !== null}
		/>
	);
}

/** One option of an {@link OptionSelect}. */
type SelectOption<Value extends string> = {
	value: Value;
	label: string;
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
				label={props.property.label}
				labelHidden
				value={selected()}
				placeholder={props.placeholder}
				positioning={{ sameWidth: true }}
				onValueChange={(details) => {
					props.field.set(details.value[0] as Value | undefined);
				}}
			>
				<LabelledOptions options={props.options} />
			</Select.Root>
		</PropertyRow>
	);
}
