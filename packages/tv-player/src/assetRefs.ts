/** A quote around a reference: a plain one, or its HTML entity (a `style="..."` attribute spells CSS quotes as `&quot;`). */
const QUOTE = String.raw`(?:["']|&quot;|&apos;|&#0*39;|&#x0*27;)`;
/**
 * What may follow `assets/`: the server's pack paths are `\w[\w.-]*` segments, so `[\w./-]` is a superset.
 */
const CORE = String.raw`((?:\./)?assets\/[\w./-]+)`;
/** An optional `?query` or `#fragment`, which is consumed (see rewriteAssetRefs). Unquoted, it ends at whitespace. */
const QUERY_UNQUOTED = String.raw`(?:[?#](?:(?!&quot;|&apos;|&#0*39;|&#x0*27;)[^\s"'<>)])*)?`;
/** Inside quotes it runs to the closing quote and may hold spaces. */
const QUERY_QUOTED = String.raw`(?:[?#](?:(?!${QUOTE})[^<>])*)?`;

/**
 * Case-insensitive `src=`, `href=`, `poster=` and CSS `url(...)`, quoted
 * (a quote or its entity) or not, and `@import "..."`. The quoted form runs
 * first; the unquoted one only matches a reference with no quote before it.
 * Every part is a fixed prefix followed by single-width classes (or a
 * lookahead per character), so both run in linear time on any input.
 */
const QUOTED_REF = new RegExp(
	String.raw`(\b(?:src|href|poster)\s*=\s*${QUOTE}|\burl\(\s*${QUOTE}|@import\s+${QUOTE})` +
		CORE +
		QUERY_QUOTED,
	"gi"
);
const UNQUOTED_REF = new RegExp(
	String.raw`(\b(?:src|href|poster)\s*=\s*|\burl\(\s*)` +
		CORE +
		QUERY_UNQUOTED,
	"gi"
);

/** A quoted `srcset="assets/a.png 1x, assets/b.png 2x"`: the value has no quote, so `[^"']*` is linear. */
const SRCSET = /(\bsrcset\s*=\s*)(["'])([^"']*)\2/gi;
const SRCSET_ITEM = new RegExp(
	String.raw`(^|[\s,])` + CORE + QUERY_UNQUOTED,
	"gi"
);

type Resolve = (path: string) => string | undefined;

function swap(
	match: string,
	prefix: string,
	reference: string,
	resolve: Resolve
): string {
	const path = reference.startsWith("./") ? reference.slice(2) : reference;
	// A path that climbs out of assets/ is never looked up.
	if (path.split("/").includes("..")) return match;
	const target = resolve(path);
	return target === undefined ? match : `${prefix}${target}`;
}

/**
 * Points an HTML slide's relative `assets/...` references at `resolve(path)`
 * (a data: URI on the TV, an https: URL in the web preview). A path it does
 * not know, or one with a `..` segment, stays as written. A `?query` or
 * `#fragment` after a known path is dropped: appended to a data: URI it would
 * corrupt it, and the pack's files have no use for one. Handles `src`, `href`,
 * `poster`, quoted `srcset`, CSS `url()` and `@import`, in any letter case. A
 * pure string transform: no DOM, no network.
 */
// eslint-disable-next-line unicorn/name-replacements -- the name is the package contract the TV and the web preview import
export function rewriteAssetRefs(html: string, resolve: Resolve): string {
	// replaceAll needs Chrome 85; the Tizen 6 TV runs Chrome 76 (lint bans it).
	const withSrcset = html.replace(
		SRCSET,
		(_match, prefix: string, quote: string, value: string) =>
			`${prefix}${quote}${value.replace(
				SRCSET_ITEM,
				(item: string, lead: string, reference: string) =>
					swap(item, lead, reference, resolve)
			)}${quote}`
	);
	function swapReference(
		match: string,
		prefix: string,
		reference: string
	): string {
		return swap(match, prefix, reference, resolve);
	}
	return withSrcset
		.replace(QUOTED_REF, swapReference)
		.replace(UNQUOTED_REF, swapReference);
}
