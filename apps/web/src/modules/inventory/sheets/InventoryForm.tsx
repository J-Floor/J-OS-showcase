import { Input } from "@j-os/design-system";
import { type Accessor } from "solid-js";

import type { SyncedField } from "../../../shared/createSyncedField.ts";

/** The required name box, saved as it is typed; invalid while the form has
 *  an error. `ref` receives the input so the sheet can focus it on open. */
export function NameField(props: {
	form: { name: SyncedField<string>; formError: Accessor<unknown> };
	ref: (element: HTMLInputElement) => void;
	/** An existing row's fields stay locked until its edit toggle is on. */
	locked?: boolean;
}) {
	return (
		<Input
			label="Name"
			required
			readOnly={props.locked}
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
