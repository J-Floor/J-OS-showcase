import { Field, type FieldInputProps } from "@ark-ui/solid/field";
import { type JSX, Show, splitProps } from "solid-js";

import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./Input.module.scss";

/** Bound `onInput` event for an input element, matching ark's `Field.Input`. */
type InputChangeEvent = InputEvent & {
	currentTarget: HTMLInputElement;
	target: HTMLInputElement;
};
/** Solid input change handler (`onInput`), narrowed to the input element. */
type InputChangeHandler = (event: InputChangeEvent) => void;

// Excludes type="number" since the consumer should use NumberInput instead.
type CustomFieldInputProps = Omit<FieldInputProps, "type"> & {
	type?: Exclude<JSX.InputHTMLAttributes<HTMLInputElement>["type"], "number">;
};

// MakeField extends Field.Root's div-typed HTML props, which collide with the
// input-typed props below (`ref`, `onInput`, `children`, event handlers, etc.).
// Keep MakeField's own additions + Field semantic props; let the input side own
// the DOM attributes.
type MakeFieldOwnProps = Omit<
	MakeFieldProps,
	keyof JSX.HTMLAttributes<HTMLDivElement>
>;

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
			onValueChange?: InputChangeHandler;
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
	let inputEl: HTMLInputElement | undefined;

	// Consumer-only props (+ the props we handle ourselves) vs. the rest.
	const [own, rest] = splitArkProps(props, [
		"leadingIconName",
		"trailing",
		"onValueChange",
		"onInput",
		"ref",
	]);
	// Route the MakeField props (label/helper/error + field semantics + the full
	// disabling set) to MakeField via the shared splitter; `readOnly`/`id`/`ids`
	// are Field.Root concerns MakeField also forwards. Everything else goes to
	// `Field.Input`, which inherits invalid/required/disabled from Field.Root via
	// context (no need to forward them to the input element).
	const [makeFieldProps, afterMakeField] = splitMakeFieldProps(rest);
	const [fieldExtra, inputForward] = splitProps(afterMakeField, [
		"readOnly",
		"id",
		"ids",
	]);

	function handleInput(event: InputChangeEvent): void {
		const onInput = own.onInput;
		if (typeof onInput === "function") {
			onInput(event);
		} else if (Array.isArray(onInput)) {
			onInput[0](onInput[1], event);
		}
		own.onValueChange?.(event);
	}

	function setRef(el: HTMLInputElement) {
		inputEl = el;
		const ref = props.ref;
		if (typeof ref === "function") ref(el);
	}

	function handleWrapperClick() {
		inputEl?.focus();
	}

	return (
		<MakeField {...makeFieldProps} {...fieldExtra}>
			<div
				class={styles.inputWrapper}
				onClick={handleWrapperClick}
				data-invalid={props.invalid ? "true" : undefined}
			>
				<Show when={own.leadingIconName}>
					{(name) => <Icon class={styles.icon}>{name()}</Icon>}
				</Show>
				<Field.Input
					{...inputForward}
					onInput={handleInput}
					ref={setRef}
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
