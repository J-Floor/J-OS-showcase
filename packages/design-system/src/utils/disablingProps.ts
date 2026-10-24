import { mergeProps, splitProps } from "solid-js";

/** The props a disablable component takes, listed once for every splitter. */
export const DISABLING_KEYS = [
	"disabled",
	"disabledReason",
	"shamefullyOmitDisabledReason",
	"disabledReasonTooltipId",
] as const;

type DisablingKey = (typeof DISABLING_KEYS)[number];

/**
 * Strict, embo-faithful disabling props for a component's PUBLIC API: if the
 * component can be `disabled`, the consumer MUST supply a `disabledReason`
 * (shown in a tooltip so users learn why) or explicitly opt out with
 * `shamefullyOmitDisabledReason: true`. Setting `disabled` with neither is a
 * type error.
 *
 * Ported from EmboUI's `PropsWithDisabling`.
 */
export type PropsWithDisabling<BaseProps = object> = BaseProps &
	(
		| {
				disabled?: boolean;
				disabledReason: string;
				shamefullyOmitDisabledReason?: false;
				disabledReasonTooltipId?: string;
		  }
		| {
				disabled?: boolean;
				disabledReason?: never;
				shamefullyOmitDisabledReason: true;
				disabledReasonTooltipId?: string;
		  }
		| {
				disabled?: false;
				disabledReason?: never;
				shamefullyOmitDisabledReason?: false;
				disabledReasonTooltipId?: string;
		  }
	);

/**
 * The disabling fields, separated from a component's other props: a loose
 * shape used by the internal plumbing (`separateDisablingProps`,
 * `MakeDisablable`) AFTER the strict public type above has been enforced at
 * the call site.
 */
export type DisablingState = {
	[Key in DisablingKey]?: PropsWithDisabling[Key];
};

/**
 * Separate the disabling fields from the rest of a component's props.
 *
 * `disabled` is returned in both halves. `MakeDisablable` reads it to dim the
 * control and show the reason, and the control needs it to stop responding:
 * the dim only blocks the pointer, so a control that never sees `disabled`
 * still takes a Space or an arrow key.
 *
 * Solid-flavoured: uses `splitProps` (NOT destructuring, which breaks Solid
 * reactivity). Returns `[others, disabling]` to match EmboUI's order.
 */
export function separateDisablingProps<OtherProps extends object>(
	props: OtherProps & DisablingState
): readonly [
	Omit<OtherProps, DisablingKey> & { disabled?: boolean },
	DisablingState,
] {
	const [disabling, others] = splitProps(props, DISABLING_KEYS);
	const othersWithDisabled = mergeProps(others, {
		get disabled() {
			return disabling.disabled;
		},
	});
	return [
		othersWithDisabled as unknown as Omit<OtherProps, DisablingKey> & {
			disabled?: boolean;
		},
		disabling,
	] as const;
}
