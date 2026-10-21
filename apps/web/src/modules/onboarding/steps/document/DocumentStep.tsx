import { Button, SignaturePad } from "@j-os/design-system";
import { useAction } from "convex-solidjs";
import { Result } from "neverthrow";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { api } from "../../../../../convex/_generated/api";
import { call } from "../../../../lib/call.ts";
import { createActionError } from "../../../../shared/createActionError.ts";
import { InlineError } from "../../../../shared/InlineError.tsx";
import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./DocumentStep.module.scss";

const PREVIEW_FAILED =
	"Couldn't prepare your personalised copy, so the blank agreement is shown instead.";

const decodePdf = Result.fromThrowable(
	(b64: string) =>
		Uint8Array.from(atob(b64), (character) => character.charCodeAt(0)),
	() => PREVIEW_FAILED
);

/** The agreement PDF for this person: the filled-but-unsigned preview once
 *  it is generated (on mount), the blank template until then or if
 *  generation failed. */
function createAgreementPdf(props: OnboardingStepProps) {
	const preview = useAction(api.agreements.previewAgreement);
	// Blob URL of the filled-but-unsigned preview, generated once on mount.
	const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
	const [previewError, setPreviewError] = createSignal<string | null>(null);

	function variant() {
		return props.person.tier === "guest" ? "guest" : "member";
	}
	function templateUrl() {
		return `/agreements/${variant()}.pdf`;
	}
	// Prefer the filled preview; fall back to the blank template until it's ready
	// (or if generation failed).
	function docUrl() {
		return previewUrl() ?? templateUrl();
	}

	onMount(() => {
		void (async () => {
			const result = await call(preview.mutateAsync({}), PREVIEW_FAILED);
			if (result.isErr()) {
				// Leave previewUrl null — docUrl() falls back to the blank template.
				setPreviewError(result.error.message);
				return;
			}
			const b64 = result.value;
			if (!b64) return;
			const decoded = decodePdf(b64);
			if (decoded.isErr()) {
				setPreviewError(decoded.error);
				return;
			}
			setPreviewUrl(
				URL.createObjectURL(
					new Blob([decoded.value], { type: "application/pdf" })
				)
			);
		})();
	});
	onCleanup(() => {
		const url = previewUrl();
		if (url) URL.revokeObjectURL(url);
	});

	function downloadPdf() {
		const link = document.createElement("a");
		link.href = docUrl();
		link.download = "J floor agreement.pdf";
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	return { docUrl, downloadPdf, previewError };
}

/** The signer's details, read-only, as stamped onto the agreement. */
function SignerDetails(props: { person: OnboardingStepProps["person"] }) {
	return (
		<dl class={styles.fields}>
			<dt>Name</dt>
			<dd>
				{props.person.firstName} {props.person.lastName}
			</dd>
			<dt>Company</dt>
			<dd>{props.person.venture?.name}</dd>
			<dt>Email</dt>
			<dd>{props.person.email}</dd>
		</dl>
	);
}

/**
 * Onboarding step A: read + sign the J floor agreement. Shows an unsigned
 * preview PDF (the signer's details + today's date stamped onto the template,
 * via `previewAgreement`), pre-fills read-only signer details, captures a drawn
 * signature, and submits to `signAgreement` — which generates the countersigned
 * PDF, stores it, emails it, and marks this step complete.
 */
export function DocumentStep(props: OnboardingStepProps) {
	const sign = useAction(api.agreements.signAgreement);
	const [sig, setSig] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const { error, trackResult } = createActionError();
	// Inline embed is hidden by default: <object>/inline PDF is unreliable on
	// iOS Safari / Android Chrome (and the embed is bulky), so we gate it behind
	// "View inline" and make "Download PDF" — which works everywhere — primary.
	const [showPdf, setShowPdf] = createSignal(false);
	const { docUrl, downloadPdf, previewError } = createAgreementPdf(props);
	function canSign() {
		return Boolean(sig()) && !busy();
	}

	async function submit() {
		const png = sig();
		if (!png) return;
		setBusy(true);
		const result = await trackResult(
			call(
				sign.mutateAsync({ signaturePng: png }),
				"Couldn't submit your signature — please try again."
			)
		);
		// On success signAgreement has marked the document step complete
		// server-side; the wizard advances reactively off the person query.
		if (result.isOk()) return;
		setBusy(false);
	}

	return (
		<div class={styles.wrap}>
			<p>
				Read the J floor agreement and privacy policy, then sign to
				accept both.
			</p>
			<div class={styles.pdfActions}>
				<Button
					variant="secondary"
					onClick={() => {
						setShowPdf((isShown) => !isShown);
					}}
				>
					{showPdf() ? "Hide inline" : "Read inline"}
				</Button>
				<Button variant="primary" onClick={downloadPdf}>
					Download PDF
				</Button>
			</div>
			<InlineError message={previewError()} />
			<Button
				variant="tertiary"
				onClick={() => {
					window.open("/privacy", "_blank", "noopener");
				}}
			>
				Read privacy policy
			</Button>
			<Show when={showPdf()}>
				{/* eslint-disable-next-line sonarjs/object-alt-content -- the Download PDF button beside it is the fallback; the embed is only an inline preview */}
				<object
					class={styles.doc}
					data={docUrl()}
					type="application/pdf"
					aria-label="J floor agreement"
				/>
			</Show>
			<SignerDetails person={props.person} />
			<SignaturePad label="Your signature" onChange={setSig} />
			<InlineError message={error()} />
			<StepActions>
				<Button
					disabled={!canSign()}
					disabledReason="Add your signature first"
					onClick={() => void submit()}
				>
					Sign &amp; continue
				</Button>
			</StepActions>
		</div>
	);
}
