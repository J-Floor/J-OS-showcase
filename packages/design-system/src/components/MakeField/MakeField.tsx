import { Field, type FieldRootProps } from "@ark-ui/solid/field";
import clsx from "clsx";
import {
	createEffect,
	createUniqueId,
	type JSX,
	Show,
	splitProps,
} from "solid-js";

import {
	separateDisablingProps,
	type DisablingState,
} from "../../utils/disablingProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";
import { Status } from "../Status/Status.tsx";

import styles from "./MakeField.module.scss";

export type MakeFieldProps = Omit<FieldRootProps, "asChild"> & {
	/** Field label: the control's accessible name, so it is required. */
	label: string;
	/** Hide the label visually; it stays in the DOM as the accessible name. */
	labelHidden?: boolean;
	/** Helper text shown below the field while it is valid. */
	helperText?: string;
	/** Error text shown below the field while it is invalid. */
	errorText?: string;
	/** Called when the label is clicked. */
	onLabelClicked?: () => void;
	/** Called to focus the underlying field (e.g. from the required indicator). */
	focusField?: () => void;
} & Omit<DisablingState, "disabled"> &
	WithPartClasses<"label" | "helperText" | "errorText" | "requiredIndicator">;

/**
 * Shared field wrapper (label + helper/error text + invalid state) over
 * `@ark-ui/solid` Field. Input / NumberInput / Select extend `MakeFieldProps`.
 * The label is always rendered, since it names the control; `labelHidden`
 * only takes it out of the visual layout.
 *
 * Ported from EmboUI's MakeField. React→Solid: no `forwardRef`; `props` kept
 * un-destructured for reactivity; `splitProps` separates consumer-only props
 * from the props forwarded to `Field.Root`. The field output is wrapped in
 * `MakeDisablable` so all fields get the disabled dim + reason tooltip; a shared
 * base ID is namespaced as `field::{id}` so the Tooltip targets Field's trigger.
 */
export function MakeField(props: MakeFieldProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [, rootProps] = splitProps(others, [
		"label",
		"labelHidden",
		"helperText",
		"errorText",
		"onLabelClicked",
		"focusField",
		"children",
		"classOverride",
	]);

	createEffect(() => {
		if (import.meta.env.DEV && !props.label.trim()) {
			// eslint-disable-next-line no-console -- a warning for the developer, not the user
			console.warn(
				"MakeField: an empty label leaves the control unnamed. Pass a real label, with labelHidden if it should not show."
			);
		}
	});

	const generatedId = createUniqueId();
	function sharedBaseId(): string {
		return rootProps.id ?? generatedId;
	}
	// Field namespaces its trigger element as "field::{id}".
	function disabledReasonTooltipId(): string {
		return `field::${sharedBaseId()}`;
	}

	return (
		<MakeDisablable
			disabled={disabling.disabled}
			disabledReason={disabling.disabledReason}
			shamefullyOmitDisabledReason={
				disabling.shamefullyOmitDisabledReason
			}
			disabledReasonTooltipId={disabledReasonTooltipId()}
		>
			<Field.Root
				{...rootProps}
				id={sharedBaseId()}
				disabled={disabling.disabled}
				class={clsx(styles.field, rootProps.class)}
			>
				<Status status={props.invalid ? "error" : "neutral"}>
					<Field.Label
						class={getPartStyles(styles, props, "label")}
						data-hidden={props.labelHidden ? "" : undefined}
						onClick={() => props.onLabelClicked?.()}
					>
						{props.label}
					</Field.Label>
					<Field.RequiredIndicator
						class={getPartStyles(
							styles,
							props,
							"requiredIndicator"
						)}
						onClick={() => props.focusField?.()}
					>
						Required
					</Field.RequiredIndicator>
					{props.children}
					<Show when={props.helperText && !props.invalid}>
						<Field.HelperText
							class={getPartStyles(styles, props, "helperText")}
						>
							{props.helperText}
						</Field.HelperText>
					</Show>
					<Field.ErrorText
						class={getPartStyles(styles, props, "errorText")}
					>
						{props.errorText}
					</Field.ErrorText>
				</Status>
			</Field.Root>
		</MakeDisablable>
	);
}
