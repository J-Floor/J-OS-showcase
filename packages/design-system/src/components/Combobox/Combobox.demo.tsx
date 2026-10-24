import { Combobox } from "@j-os/design-system";
import { For } from "solid-js";

import { FRAMEWORKS } from "../../../demo/fixtures.ts";
import type { Demo } from "../../../demo/types.ts";

const frameworks = FRAMEWORKS;

export default {
	title: "Combobox",
	render: (p) => (
		<Combobox.Root
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			allowClearing={p.allowClearing}
			positioning={{ sameWidth: p.sameWidth }}
			multiple={p.multiple}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
		>
			<For each={frameworks}>
				{(framework) => (
					<Combobox.Option value={framework.value}>
						<Combobox.OptionText>
							{framework.name}
						</Combobox.OptionText>
						<Combobox.OptionDescription>
							{framework.note}
						</Combobox.OptionDescription>
					</Combobox.Option>
				)}
			</For>
			<Combobox.Empty>{p.emptyText}</Combobox.Empty>
		</Combobox.Root>
	),
	controls: {
		label: { type: "text", default: "Framework" },
		placeholder: { type: "text", default: "Pick one" },
		helperText: { type: "text", default: "Type to filter, or pick one." },
		errorText: { type: "text", default: "Selection required." },
		emptyText: { type: "text", default: "No framework matches" },
		allowClearing: { type: "boolean", default: true },
		sameWidth: { type: "boolean", default: true },
		multiple: { type: "boolean", default: false },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		Multiple: { multiple: true },
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
