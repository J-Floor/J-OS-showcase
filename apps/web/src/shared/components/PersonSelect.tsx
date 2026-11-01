import { Select, type SelectRootProps } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../convex/_generated/dataModel";
import type { BoardLevelPerson } from "../../../convex/lib/personViews.ts";

import { PersonOptions } from "./PersonOptions.tsx";

/**
 * Picks one person from `people` (the board level, `useBoardLevel`): a
 * project's leader, a perk's contact. The label is hidden unless
 * `labelHidden` is false, for a `PropertyRow` that already names the field.
 * The pick can be cleared unless `allowClearing` is false, for a field that
 * must always name someone.
 */
export function PersonSelect(
	props: Pick<
		SelectRootProps,
		"label" | "labelHidden" | "placeholder" | "allowClearing"
	> & {
		people: readonly Pick<
			BoardLevelPerson,
			"_id" | "firstName" | "lastName"
		>[];
		value?: Id<"people">;
		onChange: (id: Id<"people"> | undefined) => void;
	}
): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden={props.labelHidden ?? true}
			value={props.value ? [props.value] : []}
			placeholder={props.placeholder ?? "Select…"}
			allowClearing={props.allowClearing ?? true}
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				props.onChange(details.value[0] as Id<"people"> | undefined);
			}}
		>
			<PersonOptions people={props.people} />
		</Select.Root>
	);
}
