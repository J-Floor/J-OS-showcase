// The one place generic code gets a door provider. It picks the active lock
// adapter's entry points and exposes them under neutral names, and it
// resolves test injection: a vendor swap changes the module below and nothing
// else. Only that adapter reads its configuration off `process.env`.
import { ok, type Result } from "neverthrow";

import { injectedDoorProvider, type DoorProvider } from "./doorProvider.ts";
import type { DoorError } from "./errors/door.ts";
import {
	doorProviderConfigured as adapterConfigured,
	doorProviderFromEnvironment,
	doorWritesEnabled,
} from "./nukiClient.ts";

export { doorWritesEnabled };

/** The door provider to use: the injected test fake when one is set,
 *  otherwise the real one built from this deployment's configuration.
 *  `requireWrites` as for `doorProviderFromEnvironment`. */
export function doorProvider(options: {
	requireWrites: boolean;
}): Result<DoorProvider, DoorError> {
	const injected = injectedDoorProvider();
	return injected ? ok(injected) : doorProviderFromEnvironment(options);
}

/** Whether a door provider is available: a test fake is always treated as
 *  configured, otherwise the adapter's credentials and lock ids must be set. */
export function doorProviderConfigured(): boolean {
	return injectedDoorProvider() !== undefined || adapterConfigured();
}
