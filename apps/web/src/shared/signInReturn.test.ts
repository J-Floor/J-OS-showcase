import { expect, test } from "vitest";

import { returnPath, signInHref } from "./signInReturn.ts";

test("a returnable page survives the round trip through /signin", () => {
	const href = signInHref("/tv/pair?code=abc");
	expect(href.startsWith("/signin")).toBe(true);
	expect(returnPath(href.slice("/signin".length))).toBe("/tv/pair?code=abc");
});

test("any other page just goes to plain /signin", () => {
	expect(signInHref("/tasks")).toBe("/signin");
	expect(signInHref("/")).toBe("/signin");
});

test("no or foreign next lands on /", () => {
	expect(returnPath("")).toBe("/");
	expect(returnPath("?next=https://example.com/tv/pair")).toBe("/");
	expect(returnPath("?next=//example.com/tv/pair")).toBe("/");
	expect(returnPath("?next=/tasks")).toBe("/");
	expect(returnPath("?next=/tv/pair/../../tasks")).toBe("/");
});

test("the one-time sign-in token is not carried into next", () => {
	const href = signInHref("/tv/pair?code=abc&ott=secret");
	expect(href).not.toContain("ott");
	expect(returnPath(href.slice("/signin".length))).toBe("/tv/pair?code=abc");
	expect(signInHref("/tv/pair?ott=secret")).toBe(
		`/signin?next=${encodeURIComponent("/tv/pair")}`
	);
});

test("backslash, javascript: and look-alike paths are not returnable", () => {
	expect(returnPath("?next=/\\evil")).toBe("/");
	expect(returnPath("?next=javascript:alert(1)")).toBe("/");
	expect(returnPath("?next=/tv/pairx")).toBe("/");
	expect(signInHref("/tv/pairx")).toBe("/signin");
});
