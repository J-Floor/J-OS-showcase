import { describe, expect, it, vi } from "vitest";

import { previewSlides } from "./previewSlides.ts";

describe("previewSlides", () => {
	it("passes image URLs through and rewrites an HTML slide's assets to their URLs", async () => {
		const fetchText = vi.fn(() =>
			Promise.resolve('<img src="assets/logo.png">')
		);
		const slides = await previewSlides(
			{
				transition: "fade",
				slides: [
					{
						id: "a",
						kind: "image",
						durationSec: 15,
						url: "https://files.example.com/a",
					},
					{
						id: "b",
						kind: "html",
						durationSec: 20,
						url: "https://files.example.com/b",
					},
				],
				assets: [
					{
						path: "assets/logo.png",
						url: "https://files.example.com/logo",
					},
				],
			},
			fetchText
		);
		expect(fetchText).toHaveBeenCalledWith("https://files.example.com/b");
		expect(slides).toEqual([
			{
				id: "a",
				kind: "image",
				durationSec: 15,
				imageUrl: "https://files.example.com/a",
			},
			{
				id: "b",
				kind: "html",
				durationSec: 20,
				html: '<img src="https://files.example.com/logo">',
			},
		]);
	});

	it("leaves an asset path the pack does not hold as written", async () => {
		const slides = await previewSlides(
			{
				transition: "fade",
				slides: [
					{
						id: "b",
						kind: "html",
						durationSec: 20,
						url: "https://files.example.com/b",
					},
				],
				assets: [],
			},
			() => Promise.resolve('<img src="assets/missing.png">')
		);
		expect(slides).toEqual([
			{
				id: "b",
				kind: "html",
				durationSec: 20,
				html: '<img src="assets/missing.png">',
			},
		]);
	});

	it("leaves out a slide whose file cannot be fetched and keeps the others", async () => {
		const slides = await previewSlides(
			{
				transition: "fade",
				slides: [
					{
						id: "bad",
						kind: "html",
						durationSec: 20,
						url: "https://files.example.com/bad",
					},
					{
						id: "good",
						kind: "html",
						durationSec: 20,
						url: "https://files.example.com/good",
					},
					{
						id: "img",
						kind: "image",
						durationSec: 10,
						url: "https://files.example.com/img",
					},
				],
				assets: [],
			},
			(url) =>
				url.endsWith("/bad")
					? Promise.reject(new TypeError("blocked"))
					: Promise.resolve("<p>ok</p>")
		);
		expect(slides.map((slide) => slide.id)).toEqual(["good", "img"]);
	});
});
