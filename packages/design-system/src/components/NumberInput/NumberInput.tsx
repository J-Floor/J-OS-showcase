import {
	NumberInput as ArkNumberInput,
	type NumberInputRootProps,
	type NumberInputInputProps,
	type UseNumberInputContext,
} from "@ark-ui/solid/number-input";
import { type JSX, Show, mergeProps, splitProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import {
	createFieldControl,
	splitMakeFieldProps,
} from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import type { MakeFieldOwnProps } from "../../utils/types.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./NumberInput.module.scss";

/** The props that belong on the `<input>`, not the Ark root's `<div>`: zag's
 *  number-input has no placeholder, and focus events do not bubble. */
const INPUT_KEYS = [
	"placeholder",
	"autofocus",
	"onFocus",
	"onBlur",
	"onKeyDown",
	"onKeyUp",
] as const satisfies readonly (keyof NumberInputInputProps)[];

type InputKey = (typeof INPUT_KEYS)[number];

export type NumberInputProps = PropsWithDisabling<
	MakeFieldOwnProps &
		Omit<NumberInputRootProps, "min" | "max" | InputKey> &
		Pick<NumberInputInputProps, InputKey> & {
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
			ref?: NumberInputInputProps["ref"];
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

/** The button that empties the field, shown only while it has a value. */
function ClearButton(props: {
	context: UseNumberInputContext;
	isDisabled: MakeFieldProps["disabled"];
}): JSX.Element {
	return (
		<Show when={!props.context().empty && !props.isDisabled}>
			<IconButton
				class={styles.clearTrigger}
				tooltipLabel="Clear"
				onClick={() => {
					props.context().clearValue();
				}}
			>
				{ICONS.close}
			</IconButton>
		</Show>
	);
}

/** The decrement and increment buttons. */
function StepControls(): JSX.Element {
	return (
		<ArkNumberInput.Control class={styles.control}>
			<ArkNumberInput.DecrementTrigger
				asChild={(arkProps) => (
					<IconButton
						tooltipLabel="Decrement"
						disabledReason="Minimum allowed value reached"
						triggerProps={arkProps()}
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
						triggerProps={arkProps()}
					>
						{ICONS.add}
					</IconButton>
				)}
			/>
		</ArkNumberInput.Control>
	);
}

/**
 * Numeric input: `MakeField` (label/helper/error) wrapping `@ark-ui/solid`
 * `NumberInput`, with increment/decrement triggers, an optional scrubber and
 * leading icon. Clicking the wrapper focuses the input.
 *
 * Ported from EmboUI's NumberInput. React→Solid: no `forwardRef` (`ref` is a
 * plain prop forwarded to the input); EmboUI's double `onlyArkProps` is replaced
 * by `splitArkProps`/`splitProps`: `INPUT_KEYS` go to the `<input>`, the rest
 * to the Ark root. String `min`/`max` are parsed to numbers (throwing on a
 * non-numeric string, same message as EmboUI). `onlyAllowTyping` hides
 * scrubber + control.
 *
 * Inc/dec triggers: each ark `Increment`/`DecrementTrigger` renders an
 * {@link IconButton} via `asChild`, passing ark's trigger props through
 * `triggerProps`. IconButton puts them on its button (so zag registers the
 * trigger) and supplies the label tooltip + the disabled dim (via BaseButton →
 * MakeDisablable) for free — no hand-rolled trigger button.
 */
export function NumberInput(props: NumberInputProps): JSX.Element {
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
	// for the dim + reason tooltip; the input's own props go to the `<input>`;
	// the rest spreads on the ark Root.
	const [makeFieldProps, afterMakeField] = splitMakeFieldProps(rest);
	const [inputProps, arkRest] = splitProps(afterMakeField, INPUT_KEYS);
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
	const control = createFieldControl<HTMLInputElement>(() => own.ref);

	return (
		<MakeField {...makeFieldProps}>
			<ArkNumberInput.Root allowMouseWheel {...rootProps}>
				<Show when={!own.onlyAllowTyping}>
					<ArkNumberInput.Scrubber class={styles.scrubber} />
				</Show>
				<div
					class={styles.inputWrapper}
					onClick={() => {
						control.focus();
					}}
					data-invalid={makeFieldProps.invalid ? "true" : undefined}
				>
					<Show when={own.leadingIconName}>
						{(name) => <Icon class={styles.icon}>{name()}</Icon>}
					</Show>
					<ArkNumberInput.Input
						{...inputProps}
						ref={control.setReference}
					/>
					<Show when={own.allowClearing}>
						<ArkNumberInput.Context>
							{(context) => (
								<ClearButton
									context={context}
									isDisabled={makeFieldProps.disabled}
								/>
							)}
						</ArkNumberInput.Context>
					</Show>
					<Show when={!own.onlyAllowTyping}>
						<StepControls />
					</Show>
				</div>
			</ArkNumberInput.Root>
		</MakeField>
	);
}
