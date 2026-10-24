/**
 * The component bundle rule: every `src/components/X` holds `X.tsx`,
 * `X.demo.tsx` and `X.test.tsx`, and `src/index.ts` exports the value `X`.
 * `X.module.scss` is not required: a component with no styles has none.
 * A directory that is not a component belongs in `src/utils`.
 */
const REQUIRED_SUFFIXES = [".tsx", ".demo.tsx", ".test.tsx"];

const EXPORT_LIST = /export\s*\{([^}]*)\}/g;

/** The value names `export { … }` lists in `source` make public: type-only
 *  specifiers and `export type { … }` lists are left out, `a as b` counts
 *  as `b`. */
export function valueExports(source: string): Set<string> {
	const names = new Set<string>();
	for (const [, list = ""] of source.matchAll(EXPORT_LIST)) {
		for (const specifier of list.split(",")) {
			const trimmed = specifier.trim();
			if (trimmed === "" || trimmed.startsWith("type ")) continue;
			const words = trimmed.split(/\s/).filter(Boolean);
			names.add(words.at(-1) ?? trimmed);
		}
	}
	return names;
}

/** What is wrong with each component directory, given each directory's
 *  file names and the source of `index.ts`. Empty when every bundle holds. */
export function bundleProblems(
	directories: Record<string, string[]>,
	indexSource: string
): string[] {
	const exported = valueExports(indexSource);
	return Object.entries(directories).flatMap(([name, files]) => {
		const missing = REQUIRED_SUFFIXES.map((suffix) => `${name}${suffix}`)
			.filter((file) => !files.includes(file))
			.map((file) => `components/${name}: missing ${file}`);
		return exported.has(name)
			? missing
			: [
					...missing,
					`components/${name}: index.ts does not export ${name}`,
				];
	});
}
