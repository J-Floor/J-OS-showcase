import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { blockStorage } from "../test/blockedStorage.ts";

import { STORAGE_UNAVAILABLE, readStored, writeStored } from "./storage.ts";

describe("readStored / writeStored", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stores the raw string, unchanged", () => {
		expect(writeStored("local", "k", "1").isOk()).toBe(true);
		expect(localStorage.getItem("k")).toBe("1");
		expect(readStored("local", "k")._unsafeUnwrap()).toBe("1");
	});

	it("keeps the session store apart from the local one", () => {
		writeStored("session", "k", "tab");
		expect(sessionStorage.getItem("k")).toBe("tab");
		expect(localStorage.getItem("k")).toBeNull();
		expect(readStored("session", "k")._unsafeUnwrap()).toBe("tab");
	});

	it("reads an unset key as Ok(null)", () => {
		expect(readStored("local", "missing")._unsafeUnwrap()).toBeNull();
	});

	it("reads Err when touching the store throws", () => {
		const restore = blockStorage("sessionStorage");
		try {
			expect(readStored("session", "k")._unsafeUnwrapErr()).toBe(
				STORAGE_UNAVAILABLE
			);
			expect(readStored("local", "k").isOk()).toBe(true);
		} finally {
			restore();
		}
	});

	it("writes Err, without throwing, when touching the store throws", () => {
		const restore = blockStorage();
		try {
			expect(writeStored("local", "k", "dark")._unsafeUnwrapErr()).toBe(
				STORAGE_UNAVAILABLE
			);
		} finally {
			restore();
		}
	});

	it("writes Err, without throwing, when the store is full", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		expect(writeStored("local", "k", "dark").isErr()).toBe(true);
	});
});
