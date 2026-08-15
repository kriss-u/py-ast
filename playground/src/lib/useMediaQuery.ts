import { useEffect, useState } from "react";

/**
 * Tracks whether a CSS media query currently matches, re-rendering the
 * component on viewport changes (resize, orientation change, devtools
 * device toggling) rather than only reading the query once at mount.
 * @param query A media query string, e.g. `"(max-width: 768px)"`.
 * @returns Whether `query` currently matches.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

	useEffect(() => {
		const mediaQueryList = window.matchMedia(query);
		const handleChange = () => setMatches(mediaQueryList.matches);
		handleChange();
		mediaQueryList.addEventListener("change", handleChange);
		return () => mediaQueryList.removeEventListener("change", handleChange);
	}, [query]);

	return matches;
}
