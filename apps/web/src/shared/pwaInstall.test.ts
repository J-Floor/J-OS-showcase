import { describe, expect, it } from "vitest";

import { installMethod } from "./pwaInstall.ts";

const UA = {
	samsung:
		"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
	firefoxAndroid:
		"Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
	edgeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0",
	operaAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 OPR/85.0.0.0",
	desktopChrome:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
	iosSafari:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
	iosChrome:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
	iosFirefox:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
	iosEdge:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15",
	ipadDesktopMode:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

describe("installMethod", () => {
	it.each([
		["Samsung Internet", UA.samsung, false, 0, "samsung"],
		["Firefox Android", UA.firefoxAndroid, false, 0, "firefox"],
		["Opera Android", UA.operaAndroid, false, 0, "other-android"],
		["Chrome Android without a prompt", UA.chromeAndroid, false, 0, "none"],
		["Edge Android without a prompt", UA.edgeAndroid, false, 0, "none"],
		["Chrome Android with a prompt", UA.chromeAndroid, true, 0, "prompt"],
		["Samsung Internet with a prompt", UA.samsung, true, 0, "prompt"],
		["desktop Chrome with a prompt", UA.desktopChrome, true, 0, "prompt"],
		["desktop Chrome without a prompt", UA.desktopChrome, false, 0, "none"],
		["iOS Safari", UA.iosSafari, false, 5, "none"],
		["iOS Chrome", UA.iosChrome, false, 5, "none"],
		["iOS Firefox", UA.iosFirefox, false, 5, "none"],
		["iOS Edge", UA.iosEdge, false, 5, "none"],
		["iPadOS desktop mode", UA.ipadDesktopMode, false, 5, "none"],
		["iOS even with a prompt", UA.iosSafari, true, 5, "none"],
	] as const)("%s → %s", (_name, ua, hasPrompt, maxTouchPoints, expected) => {
		expect(installMethod(ua, hasPrompt, maxTouchPoints)).toBe(expected);
	});

	it("treats a Mac without touch as desktop, not iOS", () => {
		expect(installMethod(UA.ipadDesktopMode, true, 0)).toBe("prompt");
	});
});
