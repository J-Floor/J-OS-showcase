import { Chart, type ChartSeries } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const months = [
	{ month: "Feb", members: 41, guests: 12, applications: 9 },
	{ month: "Mar", members: 44, guests: 15, applications: 14 },
	{ month: "Apr", members: 47, guests: 13, applications: 11 },
	{ month: "May", members: 51, guests: 18, applications: 17 },
	{ month: "Jun", members: 53, guests: 22, applications: 21 },
	{ month: "Jul", members: 58, guests: 19, applications: 12 },
];

const SHAPES: Record<string, ChartSeries[]> = {
	line: [
		{ key: "members", label: "Members" },
		{ key: "guests", label: "Guests" },
		{ key: "applications", label: "Applications" },
	],
	area: [
		{ key: "members", label: "Members", kind: "area" },
		{ key: "guests", label: "Guests", kind: "area" },
	],
	bar: [
		{ key: "applications", label: "Applications", kind: "bar" },
		{ key: "guests", label: "Guests", kind: "bar" },
	],
	stacked: [
		{ key: "members", label: "Members", kind: "bar", stack: "roster" },
		{ key: "guests", label: "Guests", kind: "bar", stack: "roster" },
	],
	polarity: [
		{ key: "members", label: "Joined", kind: "bar", colour: "positive" },
		{ key: "guests", label: "Left", kind: "bar", colour: "negative" },
	],
};

export default {
	title: "Chart",
	render: (p) => (
		<Chart
			data={p.empty ? [] : months}
			xKey="month"
			series={SHAPES[p.shape as string] ?? SHAPES.line}
			label="Community over the last six months"
			hideLegend={p.hideLegend}
		/>
	),
	controls: {
		shape: {
			type: "select",
			options: ["line", "area", "bar", "stacked", "polarity"],
			default: "line",
		},
		hideLegend: { type: "boolean", default: false },
		empty: { type: "boolean", default: false },
	},
	presets: {
		Lines: { shape: "line", empty: false },
		"Stacked bars": { shape: "stacked", empty: false },
		Polarity: { shape: "polarity", empty: false },
		Empty: { empty: true },
	},
} satisfies Demo;
