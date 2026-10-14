import { Input, PropertyRow, Select } from "@j-os/design-system";
import { Show, type Accessor } from "solid-js";

import type { SyncedField } from "../../../lib/createSyncedField.ts";
import { SelectOptionList } from "../../../shared/components/SelectOptionList.tsx";

import styles from "./InventoryDrawer.module.scss";

/**
 * Runs one drawer action. On success the form error is cleared and this
 * resolves `true`; on failure the error message (or `failureMessage` when it
 * is not an `Error`) goes into the form and this resolves `false`.
 */
export async function runAttempt(
	setFormError: (message: string | undefined) => void,
	failureMessage: string,
	run: () => Promise<unknown>
): Promise<boolean> {
	try {
		await run();
		setFormError(undefined);
		return true;
	} catch (err) {
		setFormError(err instanceof Error ? err.message : failureMessage);
		return false;
	}
}

/** The required name box, saved as it is typed. `onElement` receives the
 *  input so the drawer can focus it on open. */
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

/** A single-choice picker row over `options`, bound to `field`. */
export function OptionSelect<Value extends string>(props: {
	icon: string;
	label: string;
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
		<PropertyRow icon={props.icon} label={props.label}>
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

/** The last action's failure, if there was one. */
export function FormErrorLine(props: { error: Accessor<string | undefined> }) {
	return (
		<Show when={props.error()}>
			{(message) => <p class={styles.error}>{message()}</p>}
		</Show>
	);
}
