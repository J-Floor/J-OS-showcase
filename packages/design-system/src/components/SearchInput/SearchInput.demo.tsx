import { SearchInput } from "@j-os/design-system";
import { createSignal } from "solid-js";

import type { Demo } from "../../../demo/types.ts";

export default {
	title: "SearchInput",
	render: (p) => {
		const [q, setQ] = createSignal(p.value);
		return (
			<SearchInput
				label=""
				aria-label="Search"
				placeholder={p.placeholder}
				value={q()}
				onValueChange={setQ}
			/>
		);
	},
	controls: {
		placeholder: { type: "text", default: "Search rules" },
		value: { type: "text", default: "" },
	},
	presets: {
		Filled: { value: "dishwasher" },
	},
} satisfies Demo;
