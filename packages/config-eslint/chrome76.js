/**
 * DOM and runtime APIs the Tizen TV (Chrome 76) lacks. The build lowers syntax
 * but not APIs, so one of these throws on the TV and passes every test here.
 * Shared by apps/tv and packages/tv-player so the two lists cannot drift.
 */
export const CHROME_76 = "The Tizen TV runs Chrome 76, which lacks this API.";
export const chrome76Properties = [
	{
		property: "replaceChildren",
		message: `${CHROME_76} Use el.textContent = "" then el.append(...).`,
	},
	{
		property: "replaceAll",
		message: `${CHROME_76} Use replace with a /g regex.`,
	},
	{
		property: "at",
		message: `${CHROME_76} Use index access (list[list.length - 1]).`,
	},
	{ property: "findLast", message: CHROME_76 },
	{ property: "findLastIndex", message: CHROME_76 },
	{ property: "toSorted", message: CHROME_76 },
	{ property: "toReversed", message: CHROME_76 },
	{ property: "toSpliced", message: CHROME_76 },
	{ property: "randomUUID", message: CHROME_76 },
	{
		object: "Object",
		property: "hasOwn",
		message: `${CHROME_76} Use Object.prototype.hasOwnProperty.call.`,
	},
	{
		object: "AbortSignal",
		property: "timeout",
		message: `${CHROME_76} Use an AbortController and setTimeout.`,
	},
	{ object: "AbortSignal", property: "any", message: CHROME_76 },
	{ object: "Array", property: "fromAsync", message: CHROME_76 },
	{ object: "Promise", property: "withResolvers", message: CHROME_76 },
	{ object: "Object", property: "groupBy", message: CHROME_76 },
	{ property: "showModal", message: CHROME_76 },
	{ property: "requestSubmit", message: CHROME_76 },
	{ property: "hasOwn", message: CHROME_76 },
	{
		object: "document",
		property: "startViewTransition",
		message: "No View Transitions API on the TV.",
	},
];
