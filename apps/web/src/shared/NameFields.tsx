import { Input } from "@j-os/design-system";

import type { FieldErrorProps } from "./fieldErrors.ts";
import styles from "./NameFields.module.scss";

type NameField = {
	value: string;
	onChange: (value: string) => void;
	error: FieldErrorProps;
};

/** The first- and last-name pair every public form opens with, side by side
 *  (stacked on narrow screens). */
export function NameFields(props: {
	disabled: boolean;
	disabledReason: string;
	firstName: NameField;
	lastName: NameField;
}) {
	return (
		<div class={styles.row}>
			<Input
				label="First name"
				required
				disabled={props.disabled}
				disabledReason={props.disabledReason}
				value={props.firstName.value}
				onValueChange={(event) => {
					props.firstName.onChange(event.currentTarget.value);
				}}
				{...props.firstName.error}
			/>
			<Input
				label="Last name"
				required
				disabled={props.disabled}
				disabledReason={props.disabledReason}
				value={props.lastName.value}
				onValueChange={(event) => {
					props.lastName.onChange(event.currentTarget.value);
				}}
				{...props.lastName.error}
			/>
		</div>
	);
}
