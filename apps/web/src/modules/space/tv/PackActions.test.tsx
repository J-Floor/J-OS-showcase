// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { useQuery } from "convex-solidjs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../../convex/_generated/api";
import { ConfirmProvider } from "../../../shared/confirm.tsx";

import { PackActions } from "./PackActions.tsx";

// `convex-solidjs` is stubbed: queries answer from signals the test sets by
// function name, mutations and actions record their (name, args). `api`
// references are proxies that are not `===`-stable, so everything routes by
// function name.
const convexMock = vi.hoisted(() => ({
	set: vi.fn<(name: string, value: unknown) => void>(),
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(() =>
		Promise.resolve(null)
	),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	const { createSignal } = await import("solid-js");
	const signals = new Map<string, ReturnType<typeof createSignal<unknown>>>();
	function signalFor(name: string) {
		const existing = signals.get(name);
		if (existing) return existing;
		const created = createSignal<unknown>(undefined);
		signals.set(name, created);
		return created;
	}
	convexMock.set.mockImplementation((name, value) => {
		signalFor(name)[1](() => value);
	});
	function runner(reference: Parameters<typeof getFunctionName>[0]) {
		return {
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		};
	}
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: runner,
		useAction: runner,
	};
});

const UPLOAD_URL = "https://upload.example.com/one-shot";
const fetchMock = vi.fn();

function packState(overrides: object = {}) {
	return {
		xml: "",
		version: 4,
		packVersion: 4,
		packUrl: "https://files.example.com/pack",
		isAwaitingMigration: false,
		...overrides,
	};
}

beforeEach(() => {
	convexMock.mutate.mockReset();
	convexMock.mutate.mockImplementation((name) =>
		Promise.resolve(
			name === "tv:generateUploadUrl" ? UPLOAD_URL : { ok: true }
		)
	);
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ storageId: "storage-1" }),
	});
	vi.stubGlobal("fetch", fetchMock);
	convexMock.set("tvContent:getPackState", packState());
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** TvTab reads the pack state once and hands it down; this does the same. */
function Harness() {
	const state = useQuery(api.tvContent.getPackState, {});
	return <PackActions state={state.data} />;
}

/** Under the shared confirmation dialog, which the app mounts once. */
function renderAsked() {
	render(() => (
		<ConfirmProvider>
			<Harness />
		</ConfirmProvider>
	));
}

function choose(file: File) {
	fireEvent.change(screen.getByLabelText("Pack file"), {
		target: { files: [file] },
	});
}

function refuseImport(problems: string[]) {
	convexMock.mutate.mockImplementation((name) =>
		Promise.resolve(
			name === "tv:generateUploadUrl"
				? UPLOAD_URL
				: { ok: false, problems }
		)
	);
}

test("uploads the zip, then imports it", async () => {
	render(() => <Harness />);
	const zip = new File(["PK"], "show.zip", { type: "application/zip" });
	choose(zip);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tvPack:importPack", {
			storageId: "storage-1",
		});
	});
	expect(fetchMock).toHaveBeenCalledWith(UPLOAD_URL, {
		method: "POST",
		headers: { "Content-Type": "application/zip" },
		body: zip,
	});
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"tv:discardUpload",
		expect.anything()
	);
});

test("sends a zip the browser gave no type as application/zip", async () => {
	render(() => <Harness />);
	choose(new File(["PK"], "show.zip", { type: "" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tvPack:importPack", {
			storageId: "storage-1",
		});
	});
	const [, init] = fetchMock.mock.calls[0] as [
		string,
		{ headers: Record<string, string>; body: File },
	];
	expect(init.headers["Content-Type"]).toBe("application/zip");
	expect(init.body.type).toBe("application/zip");
	expect(init.body.name).toBe("show.zip");
});

test("keeps application/x-zip-compressed as the browser reported it", async () => {
	render(() => <Harness />);
	choose(
		new File(["PK"], "show.zip", { type: "application/x-zip-compressed" })
	);
	await waitFor(() => {
		expect(fetchMock).toHaveBeenCalled();
	});
	const [, init] = fetchMock.mock.calls[0] as [
		string,
		{ headers: Record<string, string> },
	];
	expect(init.headers["Content-Type"]).toBe("application/x-zip-compressed");
});

test("lists the pack's problems and discards the upload", async () => {
	refuseImport(["../x.png is not an allowed path or file type."]);
	render(() => <Harness />);
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	expect(
		await screen.findByText("../x.png is not an allowed path or file type.")
	).toBeInTheDocument();
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:discardUpload", {
			fileId: "storage-1",
		});
	});
});

test("a failed import call discards the upload and says so", async () => {
	convexMock.mutate.mockImplementation((name) =>
		name === "tv:generateUploadUrl"
			? Promise.resolve(UPLOAD_URL)
			: Promise.reject(new Error("boom"))
	);
	render(() => <Harness />);
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not use that pack. Try again."
	);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:discardUpload", {
			fileId: "storage-1",
		});
	});
});

