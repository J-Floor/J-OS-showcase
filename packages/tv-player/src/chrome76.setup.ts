/**
 * Vitest setup: removes the runtime APIs the Tizen TV's Chrome 76 lacks, so a
 * test fails where the TV would throw. The build lowers syntax but not APIs.
 * The language builtins (at, replaceAll, hasOwn, structuredClone) are left alone: the test runner itself uses them; eslint guards them.
 * (apps/tv has the same file; keep the two lists equal.)
 */
const missing: [object, string][] = [
	[Element.prototype, "replaceChildren"],
	[Document.prototype, "replaceChildren"],
	[DocumentFragment.prototype, "replaceChildren"],
	[AbortSignal, "timeout"],
];
for (const [target, name] of missing) {
	Object.defineProperty(target, name, {
		value: undefined,
		configurable: true,
		writable: true,
	});
}
