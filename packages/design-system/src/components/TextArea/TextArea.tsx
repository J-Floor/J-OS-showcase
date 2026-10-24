import { Field, type FieldTextareaProps } from "@ark-ui/solid/field";
import { type JSX } from "solid-js";

import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitFieldPartProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import type { FieldInputEvent, MakeFieldOwnProps } from "../../utils/types.ts";
import { MakeField } from "../MakeField/MakeField.tsx";

import styles from "./TextArea.module.scss";

// FieldTextareaProps.onInput is event-based; TextArea exposes the string-value
// convenience signature (value, NOT event) that consumers already depend on.
export type TextAreaProps = PropsWithDisabling<
	Omit<FieldTextareaProps, "onInput"> &
		MakeFieldOwnProps & {
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

	// MakeField takes the label/helper/error, the field semantics, the
	// disabling set and the Field.Root props (`readOnly`/`id`/`ids`); the rest
	// goes to the textarea.
	const [makeFieldProps, textareaForward] = splitFieldPartProps(rest);

	function handleInput(event: FieldInputEvent<HTMLTextAreaElement>): void {
		own.onInput(event.currentTarget.value);
	}

	return (
		<MakeField {...makeFieldProps}>
			<Field.Textarea
				class={styles.textarea}
				{...textareaForward}
				onInput={handleInput}
			/>
		</MakeField>
	);
}