test("refuses an oversize zip before uploading", () => {
	render(() => <Harness />);
	const big = new File(["PK"], "big.zip", { type: "application/zip" });
	Object.defineProperty(big, "size", { value: 41_943_041 });
	choose(big);
	expect(
		screen.getByText("A pack can be at most 40 MB.")
	).toBeInTheDocument();
	expect(fetchMock).not.toHaveBeenCalled();
	expect(convexMock.mutate).not.toHaveBeenCalled();
});

test("refuses a file that is not a zip before uploading", () => {
	render(() => <Harness />);
	choose(new File(["x"], "show.txt", { type: "text/plain" }));
	expect(screen.getByText("Choose a .zip file.")).toBeInTheDocument();
	expect(fetchMock).not.toHaveBeenCalled();
});

test("downloads the built pack: a link to the saved file is clicked", async () => {
	fetchMock.mockResolvedValue({
		ok: true,
		blob: () => Promise.resolve(new Blob(["PK"])),
	});
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: vi.fn(() => "blob:pack"),
			revokeObjectURL: vi.fn(),
		})
	);
	const click = vi
		.spyOn(HTMLAnchorElement.prototype, "click")
		.mockImplementation(vi.fn());
	render(() => <Harness />);
	fireEvent.click(screen.getByRole("button", { name: "Download pack" }));
	await waitFor(() => {
		expect(click).toHaveBeenCalledTimes(1);
	});
	expect(fetchMock).toHaveBeenCalledWith("https://files.example.com/pack");
	const anchor = click.mock.contexts[0] as HTMLAnchorElement;
	expect(anchor.download).toBe("jfloor-tv-pack.zip");
	expect(anchor.href).toBe("blob:pack");
	click.mockRestore();
});

test("when the page cannot read the file the plain link downloads it", async () => {
	fetchMock.mockRejectedValue(new TypeError("blocked by CORS"));
	const click = vi
		.spyOn(HTMLAnchorElement.prototype, "click")
		.mockImplementation(vi.fn());
	render(() => <Harness />);
	fireEvent.click(screen.getByRole("button", { name: "Download pack" }));
	await waitFor(() => {
		expect(click).toHaveBeenCalledTimes(1);
	});
	const anchor = click.mock.contexts[0] as HTMLAnchorElement;
	expect(anchor.href).toBe("https://files.example.com/pack");
	expect(anchor.download).toBe("jfloor-tv-pack.zip");
	expect(screen.queryByRole("alert")).toBeNull();
	click.mockRestore();
});

test("a pack behind the config can still be downloaded, with a note", () => {
	convexMock.set(
		"tvContent:getPackState",
		packState({ version: 5, packVersion: 4 })
	);
	render(() => <Harness />);
	expect(screen.getByRole("button", { name: "Download pack" })).toBeEnabled();
	expect(screen.getByText(/last pack built/)).toBeInTheDocument();
});

test("a current pack has no note", () => {
	render(() => <Harness />);
	expect(screen.queryByText(/last pack built/)).toBeNull();
});

test("download is off when no pack is built yet", () => {
	convexMock.set(
		"tvContent:getPackState",
		packState({ packUrl: null, packVersion: null })
	);
	render(() => <Harness />);
	expect(
		screen.getByRole("button", { name: "Download pack" })
	).toBeDisabled();
	expect(screen.queryByText(/last pack built/)).toBeNull();
});

test("download is off while the pack state is loading", () => {
	convexMock.set("tvContent:getPackState", undefined);
	render(() => <Harness />);
	expect(
		screen.getByRole("button", { name: "Download pack" })
	).toBeDisabled();
});

test("the pack is only uploaded once the replacement is confirmed", async () => {
	renderAsked();
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	expect(
		await screen.findByText("Replace the TV's slides with show.zip?")
	).toBeInTheDocument();
	expect(fetchMock).not.toHaveBeenCalled();
	fireEvent.click(await screen.findByRole("button", { name: "Replace" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tvPack:importPack", {
			storageId: "storage-1",
		});
	});
});

test("cancelling the replacement uploads nothing", async () => {
	renderAsked();
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
	});
	expect(fetchMock).not.toHaveBeenCalled();
	expect(convexMock.mutate).not.toHaveBeenCalled();
	expect(
		screen.getByRole("button", { name: "Upload pack (.zip)" })
	).toBeEnabled();
});

test("a pack that went in says so", async () => {
	render(() => <Harness />);
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Pack uploaded."
	);
});

test("a failed pack upload says pack, not image", async () => {
	fetchMock.mockRejectedValue(new TypeError("offline"));
	render(() => <Harness />);
	choose(new File(["PK"], "show.zip", { type: "application/zip" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not upload the pack. Try again."
	);
	expect(screen.queryByRole("status")).toBeNull();
});

test("while the legacy slides are being moved upload is off", () => {
	convexMock.set(
		"tvContent:getPackState",
		packState({ isAwaitingMigration: true })
	);
	render(() => <Harness />);
	expect(
		screen.getByRole("button", { name: "Upload pack (.zip)" })
	).toBeDisabled();
});
