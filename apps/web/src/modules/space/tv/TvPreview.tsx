import { Dialog } from "@j-os/design-system";
import { createPlayer, type Player } from "@j-os/tv-player";
import "@j-os/tv-player/player.css";
import { createEffect, on, onCleanup, onMount, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { useQuery } from "../../../shared/data/useQuery.ts";

import styles from "./TvPreview.module.scss";

/** The 16:9 stage the player draws into. It mounts with the dialog's content
 *  (built for each opening), so the player lives exactly as long as the
 *  preview is open. All slide content, HTML included, is drawn by the
 *  player's sandboxed frames; nothing of it is put in the page's own DOM. */
function PreviewStage(): JSX.Element {
	const preview = useQuery(api.tv.previewSlides, {});
	let stage: HTMLDivElement | undefined;
	let player: Player | undefined;

	onMount(() => {
		if (!stage) return;
		const current = preview.data();
		player = createPlayer(stage, {
			slides: current?.slides ?? [],
			transition: current?.transition ?? "fade",
		});
	});
	onCleanup(() => {
		player?.destroy();
		player = undefined;
	});

	// The player is told about every change, so an edit made elsewhere shows
	// without reopening.
	createEffect(
		on(
			() => preview.data(),
			(data) => {
				if (!data) return;
				player?.setSlides(data.slides);
				player?.setTransition(data.transition);
			},
			{ defer: true }
		)
	);

	return (
		<div class={styles.frame}>
			<div ref={stage} class={styles.stage} />
		</div>
	);
}

/** A full-screen preview of what the TV shows now. Escape closes it. */
export function TvPreview(props: {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
}): JSX.Element {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content flush classOverride={{ contentClass: styles.card }}>
				<Dialog.Header>
					<Dialog.Title>TV preview</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<PreviewStage />
				</Dialog.Body>
			</Dialog.Content>
		</Dialog.Root>
	);
}
