import {
	resolveTrack,
	resolveTrackLayout,
	usesContent,
} from "./columnTracks.ts";

const CONTENT = 90;

describe("resolveTrack css", () => {
	it("floors an unsized column at its content and shares what is left", () => {
		expect(resolveTrack(undefined, CONTENT).css).toBe("minmax(90px, 1fr)");
	});

	it("reads a bare number as pixels", () => {
		expect(resolveTrack(120, CONTENT).css).toBe("120px");
	});

	it("sizes a content column to its widest cell, in pixels", () => {
		expect(resolveTrack("content", CONTENT).css).toBe("90px");
	});

	it("reads a weight as a share that can still shrink", () => {
		expect(resolveTrack({ weight: 2 }, CONTENT).css).toBe("minmax(0, 2fr)");
	});

	it("defaults the weight to 1 when only a floor is given", () => {
		expect(resolveTrack({ min: 200 }, CONTENT).css).toBe(
			"minmax(200px, 1fr)"
		);
	});

	it("combines a floor with a weight", () => {
		expect(resolveTrack({ min: 200, weight: 2 }, CONTENT).css).toBe(
			"minmax(200px, 2fr)"
		);
	});

	it("bounds a column at both ends", () => {
		expect(resolveTrack({ min: 120, max: 300 }, CONTENT).css).toBe(
			"minmax(120px, 300px)"
		);
	});

	it("caps a column with an explicit zero floor", () => {
		expect(resolveTrack({ min: 0, max: 300 }, CONTENT).css).toBe(
			"minmax(0px, 300px)"
		);
	});

	it("lets the max win over a weight", () => {
		expect(
			resolveTrack({ min: 120, max: 300, weight: 4 }, CONTENT).css
		).toBe("minmax(120px, 300px)");
	});

	it("leaves a max below its min to CSS", () => {
		expect(resolveTrack({ min: 300, max: 100 }, CONTENT).css).toBe(
			"minmax(300px, 100px)"
		);
	});

	it("treats a non-finite pixel size as omitted", () => {
		expect(resolveTrack(NaN, CONTENT).css).toBe("minmax(90px, 1fr)");
	});

	it("clamps a negative pixel size to zero", () => {
		expect(resolveTrack(-50, CONTENT).css).toBe("0px");
	});

	it("reads a zero pixel size as-is", () => {
		expect(resolveTrack(0, CONTENT).css).toBe("0px");
	});

	it("clamps a negative floor to zero", () => {
		expect(resolveTrack({ min: -5 }, CONTENT).css).toBe("minmax(0px, 1fr)");
	});

	it("treats a non-finite floor as unsized", () => {
		expect(resolveTrack({ min: NaN, max: 300 }, CONTENT).css).toBe(
			"minmax(0px, 300px)"
		);
	});

	it("floors at the content width", () => {
		expect(resolveTrack({ min: "content" }, CONTENT).css).toBe(
			"minmax(90px, 1fr)"
		);
	});

	it("floors at the content width with a weight", () => {
		expect(resolveTrack({ min: "content", weight: 2 }, CONTENT).css).toBe(
			"minmax(90px, 2fr)"
		);
	});

	it("floors at the content width with a ceiling", () => {
		expect(resolveTrack({ min: "content", max: 300 }, CONTENT).css).toBe(
			"minmax(90px, 300px)"
		);
	});
});

describe("resolveTrackLayout tracks", () => {
	it("joins every column into one track list", () => {
		expect(
			resolveTrackLayout([
				{ id: "select", size: 48, content: 0 },
				{ id: "note", size: { min: 200, weight: 2 }, content: 0 },
				{ id: "name", size: undefined, content: 75 },
			]).tracks
		).toBe("48px minmax(200px, 2fr) minmax(75px, 1fr)");
	});
});

describe("resolveTrack", () => {
	it("reports each form's floor and whether it flexes", () => {
		expect(resolveTrack(undefined, CONTENT)).toMatchObject({
			floor: 90,
			flexible: true,
		});
		expect(resolveTrack("content", CONTENT)).toMatchObject({
			floor: 90,
			flexible: false,
		});
		expect(resolveTrack(84, CONTENT)).toMatchObject({
			floor: 84,
			flexible: false,
		});
		expect(resolveTrack({ weight: 3 }, CONTENT)).toMatchObject({
			floor: 0,
			flexible: true,
		});
		expect(resolveTrack({ min: 120, max: 300 }, CONTENT)).toMatchObject({
			floor: 120,
			flexible: false,
		});
		expect(
			resolveTrack({ min: "content", max: 300 }, CONTENT)
		).toMatchObject({ floor: 90, flexible: false });
	});
});

describe("usesContent", () => {
	it("is true for every form that reads the measured width", () => {
		expect(usesContent(undefined)).toBe(true);
		expect(usesContent("content")).toBe(true);
		expect(usesContent({ min: "content", weight: 2 })).toBe(true);
		expect(usesContent(NaN)).toBe(true);
	});

	it("is false for authored pixel sizes and bare weights", () => {
		expect(usesContent(84)).toBe(false);
		expect(usesContent({ min: 200 })).toBe(false);
		expect(usesContent({ weight: 2 })).toBe(false);
	});
});

describe("resolveTrackLayout", () => {
	it("adds no filler when any track flexes", () => {
		expect(
			resolveTrackLayout([
				{ id: "select", size: 48, content: 0 },
				{ id: "name", size: undefined, content: 121 },
				{ id: "note", size: { min: 200, weight: 2 }, content: 0 },
				{ id: "actions", size: 84, content: 0 },
			])
		).toEqual({
			tracks: "48px minmax(121px, 1fr) minmax(200px, 2fr) 84px",
			floor: 453,
		});
	});

	it("puts the filler before the actions column when nothing flexes", () => {
		expect(
			resolveTrackLayout([
				{ id: "name", size: "content", content: 121 },
				{ id: "at", size: 90, content: 0 },
				{ id: "actions", size: 84, content: 0 },
			])
		).toEqual({
			tracks: "121px 90px minmax(0, 1fr) 84px",
			floor: 295,
		});
	});

	it("puts the filler last when nothing flexes and there is no actions column", () => {
		expect(
			resolveTrackLayout([
				{ id: "name", size: "content", content: 121 },
				{ id: "at", size: { min: 80, max: 120 }, content: 0 },
			])
		).toEqual({
			tracks: "121px minmax(80px, 120px) minmax(0, 1fr)",
			floor: 201,
		});
	});

	it("returns one equal-share track for no columns", () => {
		expect(resolveTrackLayout([])).toEqual({
			tracks: "1fr",
			floor: 0,
		});
	});
});

describe("resolveTrackLayout with a content length", () => {
	it("writes a column's contentCss where its content width goes", () => {
		const layout = resolveTrackLayout([
			{ id: "a", size: undefined, content: 90, contentCss: "var(--w)" },
			{ id: "b", size: "content", content: 40, contentCss: "var(--v)" },
			{ id: "c", size: { min: "content", max: 300 }, content: 10 },
		]);
		expect(layout.tracks).toBe(
			"minmax(var(--w), 1fr) var(--v) minmax(10px, 300px)"
		);
		expect(layout.floor).toBe(140);
	});
});
