import type { PolymorphicProps } from "@ark-ui/solid/factory";
import type { JSX } from "solid-js";

/** The function an Ark `asChild` render prop is called with. */
type AsChildProps<T extends keyof JSX.IntrinsicElements> = Parameters<
	NonNullable<PolymorphicProps<T>["asChild"]>
>[0];

/** What an Ark `asChild` render function hands its child, derived from Ark's
 *  own type: the part's props merged with the element's own attributes. */
export type TriggerProps<T extends keyof JSX.IntrinsicElements = "button"> =
	ReturnType<AsChildProps<T>> & NonNullable<Parameters<AsChildProps<T>>[0]>;

type TriggerClickEvent = Parameters<
	JSX.EventHandler<HTMLButtonElement, MouseEvent>
>[0];

/** Runs a Solid handler in either form: a function, or `[handler, data]`. */
export function callHandler(
	handler: TriggerProps["onClick"],
	event: TriggerClickEvent
): void {
	if (typeof handler === "function") {
		handler(event);
	} else if (handler) {
		handler[0](handler[1], event);
	}
}
