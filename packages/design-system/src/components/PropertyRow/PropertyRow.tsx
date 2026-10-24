import { type JSX, Show } from "solid-js";

import { type FieldDefinition, morphPart } from "../../utils/fields.ts";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./PropertyRow.module.scss";

/**
 * What the row shows: an entity `field` (its label, icon and morph key; the
 * value flies into and out of the table column showing the same field), or
 * a plain `label` and `icon` for a row no table shows (it never flies).
 */
type PropertyRowLabel =
	| ({ field: FieldDefinition; label?: never } & Pick<
			FieldDefinition,
			"icon"
	  >)
	| ({ field?: never } & Pick<FieldDefinition, "label"> &
			Required<Pick<FieldDefinition, "icon">>);

export type PropertyRowProps = PropertyRowLabel & {
	children: JSX.Element;
	/** Forwarded to the row element (e.g. to anchor an effect to this row). */
	ref?: JSX.HTMLAttributes<HTMLDivElement>["ref"];
};

/** Notion-style property row: leading icon + label on the left, control right. */
export function PropertyRow(props: PropertyRowProps): JSX.Element {
	function label(): string {
		return props.field?.label ?? props.label ?? "";
	}
	function icon(): string | undefined {
		return props.icon ?? props.field?.icon;
	}
	return (
		<div ref={props.ref} class={styles.row}>
			<div class={styles.key}>
				<Show when={icon()}>{(name) => <Icon>{name()}</Icon>}</Show>
				<span>{label()}</span>
			</div>
			<div class={styles.value} {...morphPart(props.field)}>
				{props.children}
			</div>
		</div>
	);
}
