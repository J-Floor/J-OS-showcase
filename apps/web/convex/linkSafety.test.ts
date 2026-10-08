import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

async function seed(t: ReturnType<typeof convexTest>) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "",
			tier: "prospect",
			stage: "verified",
			stageSince: 0,
			venture: {
				links: [
					{ label: "", url: "https://good.example/" },
					{ label: "", url: "https://evil.example/" },
				],
			},
		})
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("linkSafety.check", () => {
	it("flags a matched link and stamps checkedAt on every link", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "k");
		const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						matches: [
							{
								threatType: "SOCIAL_ENGINEERING",
								threat: { url: "https://evil.example/" },
							},
						],
					}),
					{ status: 200 }
				)
			)
		);
		vi.stubGlobal("fetch", fetchMock);
		await t.action(internal.linkSafety.check, { personId: id });
		expect(fetchMock.mock.calls[0][0]).toContain(ENDPOINT);
		const links = (await t.run((ctx) => ctx.db.get(id)))!.venture!.links!;
		expect(links[0].threat).toBeUndefined();
		expect(links[0].checkedAt).toBeTypeOf("number");
		expect(links[1].threat).toBe("SOCIAL_ENGINEERING");
	});

	it("leaves links untouched without a key or on an API error", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "");
		await t.action(internal.linkSafety.check, { personId: id });
		expect(
			(await t.run((ctx) => ctx.db.get(id)))!.venture!.links![0].checkedAt
		).toBeUndefined();
		vi.stubEnv("SAFE_BROWSING_API_KEY", "k");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response("nope", { status: 500 })))
		);
		await t.action(internal.linkSafety.check, { personId: id });
		expect(
			(await t.run((ctx) => ctx.db.get(id)))!.venture!.links![0].checkedAt
		).toBeUndefined();
	});

	it("sends the key in a header and every link in the body, and matches a trailing-slash verdict", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "bo@example.com",
				firstName: "Bo",
				lastName: "",
				tier: "prospect",
				stage: "verified",
				stageSince: 0,
				venture: {
					links: [
						{ label: "", url: "https://evil.example" },
						{ label: "", url: "https://fine.example/" },
					],
				},
			})
		);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "secret-key");
		const fetchMock = vi.fn<
			(url: string, init: RequestInit) => Promise<Response>
		>(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						matches: [
							{
								threatType: "MALWARE",
								threat: { url: "https://evil.example/" },
							},
							{ threatType: "MALWARE" },
						],
					}),
					{ status: 200 }
				)
			)
		);
		vi.stubGlobal("fetch", fetchMock);
		await t.action(internal.linkSafety.check, { personId: id });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(ENDPOINT);
		expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe(
			"secret-key"
		);
		const body = JSON.parse(init.body as string) as {
			threatInfo: {
				threatTypes: string[];
				threatEntries: { url: string }[];
			};
		};
		expect(body.threatInfo.threatTypes).toEqual([
			"MALWARE",
			"SOCIAL_ENGINEERING",
			"UNWANTED_SOFTWARE",
			"POTENTIALLY_HARMFUL_APPLICATION",
		]);
		expect(body.threatInfo.threatEntries).toEqual([
			{ url: "https://evil.example" },
			{ url: "https://fine.example/" },
		]);
		const links = (await t.run((ctx) => ctx.db.get(id)))!.venture!.links!;
		expect(links[0].threat).toBe("MALWARE");
		expect(links[1].threat).toBeUndefined();
	});

	it("survives a thrown fetch: logs the error name only and writes nothing", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t);
		vi.stubEnv("SAFE_BROWSING_API_KEY", "secret-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.reject(
					new TypeError("fetch failed for https://good.example/")
				)
			)
		);
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		await t.action(internal.linkSafety.check, { personId: id });
		const logged = err.mock.calls.flat().map(String).join(" ");
		err.mockRestore();
		expect(logged).toContain("TypeError");
		expect(logged).not.toContain("good.example");
		expect(logged).not.toContain("secret-key");
		expect(
			(await t.run((ctx) => ctx.db.get(id)))!.venture!.links![0].checkedAt
		).toBeUndefined();
	});
});
