import { describe, expect, it } from "vitest";

import {
	isIpCheckEnabled,
	isIpInCidrs,
	mintPresenceToken,
	parseCidrs,
	PRESENCE_TTL_MS,
	presenceHttpResponse,
	presenceResponse,
	verifyPresenceToken,
} from "./doorPresence.ts";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;
const IPV4_MAPPED_PREFIX = "::ffff:";

function request(headers: Record<string, string>): Request {
	return new Request("https://example.convex.site/door/presence", {
		headers,
	});
}

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

describe("isIpInCidrs", () => {
	it("matches an exact IPv4 address", () => {
		expect(isIpInCidrs("203.0.113.42", ["203.0.113.42"])).toBe(true);
		expect(isIpInCidrs("203.0.113.43", ["203.0.113.42"])).toBe(false);
	});
	it("matches an IPv4 CIDR", () => {
		expect(isIpInCidrs("192.0.2.3", ["192.0.2.0/24"])).toBe(true);
		expect(isIpInCidrs("198.51.100.3", ["192.0.2.0/24"])).toBe(false);
	});
	it("matches an IPv6 prefix, including :: compression", () => {
		expect(isIpInCidrs("2001:db8:1:2::1", ["2001:db8:1:2::/64"])).toBe(
			true
		);
		expect(isIpInCidrs("2001:db8:1:3::1", ["2001:db8:1:2::/64"])).toBe(
			false
		);
	});
	it("treats an IPv4-mapped IPv6 address as IPv4", () => {
		expect(
			isIpInCidrs(`${IPV4_MAPPED_PREFIX}203.0.113.5`, ["203.0.113.0/24"])
		).toBe(true);
	});
	it("never matches across families", () => {
		expect(isIpInCidrs("192.0.2.1", ["::/0"])).toBe(false);
		expect(isIpInCidrs("::1", ["0.0.0.0/0"])).toBe(false);
	});
	it("rejects malformed input instead of matching", () => {
		expect(isIpInCidrs("not-an-ip", ["0.0.0.0/0"])).toBe(false);
		expect(isIpInCidrs("192.0.2.1", ["192.0.2.0/99"])).toBe(false);
		expect(isIpInCidrs("1:2:3:4:5:6:7:8:9", ["::/0"])).toBe(false);
		expect(isIpInCidrs("256.0.0.1", ["0.0.0.0/0"])).toBe(false);
	});
	it("rejects a CIDR with a malformed prefix instead of matching", () => {
		expect(isIpInCidrs("198.51.100.8", ["203.0.113.4/"])).toBe(false);
		expect(isIpInCidrs("2001:db8::1", ["2001:db8::/"])).toBe(false);
		expect(isIpInCidrs("192.0.2.1", ["192.0.2.0/24/8"])).toBe(false);
		expect(isIpInCidrs("192.0.2.1", ["192.0.2.0/ 8"])).toBe(false);
	});
	it("is false for an empty CIDR set", () => {
		expect(isIpInCidrs("192.0.2.1", [])).toBe(false);
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
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replace(/={1,2}$/, "");
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
		const response = await presenceResponse({
			clientIp: "203.0.113.7",
			buildingCidrs: cidrs,
			secret: SECRET,
			ipCheck: true,
			nowMs: NOW,
		});
		expect(response.status).toBe(200);
		if (response.status !== 200) throw new Error("expected 200");
		expect(await verifyPresenceToken(SECRET, response.token, NOW)).toBe(
			true
		);
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
	const environment = {
		buildingIp: "203.0.113.0/24",
		secret: SECRET,
		siteUrl: SITE_URL,
		ipCheck: undefined,
	};

	it("mints a verifiable token when cf-connecting-ip is on-site", async () => {
		const response = await presenceHttpResponse(
			request({ "cf-connecting-ip": "203.0.113.7" }),
			environment,
			NOW
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { token: string };
		expect(await verifyPresenceToken(SECRET, body.token, NOW)).toBe(true);
	});

	it("403s an on-site x-forwarded-for when cf-connecting-ip is off-site — only cf-connecting-ip is trusted", async () => {
		const response = await presenceHttpResponse(
			request({
				"x-forwarded-for": "203.0.113.7",
				"cf-connecting-ip": "198.51.100.1",
			}),
			environment,
			NOW
		);
		expect(response.status).toBe(403);
	});

	it("403s an on-site x-forwarded-for with no cf-connecting-ip at all", async () => {
		const response = await presenceHttpResponse(
			request({ "x-forwarded-for": "203.0.113.7" }),
			environment,
			NOW
		);
		expect(response.status).toBe(403);
	});

	it("sets CORS to the site URL and disables caching", async () => {
		const response = await presenceHttpResponse(
			request({ "cf-connecting-ip": "203.0.113.7" }),
			environment,
			NOW
		);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			SITE_URL
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});

describe("isIpCheckEnabled", () => {
	it("is on unless explicitly turned off", () => {
		expect(isIpCheckEnabled(undefined)).toBe(true);
		expect(isIpCheckEnabled("")).toBe(true);
		expect(isIpCheckEnabled("on")).toBe(true);
		expect(isIpCheckEnabled("0")).toBe(true);
		expect(isIpCheckEnabled("false")).toBe(true);
		expect(isIpCheckEnabled("OFF")).toBe(true);
		expect(isIpCheckEnabled("off")).toBe(false);
	});
});

describe("building-IP check turned off", () => {
	it("mints a token for any client IP, or none", async () => {
		for (const clientIp of ["198.51.100.1", null]) {
			const response = await presenceResponse({
				clientIp,
				buildingCidrs: [],
				secret: SECRET,
				ipCheck: false,
				nowMs: NOW,
			});
			expect(response.status).toBe(200);
			if (response.status !== 200) throw new Error("expected 200");
			expect(await verifyPresenceToken(SECRET, response.token, NOW)).toBe(
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
		const response = await presenceHttpResponse(
			new Request("https://example.convex.site/door/presence"),
			{
				buildingIp: undefined,
				secret: SECRET,
				siteUrl: "https://app.thejfloor.com",
				ipCheck: "off",
			},
			NOW
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { token: string };
		expect(await verifyPresenceToken(SECRET, body.token, NOW)).toBe(true);
	});
});
