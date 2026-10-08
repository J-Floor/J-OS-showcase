import { describe, expect, it } from "vitest";

import {
	ipCheckEnabled,
	ipInCidrs,
	mintPresenceToken,
	parseCidrs,
	PRESENCE_TTL_MS,
	presenceHttpResponse,
	presenceResponse,
	verifyPresenceToken,
} from "./doorPresence.ts";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

describe("parseCidrs", () => {
	it("splits, trims and drops empties", () => {
		expect(parseCidrs(" 203.0.113.4 , 2001:db8::/32,,")).toEqual([
			"203.0.113.4",
			"2001:db8::/32",
		]);
	});
	it("returns [] when unset", () => {
		expect(parseCidrs(undefined)).toEqual([]);
	});
});

describe("ipInCidrs", () => {
	it("matches an exact IPv4 address", () => {
		expect(ipInCidrs("203.0.113.42", ["203.0.113.42"])).toBe(true);
		expect(ipInCidrs("203.0.113.43", ["203.0.113.42"])).toBe(false);
	});
	it("matches an IPv4 CIDR", () => {
		expect(ipInCidrs("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
		expect(ipInCidrs("198.51.100.3", ["10.0.0.0/8"])).toBe(false);
	});
	it("matches an IPv6 prefix, including :: compression", () => {
		expect(ipInCidrs("2001:db8:1:2::1", ["2001:db8:1:2::/64"])).toBe(true);
		expect(ipInCidrs("2001:db8:1:3::1", ["2001:db8:1:2::/64"])).toBe(false);
	});
	it("treats an IPv4-mapped IPv6 address as IPv4", () => {
		expect(ipInCidrs("::ffff:10.0.0.5", ["10.0.0.0/24"])).toBe(true);
	});
	it("never matches across families", () => {
		expect(ipInCidrs("10.0.0.1", ["::/0"])).toBe(false);
		expect(ipInCidrs("::1", ["0.0.0.0/0"])).toBe(false);
	});
	it("rejects malformed input instead of matching", () => {
		expect(ipInCidrs("not-an-ip", ["0.0.0.0/0"])).toBe(false);
		expect(ipInCidrs("10.0.0.1", ["10.0.0.0/99"])).toBe(false);
		expect(ipInCidrs("1:2:3:4:5:6:7:8:9", ["::/0"])).toBe(false);
		expect(ipInCidrs("256.0.0.1", ["0.0.0.0/0"])).toBe(false);
	});
	it("rejects a CIDR with a malformed prefix instead of matching", () => {
		expect(ipInCidrs("198.51.100.8", ["203.0.113.4/"])).toBe(false);
		expect(ipInCidrs("2001:db8::1", ["2001:db8::/"])).toBe(false);
		expect(ipInCidrs("10.0.0.1", ["10.0.0.0/8/8"])).toBe(false);
		expect(ipInCidrs("10.0.0.1", ["10.0.0.0/ 8"])).toBe(false);
	});
	it("is false for an empty CIDR set", () => {
		expect(ipInCidrs("10.0.0.1", [])).toBe(false);
	});
});

describe("presence token", () => {
	it("verifies a freshly minted token", async () => {
		const token = await mintPresenceToken(SECRET, NOW);
		expect(await verifyPresenceToken(SECRET, token, NOW + 1_000)).toBe(
			true
		);
	});
	it("rejects an expired token", async () => {
		const token = await mintPresenceToken(SECRET, NOW);
		expect(
			await verifyPresenceToken(SECRET, token, NOW + PRESENCE_TTL_MS)
		).toBe(false);
	});
	it("rejects a token signed with another secret", async () => {
		const token = await mintPresenceToken("other", NOW);
		expect(await verifyPresenceToken(SECRET, token, NOW)).toBe(false);
	});
	it("rejects a tampered payload", async () => {
		const token = await mintPresenceToken(SECRET, NOW);
		const [, sig] = token.split(".");
		const forged = btoa(JSON.stringify({ exp: NOW + 10 ** 9 }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(await verifyPresenceToken(SECRET, `${forged}.${sig}`, NOW)).toBe(
			false
		);
	});
	it("rejects garbage", async () => {
		expect(await verifyPresenceToken(SECRET, "", NOW)).toBe(false);
		expect(await verifyPresenceToken(SECRET, "a.b.c", NOW)).toBe(false);
		// Undecodable base64 (length % 4 === 1): atob throws on these.
		expect(await verifyPresenceToken(SECRET, "a.b", NOW)).toBe(false);
		expect(await verifyPresenceToken(SECRET, "abcde.abcde", NOW)).toBe(
			false
		);
		expect(await verifyPresenceToken(SECRET, "!!!.???", NOW)).toBe(false);
	});
});

describe("presenceResponse", () => {
	const cidrs = ["203.0.113.0/24"];
	it("mints a verifiable token for an on-site IP", async () => {
		const res = await presenceResponse({
			clientIp: "203.0.113.7",
			buildingCidrs: cidrs,
			secret: SECRET,
			ipCheck: true,
			nowMs: NOW,
		});
		expect(res.status).toBe(200);
		if (res.status !== 200) throw new Error("expected 200");
		expect(await verifyPresenceToken(SECRET, res.token, NOW)).toBe(true);
	});
	it("403s an off-site IP", async () => {
		expect(
			await presenceResponse({
				clientIp: "198.51.100.1",
				buildingCidrs: cidrs,
				secret: SECRET,
				ipCheck: true,
				nowMs: NOW,
			})
		).toEqual({ status: 403 });
	});
	it("fails closed without a client IP", async () => {
		expect(
			await presenceResponse({
				clientIp: null,
				buildingCidrs: cidrs,
				secret: SECRET,
				ipCheck: true,
				nowMs: NOW,
			})
		).toEqual({ status: 403 });
	});
	it("fails closed without a secret", async () => {
		expect(
			await presenceResponse({
				clientIp: "203.0.113.7",
				buildingCidrs: cidrs,
				secret: undefined,
				ipCheck: true,
				nowMs: NOW,
			})
		).toEqual({ status: 403 });
	});
	it("fails closed with no building network configured", async () => {
		expect(
			await presenceResponse({
				clientIp: "203.0.113.7",
				buildingCidrs: [],
				secret: SECRET,
				ipCheck: true,
				nowMs: NOW,
			})
		).toEqual({ status: 403 });
	});
});

describe("presenceHttpResponse", () => {
	const SITE_URL = "https://app.thejfloor.com";
	const env = {
		buildingIp: "203.0.113.0/24",
		secret: SECRET,
		siteUrl: SITE_URL,
		ipCheck: undefined,
	};

	function req(headers: Record<string, string>): Request {
		return new Request("https://example.convex.site/door/presence", {
			headers,
		});
	}

	it("mints a verifiable token when cf-connecting-ip is on-site", async () => {
		const res = await presenceHttpResponse(
			req({ "cf-connecting-ip": "203.0.113.7" }),
			env,
			NOW
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string };
		expect(await verifyPresenceToken(SECRET, body.token, NOW)).toBe(true);
	});

	it("403s an on-site x-forwarded-for when cf-connecting-ip is off-site — only cf-connecting-ip is trusted", async () => {
		const res = await presenceHttpResponse(
			req({
				"x-forwarded-for": "203.0.113.7",
				"cf-connecting-ip": "198.51.100.1",
			}),
			env,
			NOW
		);
		expect(res.status).toBe(403);
	});

	it("403s an on-site x-forwarded-for with no cf-connecting-ip at all", async () => {
		const res = await presenceHttpResponse(
			req({ "x-forwarded-for": "203.0.113.7" }),
			env,
			NOW
		);
		expect(res.status).toBe(403);
	});

	it("sets CORS to the site URL and disables caching", async () => {
		const res = await presenceHttpResponse(
			req({ "cf-connecting-ip": "203.0.113.7" }),
			env,
			NOW
		);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE_URL);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});

describe("ipCheckEnabled", () => {
	it("is on unless explicitly turned off", () => {
		expect(ipCheckEnabled(undefined)).toBe(true);
		expect(ipCheckEnabled("")).toBe(true);
		expect(ipCheckEnabled("on")).toBe(true);
		expect(ipCheckEnabled("0")).toBe(true);
		expect(ipCheckEnabled("false")).toBe(true);
		expect(ipCheckEnabled("OFF")).toBe(true);
		expect(ipCheckEnabled("off")).toBe(false);
	});
});

describe("building-IP check turned off", () => {
	it("mints a token for any client IP, or none", async () => {
		for (const clientIp of ["198.51.100.1", null]) {
			const res = await presenceResponse({
				clientIp,
				buildingCidrs: [],
				secret: SECRET,
				ipCheck: false,
				nowMs: NOW,
			});
			expect(res.status).toBe(200);
			if (res.status !== 200) throw new Error("expected 200");
			expect(await verifyPresenceToken(SECRET, res.token, NOW)).toBe(
				true
			);
		}
	});

	it("still fails closed without a secret", async () => {
		expect(
			await presenceResponse({
				clientIp: "198.51.100.1",
				buildingCidrs: [],
				secret: undefined,
				ipCheck: false,
				nowMs: NOW,
			})
		).toEqual({ status: 403 });
	});

	it("the route honours DOOR_PRESENCE_IP_CHECK=off", async () => {
		const res = await presenceHttpResponse(
			new Request("https://example.convex.site/door/presence"),
			{
				buildingIp: undefined,
				secret: SECRET,
				siteUrl: "https://app.thejfloor.com",
				ipCheck: "off",
			},
			NOW
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string };
		expect(await verifyPresenceToken(SECRET, body.token, NOW)).toBe(true);
	});
});
