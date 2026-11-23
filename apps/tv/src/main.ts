import { createPlayer, type Player } from "@j-os/tv-player";

import "@j-os/tv-player/player.css";
import "./app.css";
import { runPairing, type Pairing } from "./pairing.ts";
import { storage } from "./storage.ts";
import { runSync, type Sync } from "./sync.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app is missing");
const app = root;

let pairing: Pairing | undefined;
let sync: Sync | undefined;
let player: Player | undefined;

function stopAll(): void {
	pairing?.stop();
	sync?.stop();
	player?.destroy();
	pairing = sync = player = undefined;
	app.replaceChildren();
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
	sync = runSync({ token, root: app, player, onUnauthorized: startPairing });
}

const stored = storage.getToken();
if (stored) startSync(stored);
else startPairing();
