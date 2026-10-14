import { TextArea } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { SyncedField } from "../../lib/createSyncedField.ts";

/** An entity's description, saved as it is typed. */
export function DescriptionField(props: {
	class: string;
	description: SyncedField<string>;
	maxLength?: number;
}): JSX.Element {
	return (
		<div class={props.class}>
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
