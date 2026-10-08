import { splitProps } from "solid-js";

// The props MakeField consumes: label/helper/error text, the field semantics
// (invalid/required), the full disabling set, and class. Everything else a
// component receives is forwarded to its underlying control (ark Input /
// NumberInput / Select root). Centralised here so every field component splits
// the SAME keys — previously each listed them by hand and drifted (e.g. some
// dropped `disabledReason`, so MakeDisablable never got the reason → no tooltip).
const MAKE_FIELD_KEYS = [
	"label",
	"helperText",
	"errorText",
	"onLabelClicked",
	"focusField",
	"invalid",
	"required",
	"disabled",
	"disabledReason",
	"shamefullyOmitDisabledReason",
	"disabledReasonTooltipId",
	"class",
	"classOverride",
] as const;

type MakeFieldKey = (typeof MAKE_FIELD_KEYS)[number];

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
