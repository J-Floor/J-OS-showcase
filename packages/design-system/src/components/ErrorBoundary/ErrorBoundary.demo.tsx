import { ErrorBoundary } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

function boom(): never {
	throw new Error("Demo error: the component exploded.");
}

function Boom(props: { explode: boolean }) {
	return (
		<span>
			{props.explode
				? boom()
				: "Working fine. Toggle “explode” to trigger the boundary."}
		</span>
	);
}

export default {
	title: "ErrorBoundary",
	render: (p) => (
		<ErrorBoundary
			onError={(error) => {
				// eslint-disable-next-line no-console -- the demo shows the callback firing
				console.info("onError:", error);
			}}
		>
			<Boom explode={p.explode} />
		</ErrorBoundary>
	),
	controls: {
		explode: { type: "boolean", default: false },
	},
	presets: {
		Error: { explode: true },
	},
} satisfies Demo;
