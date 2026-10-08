import { splitProps } from "solid-js";

/**
 * The disabling fields, separated from a component's other props — a loose shape
 * used by the internal plumbing (`separateDisablingProps`, `MakeDisablable`)
 * AFTER the strict public type below has already been enforced at the call site.
 */
export type DisablingState = {
	disabled?: boolean;
	disabledReason?: string;
	shamefullyOmitDisabledReason?: boolean;
	disabledReasonTooltipId?: string;
};

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
 * Separate the disabling fields from the rest of a component's props.
 *
 * Solid-flavoured: uses `splitProps` (NOT destructuring, which breaks Solid
 * reactivity). Returns `[others, disabling]` to match EmboUI's order.
 */
export function separateDisablingProps<OtherProps extends object>(
	props: OtherProps & DisablingState
): readonly [Omit<OtherProps, keyof DisablingState>, DisablingState] {
	const [disabling, others] = splitProps(props, [
		"disabled",
		"disabledReason",
		"shamefullyOmitDisabledReason",
		"disabledReasonTooltipId",
	]);
	return [
		others as unknown as Omit<OtherProps, keyof DisablingState>,
		disabling,
	] as const;
}
