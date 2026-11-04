import type { Infer } from "convex/values";

import type { ventureValidator } from "../../../convex/schema.ts";

/** URL helpers shared by the sign-up form and the member profile editor. */

type LinkEntry = Pick<
	NonNullable<Infer<typeof ventureValidator>["links"]>[number],
	"label" | "url"
>;

export function normalizeUrl(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	return /^[a-z][\w+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
}

/** Build the venture links array from ordered URL slots: the contiguous filled
 * prefix only (a cleared middle slot truncates), URLs normalised. Labels: a
 * slot whose normalised URL matches the same-index entry in `previous` keeps
 * that entry's label (so editing one URL never wipes another link's label);
 * otherwise the label is empty. Sign-up passes no `previous`, so its links get
 * empty labels exactly as before. */
export function buildLinks(
	slots: string[],
	previous: LinkEntry[] = []
): LinkEntry[] {
	const built: LinkEntry[] = [];
	for (let index = 0; index < slots.length; index++) {
		const url = slots[index].trim();
		if (url === "") break;
		const normalized = normalizeUrl(url);
		// `.at(i)` (not `previous[i]`): the index can be out of range when
		// `previous` is shorter than `slots`, so the type must admit undefined —
		// otherwise the truthiness guard below reads as "always truthy" to lint.
		const prev = previous.at(index);
		const label =
			prev && normalizeUrl(prev.url) === normalized ? prev.label : "";
		built.push({ label, url: normalized });
	}
	return built;
}
