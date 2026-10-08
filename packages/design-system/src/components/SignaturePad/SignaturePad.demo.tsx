import { SignaturePad } from "@j-os/design-system";
import type { Demo } from "../../../demo/types.ts";

export default {
	title: "SignaturePad",
	render: () => (
		<SignaturePad
			label="Sign below"
			onChange={() => {
				/* demo: ignore */
			}}
		/>
	),
	controls: {},
	presets: {},
} satisfies Demo;
