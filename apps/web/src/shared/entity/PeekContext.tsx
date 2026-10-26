import { createContext, useContext } from "solid-js";

/** Present while an entity sheet is a peek over another page: the link that
 *  takes the entity to its own page, in place of the prev/next arrows. */
export const PeekContext = createContext<{
	viewIn: { label: string; href: string };
}>();

export function usePeek() {
	return useContext(PeekContext);
}
