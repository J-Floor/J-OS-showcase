/** `true` when A and B are the same type, else `never`; tuple-wrapped so unions do not distribute. */
export type AssertEqual<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;
