/**
 * Whether `buildPack` may delete the pack blob it just stored after a failure.
 * A thrown `setPack` may still have committed (the reply may be what was lost):
 * then the blob is the live pack and must stay. When even the check fails, keep
 * it: an orphan is harmless, a TV pointing at a deleted pack is not.
 */
export async function shouldDeleteNewPack(
	isLive: () => Promise<boolean>
): Promise<boolean> {
	try {
		return !(await isLive());
	} catch {
		return false;
	}
}
