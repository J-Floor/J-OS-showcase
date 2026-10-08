import {
	NumberInput as ArkNumberInput,
	type NumberInputRootProps,
	type NumberInputInputProps,
} from "@ark-ui/solid/number-input";
import { type JSX, Show, mergeProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { type TriggerProps } from "../../utils/triggerProps.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./NumberInput.module.scss";

// MakeField extends Field.Root's div-typed HTML props, which collide with the
// ark NumberInput.Root props below. Keep MakeField's own additions + the Field
// semantic props; let the ark Root own the rest.
type MakeFieldOwnProps = Omit<
	MakeFieldProps,
	keyof JSX.HTMLAttributes<HTMLDivElement>
>;

export type NumberInputProps = PropsWithDisabling<
	MakeFieldOwnProps &
		Omit<NumberInputRootProps, "min" | "max"> &
		Pick<NumberInputInputProps, "placeholder"> & {
			/** Material Symbols ligature rendered before the input. */
			leadingIconName?: IconProps["children"];
			/** Hide the scrubber + increment/decrement control, allowing typing only. */
			onlyAllowTyping?: boolean;
			/** Show a button that clears the input's value while it is non-empty. */
			allowClearing?: boolean;
			/** Minimum value; a string is parsed to a number (throws on NaN). */
			min?: string | number;
			/** Maximum value; a string is parsed to a number (throws on NaN). */
			max?: string | number;
			/** Ref forwarded to the underlying input element. */
			ref?: HTMLInputElement | ((el: HTMLInputElement) => void);
		}
>;

/** Parse a string min/max into a number; throw (matching EmboUI) on NaN. */
function parseBound(
	bound: string | number | undefined,
	name: "min" | "max"
): number | undefined {
	if (bound === undefined || typeof bound === "number") {
		return bound;
	}
	const parsed = parseFloat(bound);
	if (isNaN(parsed)) {
		throw new Error(
			`NumberInput: Invalid ${name} value "${bound}". Expected a numeric string.`
		);
	}
	return parsed;
}

/**
 * Numeric input: `MakeField` (label/helper/error) wrapping `@ark-ui/solid`
 * `NumberInput`, with increment/decrement triggers, an optional scrubber and
 * leading icon. Clicking the wrapper focuses the input.
 *
 * Ported from EmboUI's NumberInput. React→Solid: no `forwardRef` (`ref` is a
 * plain prop forwarded to the input); EmboUI's double `onlyArkProps` is replaced
 * by `splitArkProps`/`splitProps`. String `min`/`max` are parsed to numbers
 * (throwing on a non-numeric string, same message as EmboUI). `onlyAllowTyping`
 * hides scrubber + control.
 *
 * Inc/dec triggers: each ark `Increment`/`DecrementTrigger` renders an
 * {@link IconButton} via `asChild`, passing ark's trigger props through
 * `triggerProps`. IconButton puts them on its button (so zag registers the
 * trigger) and supplies the label tooltip + the disabled dim (via BaseButton →
 * MakeDisablable) for free — no hand-rolled trigger button.
 */
export function NumberInput(props: NumberInputProps): JSX.Element {
	let inputEl: HTMLInputElement | undefined;

	// Consumer-only props (handled here) vs. everything forwarded to ark Root.
	const [own, rest] = splitArkProps(props, [
		"leadingIconName",
		"onlyAllowTyping",
		"allowClearing",
		"ref",
		"min",
		"max",
	]);
	// MakeField/Field semantics (incl. the full disabling set) route to MakeField
	// for the dim + reason tooltip; the rest spreads on the ark Root. `disabled`
	// is ALSO forwarded to the ark Root below so zag disables the input + inc/dec
	// triggers (they only get `[disabled]` — and the dimmed `.trigger[disabled]`
	// styling — when the Root is disabled).
	const [makeFieldProps, arkRest] = splitMakeFieldProps(rest);
	// Override min/max with their parsed numeric forms (throws on NaN); forward
	// `disabled` to the ark Root so the input + triggers are actually disabled.
	const rootProps = mergeProps(arkRest, {
		get min() {
			return parseBound(props.min, "min");
		},
		get max() {
			return parseBound(props.max, "max");
		},
		get disabled() {
			return makeFieldProps.disabled;
		},
	});

	function setRef(el: HTMLInputElement) {
		inputEl = el;
		const ref = own.ref;
		if (typeof ref === "function") ref(el);
	}

	function handleWrapperClick() {
		inputEl?.focus();
	}

	return (
		<MakeField {...makeFieldProps}>
			<ArkNumberInput.Root allowMouseWheel {...rootProps}>
				<Show when={!own.onlyAllowTyping}>
					<ArkNumberInput.Scrubber class={styles.scrubber} />
				</Show>
				<div
					class={styles.inputWrapper}
					onClick={handleWrapperClick}
					data-invalid={makeFieldProps.invalid ? "true" : undefined}
				>
					<Show when={own.leadingIconName}>
						{(name) => <Icon class={styles.icon}>{name()}</Icon>}
					</Show>
					<ArkNumberInput.Input ref={setRef} />
					<Show when={own.allowClearing}>
						<ArkNumberInput.Context>
							{(context) => (
								<Show
									when={
										!context().empty &&
										!makeFieldProps.disabled
									}
								>
									<IconButton
										class={styles.clearTrigger}
										tooltipLabel="Clear"
										onClick={() => {
											context().clearValue();
										}}
									>
										{ICONS.close}
									</IconButton>
								</Show>
							)}
						</ArkNumberInput.Context>
					</Show>
					<Show when={!own.onlyAllowTyping}>
						<ArkNumberInput.Control class={styles.control}>
							<ArkNumberInput.DecrementTrigger
								asChild={(arkProps) => (
									<IconButton
										tooltipLabel="Decrement"
										disabledReason="Minimum allowed value reached"
										triggerProps={
											arkProps() as TriggerProps
										}
									>
										remove
									</IconButton>
								)}
							/>
							<ArkNumberInput.IncrementTrigger
								asChild={(arkProps) => (
									<IconButton
										tooltipLabel="Increment"
										disabledReason="Maximum allowed value reached"
										triggerProps={
											arkProps() as TriggerProps
										}
									>
										{ICONS.add}
									</IconButton>
								)}
							/>
						</ArkNumberInput.Control>
					</Show>
				</div>
			</ArkNumberInput.Root>
		</MakeField>
	);
}
