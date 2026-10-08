import { splitProps } from "solid-js";

/** Split consumer-only props from props forwarded to an ark part. */
export function splitArkProps<T extends object, K extends keyof T>(
	props: T,
	ownKeys: readonly K[]
): [Pick<T, K>, Omit<T, K>] {
	return splitProps(props, ownKeys as K[]) as unknown as [
		Pick<T, K>,
		Omit<T, K>,
	];
}
