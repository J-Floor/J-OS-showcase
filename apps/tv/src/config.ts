function withoutTrailingSlash(value: string): string {
	let end = value.length;
	while (end > 0 && value[end - 1] === "/") end -= 1;
	return value.slice(0, end);
}

export function apiBase(): string {
	return withoutTrailingSlash(import.meta.env.VITE_TV_API_URL);
}

export function appBase(): string {
	return withoutTrailingSlash(import.meta.env.VITE_TV_APP_URL);
}
