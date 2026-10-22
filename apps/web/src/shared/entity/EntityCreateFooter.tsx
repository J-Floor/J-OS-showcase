import { Button, Sheet } from "@j-os/design-system";
import type { JSX } from "solid-js";

/** A create sheet's footer: the create button, disabled with `disabledReason`
 *  until `canCreate`. */
export function EntityCreateFooter(props: {
	label: string;
	disabledReason: string;
	canCreate: boolean;
	onCreate: () => void;
}): JSX.Element {
	return (
		<Sheet.Footer>
			<Button
				disabled={!props.canCreate}
				disabledReason={props.disabledReason}
				onClick={props.onCreate}
			>
				{props.label}
			</Button>
		</Sheet.Footer>
	);
}
