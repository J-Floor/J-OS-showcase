import { type FieldDefinition, Input } from "@j-os/design-system";
import { type Accessor } from "solid-js";

import type { SyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";

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
