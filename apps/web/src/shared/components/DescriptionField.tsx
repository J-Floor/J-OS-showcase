import { type FieldDefinition, TextArea, morphPart } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { SyncedField } from "../createSyncedField.ts";

import styles from "./DescriptionField.module.scss";

/** An entity's description, saved as it is typed; read-only while the
 *  sheet's edit toggle is off. */
export function DescriptionField(props: {
	description: SyncedField<string>;
	maxLength?: number;
	/** Shown but not editable, until the sheet's edit toggle is on. */
	readOnly?: boolean;
	/** The entity's description field, when a table column shows it too:
	 *  the text flies between them. */
	field?: FieldDefinition;
}): JSX.Element {
	return (
		<div class={styles.description} {...morphPart(props.field)}>
			<TextArea
				label="Description"
				maxLength={props.maxLength}
				autoresize
				readOnly={props.readOnly}
				value={props.description.value()}
				onInput={(value) => {
					props.description.set(value);
				}}
				onBlur={props.description.flush}
			/>
		</div>
	);
}
