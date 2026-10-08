import { Field, type FieldTextareaProps } from "@ark-ui/solid/field";
import { type JSX, splitProps } from "solid-js";

import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./TextArea.module.scss";

// MakeField extends Field.Root's div-typed HTML props, which collide with the
// textarea-typed props below (`ref`, `onInput`, `children`, event handlers, etc.).
// Keep MakeField's own additions + Field semantic props; let the textarea side own
// the DOM attributes.
type MakeFieldOwnProps = Omit<
	MakeFieldProps,
	keyof JSX.HTMLAttributes<HTMLDivElement>
>;

// FieldTextareaProps.onInput is event-based; TextArea exposes the string-value
// convenience signature (value, NOT event) that consumers already depend on.
export type TextAreaProps = PropsWithDisabling<
	Omit<FieldTextareaProps, "onInput"> &
		Omit<MakeFieldOwnProps, "label"> & {
			/** Field label (required). */
			label: string;
			/** Called with the extracted string value on each input event. */
			onInput: (value: string) => void;
		}
>;

/**
 * Multiline field. Renders an Ark `Field.Textarea` inside `MakeField` so the
 * label / `aria-invalid` are auto-wired. Extends `FieldTextareaProps` so all
 * native textarea HTML props (`placeholder`, `rows`, `maxLength`, `readOnly`,
 * `name`, `ref`, keyboard/focus handlers, `autoresize`, etc.) pass through.
 *
 * `onInput` is narrowed to `(value: string) => void` — the component adapts it
 * internally to `InputEvent` so consumers receive the extracted string.
 */
export function TextArea(props: TextAreaProps): JSX.Element {
	// Pull out our custom onInput before anything else so it doesn't reach ark.
	const [own, rest] = splitArkProps(props, ["onInput"]);

	// Split the MakeField-consumed keys (label, helperText, errorText, invalid,
	// required, disabled, disabledReason, etc.) from the textarea forward props.
	const [makeFieldProps, afterMakeField] = splitMakeFieldProps(rest);

	// Pull id/ids/readOnly which are Field.Root concerns MakeField also forwards.
	const [fieldExtra, textareaForward] = splitProps(afterMakeField, [
		"readOnly",
		"id",
		"ids",
	]);

	function handleInput(
		e: InputEvent & { currentTarget: HTMLTextAreaElement }
	): void {
		own.onInput(e.currentTarget.value);
	}

	return (
		<MakeField {...makeFieldProps} {...fieldExtra}>
			<Field.Textarea
				class={styles.textarea}
				{...textareaForward}
				onInput={handleInput}
			/>
		</MakeField>
	);
}
