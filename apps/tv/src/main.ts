import { createPlayer, type Player } from "@j-os/tv-player";

import "@j-os/tv-player/player.css";
import "./app.css";
import { runPairing, type Pairing } from "./pairing.ts";
import { createCoverBackend, OFF_CLASS } from "./power.ts";
import {
	createPowerController,
	type PowerController,
} from "./powerController.ts";
import { storage } from "./storage.ts";
import { runSync, type Sync } from "./sync.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app is missing");
const app = root;

let pairing: Pairing | undefined;
let sync: Sync | undefined;
let player: Player | undefined;
let power: PowerController | undefined;

function stopAll(): void {
	pairing?.stop();
	sync?.stop();
	player?.destroy();
	power?.stop();
	pairing = sync = player = power = undefined;
	// The cover only exists once a schedule is applied; pairing must never be hidden.
	app.classList.remove(OFF_CLASS);
	// Not replaceChildren: it needs Chrome 86, the Tizen 6 TV runs 76.
	app.textContent = "";
}

function startPairing(): void {
	stopAll();
	pairing = runPairing({ root: app, onPaired: startSync });
}

function startSync(token: string): void {
	stopAll();
	const stage = document.createElement("div");
	stage.className = "tvp-stage stage";
	app.append(stage);
	player = createPlayer(stage, { slides: [], transition: "fade" });
	const controller = createPowerController(createCoverBackend(app));
	power = controller;
	sync = runSync({
		token,
		root: app,
		player,
		onUnauthorized: startPairing,
		onSchedule: (value) => {
			controller.setSchedule(value);
		},
		onTick: () => {
			controller.refresh();
		},
	});
}

const stored = storage.getToken();
if (stored) startSync(stored);
else startPairing();
