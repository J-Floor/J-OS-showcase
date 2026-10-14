import { Button, Drawer } from "@j-os/design-system";
import type { JSX } from "solid-js";

/** A create drawer's footer: the create button, disabled with `disabledReason`
 *  until `canCreate`. */
export function EntityCreateFooter(props: {
	label: string;
	disabledReason: string;
	canCreate: boolean;
	onCreate: () => void;
}): JSX.Element {
	return (
		<Drawer.Footer>
			<Button
				disabled={!props.canCreate}
				disabledReason={props.disabledReason}
				onClick={props.onCreate}
			>
				{props.label}
			</Button>
		</Drawer.Footer>
	);
}
