/** Checkpoints are percentages of the automatic word sequence. */
export const introWords = {
	a: "a",
	the: "the",
	community: "community",
	space: "space",
	of: "of",
	for: "for",
	founders: "founders",
	innovation: "innovation",
	in: "in",
	Zurich: "Zurich",
	period: ".",
} as const;
export type IntroWord = keyof typeof introWords;

export const introPhrases: readonly (readonly IntroWord[])[] = [
	["a", "community", "of", "founders"],
	["the", "community", "of", "founders"],
	["the", "community", "of", "founders", "in"],
	["the", "community", "of", "founders", "in", "Zurich"],
	["the", "space", "of", "founders", "in", "Zurich"],
	["the", "space", "for", "founders", "in", "Zurich"],
	["the", "space", "for", "innovation", "in", "Zurich"],
];

const changes = [
	[8, 13],
	[13, 18],
	[18, 23],
	[35, 42],
	[42, 49],
	[62, 70],
] as const;

function clamp(value: number) {
	return Math.min(1, Math.max(0, value));
}

/** Existing entrance curve: cubic-bezier(0.22, 1, 0.36, 1). */
function ease(value: number) {
	if (value <= 0 || value >= 1) return clamp(value);
	let low = 0;
	let high = 1;
	let parameter = value;
	for (let iteration = 0; iteration < 16; iteration++) {
		const x =
			3 * (1 - parameter) ** 2 * parameter * 0.22 +
			3 * (1 - parameter) * parameter ** 2 * 0.36 +
			parameter ** 3;
		if (x < value) low = parameter;
		else high = parameter;
		parameter = (low + high) / 2;
	}
	return 1 - (1 - parameter) ** 3;
}

export function introState(progress: number) {
	const percent = clamp(progress) * 100;
	let from = 0;
	let to = 0;
	let mix = 0;
	for (const [index, [start, end]] of changes.entries()) {
		if (percent < start) break;
		from = index;
		to = index + 1;
		mix = ease((percent - start) / (end - start));
		if (percent < end) break;
		from = to;
	}
	return {
		from,
		to,
		mix,
		sentenceOpacity: 1 - ease((percent - 82) / 5),
		logoProgress: ease((percent - 87) / 8),
	};
}
