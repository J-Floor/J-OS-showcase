// The one place generic code gets a web analytics provider: the injected test
// fake, else the active vendor adapter built from this deployment's env. A
// vendor swap changes the import below and nothing else.
import { webAnalyticsFromEnvironment } from "./cloudflareWebAnalytics.ts";
import {
	injectedWebAnalyticsProvider,
	type WebAnalyticsProvider,
} from "./webAnalytics.ts";

export function webAnalyticsProvider(): WebAnalyticsProvider | undefined {
	return injectedWebAnalyticsProvider() ?? webAnalyticsFromEnvironment();
}

export function webAnalyticsConfigured(): boolean {
	return webAnalyticsProvider() !== undefined;
}
