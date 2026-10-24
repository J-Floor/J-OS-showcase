import { Chart, type ChartSeries } from "@j-os/design-system";

import type { Demo } from "../../../demo/types.ts";

const months = [
	{ month: "Feb", visitors: 41, returning: 12, signups: 9 },
	{ month: "Mar", visitors: 44, returning: 15, signups: 14 },
	{ month: "Apr", visitors: 47, returning: 13, signups: 11 },
	{ month: "May", visitors: 51, returning: 18, signups: 17 },
	{ month: "Jun", visitors: 53, returning: 22, signups: 21 },
	{ month: "Jul", visitors: 58, returning: 19, signups: 12 },
];

const SHAPES: Record<string, ChartSeries[]> = {
	line: [
		{ key: "visitors", label: "Visitors" },
		{ key: "returning", label: "Returning" },
		{ key: "signups", label: "Sign-ups" },
	],
	area: [
		{ key: "visitors", label: "Visitors", kind: "area" },
		{ key: "returning", label: "Returning", kind: "area" },
	],
	bar: [
		{ key: "signups", label: "Sign-ups", kind: "bar" },
		{ key: "returning", label: "Returning", kind: "bar" },
	],
	stacked: [
		{ key: "visitors", label: "Visitors", kind: "bar", stack: "visits" },
		{ key: "returning", label: "Returning", kind: "bar", stack: "visits" },
	],
	polarity: [
		{ key: "visitors", label: "Joined", kind: "bar", colour: "positive" },
		{ key: "returning", label: "Left", kind: "bar", colour: "negative" },
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
