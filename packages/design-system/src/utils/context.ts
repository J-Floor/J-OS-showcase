import { useContext, type Context } from "solid-js";

/** A compound part's context, or a throw naming `part` and the `root` it
 *  must sit inside. */
export function useRequiredContext<T>(
	context: Context<T | undefined>,
	part: string,
	root: string
): T {
	const value = useContext(context);
	if (value === undefined)
		throw new Error(`${part} must sit inside ${root}.`);
	return value;
}
