import { type FieldDefinition, TextArea, morphPart } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { SyncedField } from "../../lib/createSyncedField.ts";

/** An entity's description, saved as it is typed. */
export function DescriptionField(props: {
	class: string;
	description: SyncedField<string>;
	maxLength?: number;
	/** The entity's description field, when a table column shows it too:
	 *  the text flies between them. */
	field?: FieldDefinition;
}): JSX.Element {
	return (
		<div class={props.class} {...morphPart(props.field)}>
			<TextArea
				label="Description"
				maxLength={props.maxLength}
				autoresize
				value={props.description.value()}
				onInput={(value) => {
					props.description.set(value);
				}}
				onBlur={props.description.flush}
			/>
		</div>
	);
}
