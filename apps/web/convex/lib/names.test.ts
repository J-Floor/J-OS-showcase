import { describe, expect, it } from "vitest";

import { displayName, shortNames } from "./names.ts";

function p(id: string, firstName: string, lastName: string) {
	return { _id: id, firstName, lastName };
}

describe("displayName", () => {
	it("joins the pair and trims", () => {
		expect(displayName({ firstName: "Ada", lastName: "Lovelace" })).toBe(
			"Ada Lovelace"
		);
	});
});

describe("shortNames", () => {
	it("uses the first name where nothing else shares it", () => {
		const names = shortNames([
			p("1", "Ada", "Lovelace"),
			p("2", "Grace", "Hopper"),
		]);
		expect(names.get("1")).toBe("Ada");
		expect(names.get("2")).toBe("Grace");
	});

	it("adds a surname initial to BOTH people sharing a first name", () => {
		// Disambiguating only one of them would read as though "Alan" and
		// "Alan T." were the same person mentioned twice.
		const names = shortNames([
			p("1", "Alan", "Turing"),
			p("2", "Alan", "Perlis"),
		]);
		expect(names.get("1")).toBe("Alan T.");
		expect(names.get("2")).toBe("Alan P.");
	});

	it("leaves an unrelated name alone while disambiguating the clash", () => {
		const names = shortNames([
			p("1", "Alan", "Turing"),
			p("2", "Alan", "Perlis"),
			p("3", "Grace", "Hopper"),
		]);
		expect(names.get("3")).toBe("Grace");
	});

	it("falls back to the full name when the initial cannot break the tie", () => {
		// Two Alan T.s: an initial claims a distinction it cannot make, which
		// is worse than a long label.
		const names = shortNames([
			p("1", "Alan", "Turing"),
			p("2", "Alan", "Thompson"),
		]);
		expect(names.get("1")).toBe("Alan Turing");
		expect(names.get("2")).toBe("Alan Thompson");
	});

	it("falls back to the full name when there is no surname to use", () => {
		const names = shortNames([
			p("1", "Alan", ""),
			p("2", "Alan", "Perlis"),
		]);
		expect(names.get("1")).toBe("Alan");
		expect(names.get("2")).toBe("Alan P.");
	});

	it("ignores surrounding whitespace when deciding what clashes", () => {
		const names = shortNames([
			p("1", " Alan ", "Turing"),
			p("2", "Alan", "Perlis"),
		]);
		expect(names.get("1")).toBe("Alan T.");
	});
});
