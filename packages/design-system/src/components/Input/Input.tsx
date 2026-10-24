import { Field, type FieldInputProps } from "@ark-ui/solid/field";
import { type JSX, Show } from "solid-js";

import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import {
	createFieldControl,
	splitFieldPartProps,
} from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import type { FieldInputEvent, MakeFieldOwnProps } from "../../utils/types.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import { MakeField } from "../MakeField/MakeField.tsx";

import styles from "./Input.module.scss";

// Excludes type="number" since the consumer should use NumberInput instead.
type CustomFieldInputProps = Omit<FieldInputProps, "type"> & {
	type?: Exclude<JSX.InputHTMLAttributes<HTMLInputElement>["type"], "number">;
};

export type InputProps = PropsWithDisabling<
	MakeFieldOwnProps &
		CustomFieldInputProps & {
			/** Material Symbols ligature rendered before the input. */
			leadingIconName?: IconProps["children"];
			/**
			 * Rendered after the input, inside the field — a shortcut hint, a
			 * unit, a clear button. Not an icon name, because the things that
			 * belong here are rarely icons; pass whatever it is.
			 */
			trailing?: JSX.Element;
			/** Alias for `onInput`, for consistency with other components. */
			onValueChange?: (event: FieldInputEvent<HTMLInputElement>) => void;
			/** The whole field's element (label, box and hints), e.g. what
			 *  an overlay opens from (`morphFrom`). `ref` is the input. */
			rootRef?: (element: HTMLDivElement) => void;
		}
>;

/**
 * Single-line text input: `MakeField` (label/helper/error) wrapping
 * `@ark-ui/solid` `Field.Input`, with an optional leading icon. Clicking the
 * wrapper focuses the input.
 *
 * Ported from EmboUI's Input. React→Solid: no `forwardRef` (`ref` is a plain
 * prop forwarded to the input); `onValueChange` is an alias merged with
 * `onInput`. `splitArkProps` separates consumer-only props from the props
 * forwarded to `Field.Input`. `type="number"` is excluded — use `NumberInput`.
 */
export function Input(props: InputProps): JSX.Element {
	// Consumer-only props (+ the props we handle ourselves) vs. the rest.
	const [own, rest] = splitArkProps(props, [
		"leadingIconName",
		"trailing",
		"onValueChange",
		"onInput",
		"ref",
		"rootRef",
	]);
	// MakeField takes the label/helper/error, the field semantics, the full
	// disabling set and the Field.Root props (`readOnly`/`id`/`ids`).
	// Everything else goes to `Field.Input`, which inherits invalid/required/
	// disabled/readOnly from Field.Root via context.
	const [makeFieldProps, inputForward] = splitFieldPartProps(rest);
	const control = createFieldControl<HTMLInputElement>(() => own.ref);

	function handleInput(event: FieldInputEvent<HTMLInputElement>): void {
		const onInput = own.onInput;
		if (typeof onInput === "function") {
			onInput(event);
		} else if (Array.isArray(onInput)) {
			onInput[0](onInput[1], event);
		}
		own.onValueChange?.(event);
	}

	return (
		<MakeField {...makeFieldProps} ref={own.rootRef}>
			<div
				class={styles.inputWrapper}
				onClick={() => {
					control.focus();
				}}
				data-invalid={props.invalid ? "true" : undefined}
			>
				<Show when={own.leadingIconName}>
					{(name) => <Icon class={styles.icon}>{name()}</Icon>}
				</Show>
				<Field.Input
					{...inputForward}
					onInput={handleInput}
					ref={control.setReference}
				/>
				<Show when={own.trailing}>
					{(trailing) => (
						// `pointer-events: none` on the slot would kill a clear
						// button, so it stays interactive; the wrapper's
						// click-to-focus is what makes the rest of the field
						// behave like one input.
						<span class={styles.trailing}>{trailing()}</span>
					)}
				</Show>
			</div>
		</MakeField>
	);
}
