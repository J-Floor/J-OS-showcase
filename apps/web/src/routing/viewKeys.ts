import { pageViewKey } from "../../convex/lib/appViews.ts";
import {
	PEEK_PARAM,
	parsePeek,
	peekValue,
} from "../shared/entity/peekParam.ts";
import { entityDescriptors } from "../shell/entity/entityDescriptors.ts";
import { modules } from "../shell/registry.ts";

/** The view keys a URL shows: its module page, the entity its page sheet
 *  has open, and the entity a peek over it has open. Same format as
 *  `appViews.recordView` expects. */
export function viewKeysFor(
	pathname: string,
	search: URLSearchParams
): string[] {
	const page = modules.find((entry) => entry.path === pathname);
	if (!page) return [];
	const keys = [pageViewKey(page.id)];
	const sheet = entityDescriptors.find(
		(desc) => desc.route === pathname && search.get(desc.param)
	);
	const slug = sheet && search.get(sheet.param);
	if (sheet && slug) keys.push(peekValue(sheet, slug));
	// A peek param is already `<kind>:<slug>`; only its kind needs checking.
	const peek = search.get(PEEK_PARAM) ?? undefined;
	const kind = parsePeek(peek)?.kind;
	if (peek && entityDescriptors.some((desc) => desc.key === kind))
		keys.push(peek);
	return keys;
}
