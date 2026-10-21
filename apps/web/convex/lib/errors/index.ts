import { type AgreementsError, agreementsMessages } from "./agreements.ts";
import { type AuthError, authMessages } from "./auth.ts";
import { type DoorError, doorMessages } from "./door.ts";
import { type EventsError, eventsMessages } from "./events.ts";
import { type InputError, inputMessages } from "./input.ts";
import { type InventoryError, inventoryMessages } from "./inventory.ts";
import { type NotifyError, notifyMessages } from "./notify.ts";
import { type OccupancyError, occupancyMessages } from "./occupancy.ts";
import { type PeopleError, peopleMessages } from "./people.ts";
import { type WifiError, wifiMessages } from "./wifi.ts";

export type AppError =
	| AgreementsError
	| AuthError
	| DoorError
	| EventsError
	| InputError
	| InventoryError
	| NotifyError
	| OccupancyError
	| PeopleError
	| WifiError;

const MESSAGES: Record<AppError["type"], string> = {
	...agreementsMessages,
	...authMessages,
	...doorMessages,
	...eventsMessages,
	...inputMessages,
	...inventoryMessages,
	...notifyMessages,
	...occupancyMessages,
	...peopleMessages,
	...wifiMessages,
};

export function messageFor(error: AppError): string {
	return MESSAGES[error.type];
}
