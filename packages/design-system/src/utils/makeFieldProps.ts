import { splitProps } from "solid-js";

import type { MakeFieldProps } from "../components/MakeField/MakeField.tsx";

import { DISABLING_KEYS } from "./disablingProps.ts";

// The props MakeField consumes: the label, helper/error text, the field
// semantics (invalid/required), the full disabling set and class. Everything
// else a component receives is forwarded to its control (ark Input /
// NumberInput / Select root). Every field splits these same keys.
const MAKE_FIELD_KEYS = [
	"label",
	"labelHidden",
	"helperText",
	"errorText",
	"onLabelClicked",
	"focusField",
	"invalid",
	"required",
	...DISABLING_KEYS,
	"class",
	"classOverride",
] as const satisfies readonly (keyof MakeFieldProps)[];

/** A prop MakeField consumes. */
export type MakeFieldKey = (typeof MAKE_FIELD_KEYS)[number];

// The Field.Root props a control that is itself a `Field.*` part leaves to
// the root (Input, TextArea). Controls with their own Ark root (NumberInput,
// Select, Combobox) keep them for that root instead.
const FIELD_ROOT_KEYS = [
	"readOnly",
	"id",
	"ids",
	"target",
] as const satisfies readonly (keyof MakeFieldProps)[];

/** A Field.Root prop a `Field.*` control leaves to the root. */
export type FieldRootKey = (typeof FIELD_ROOT_KEYS)[number];

/**
 * Split the props {@link MakeField} consumes (label/helper/error, invalid,
 * required, the disabling set, class) from the rest, which the caller forwards
 * to its control. Solid-flavoured (`splitProps`, not destructuring). Returns
 * `[makeFieldProps, rest]`.
 *
 * Note: `invalid`/`required`/`disabled` land in `makeFieldProps`. Controls that
 * are a `Field.*` part (e.g. `Field.Input`) inherit those from `Field.Root` via
 * context, so they need nothing extra; controls that are NOT (`@ark-ui` Number
 * Input / Select roots) must re-forward `disabled` (and invalid/required) to
 * their own root.
 */
export function splitMakeFieldProps<T extends object>(
	props: T
): [Pick<T, Extract<keyof T, MakeFieldKey>>, Omit<T, MakeFieldKey>] {
	const split = splitProps(
		props,
		MAKE_FIELD_KEYS as readonly MakeFieldKey[] as (keyof T)[]
	);
	return split as unknown as [
		Pick<T, Extract<keyof T, MakeFieldKey>>,
		Omit<T, MakeFieldKey>,
	];
}

/**
 * {@link splitMakeFieldProps} for a control that is a `Field.*` part: also
 * hands `readOnly`/`id`/`ids`/`target` to MakeField, whose `Field.Root` passes them to
 * the control through context. Returns `[makeFieldProps, controlProps]`.
 */
export function splitFieldPartProps<T extends object>(
	props: T
): [
	Pick<T, Extract<keyof T, MakeFieldKey | FieldRootKey>>,
	Omit<T, MakeFieldKey | FieldRootKey>,
] {
	const split = splitProps(props, [
		...MAKE_FIELD_KEYS,
		...FIELD_ROOT_KEYS,
	] as readonly (MakeFieldKey | FieldRootKey)[] as (keyof T)[]);
	return split as unknown as [
		Pick<T, Extract<keyof T, MakeFieldKey | FieldRootKey>>,
		Omit<T, MakeFieldKey | FieldRootKey>,
	];
}

/** Parts of a field that take their own clicks. */
const INTERACTIVE_PART =
	"button, a[href], input, textarea, select, [role='button']";

/**
 * The handlers for a field's box: a press on a static part (its icon, a
 * shortcut hint, the empty area) is a press on the control. The mouse press
 * keeps focus where it is instead of moving it to the nearest focusable
 * ancestor, and the click focuses the control and clicks it, so a handler on
 * the control (the search field that opens the palette) runs for the whole
 * box. A disabled or aria-disabled control, the control itself, interactive
 * parts and the field's own parts (`isOwnPart`, e.g. date segments) keep
 * their own behaviour.
 */
export function fieldBoxHandlers(
	control: () => HTMLElement | undefined,
	isOwnPart: (target: Element) => boolean = () => false
): {
	onMouseDown: (event: MouseEvent) => void;
	onClick: (event: MouseEvent) => void;
} {
	function staticTarget(event: MouseEvent): HTMLElement | undefined {
		const element = control();
		const target = event.target;
		return !element ||
			("disabled" in element && element.disabled === true) ||
			element.getAttribute("aria-disabled") === "true" ||
			!(target instanceof Element) ||
			element.contains(target) ||
			target.closest(INTERACTIVE_PART) !== null ||
			isOwnPart(target)
			? undefined
			: element;
	}
	return {
		onMouseDown(event) {
			if (staticTarget(event)) event.preventDefault();
		},
		onClick(event) {
			const element = staticTarget(event);
			if (!element) return;
			element.focus();
			element.click();
		},
	};
}

/**
 * The control element of a field, for the click-anywhere-to-focus box around
 * it: `setReference` goes on the control as its `ref` (it also calls the
 * consumer's own ref), and `box` holds the handlers for the box element (see
 * {@link fieldBoxHandlers}).
 */
export function createFieldControl<Element extends HTMLElement>(
	consumerReference: () => Element | ((element: Element) => void) | undefined
): {
	setReference: (element: Element) => void;
	box: ReturnType<typeof fieldBoxHandlers>;
} {
	let control: Element | undefined;
	return {
		setReference(element) {
			control = element;
			const reference = consumerReference();
			if (typeof reference === "function") reference(element);
		},
		box: fieldBoxHandlers(() => control),
	};
}
