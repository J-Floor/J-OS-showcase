import { PropertyRow, type FieldDefinition } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

/**
 * Placeholder field layout shown by `Sheet.Skeleton` while `loading` is true
 * — an open row whose data hasn't arrived yet. One row per field, with the
 * field's own label and icon; literal "placeholder" text, never real or
 * create-form copy. The rows are not keyed by field: the loaded sheet's rows
 * carry the morph key, and the skeleton is swapped out for them.
 */
export function FieldsPlaceholder(props: {
	fields: readonly (FieldDefinition & { icon: string })[];
}): JSX.Element {
	return (
		<For each={props.fields}>
			{(field) => (
				<PropertyRow label={field.label} icon={field.icon}>
					<span>placeholder</span>
				</PropertyRow>
			)}
		</For>
	);
}
