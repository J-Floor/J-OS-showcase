// The one place generic code gets an email provider: the injected test fake,
// else the active vendor adapter built from this deployment's configuration.
// A vendor swap changes the import below and nothing else.
import { injectedEmailProvider, type EmailProvider } from "./emailProvider.ts";
import { resendFromEnvironment } from "./resendEmail.ts";

export function emailProvider(): EmailProvider | undefined {
	return injectedEmailProvider() ?? resendFromEnvironment();
}
