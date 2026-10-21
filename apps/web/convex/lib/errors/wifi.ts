export type WifiError =
	| { type: "WifiNotConfigured" }
	| { type: "WifiSsidRequired" }
	| { type: "WifiPasswordRequired" };

export const wifiMessages: Record<WifiError["type"], string> = {
	WifiNotConfigured: "Wi-Fi is not configured.",
	WifiSsidRequired: "SSID is required.",
	WifiPasswordRequired: "Password is required.",
};
