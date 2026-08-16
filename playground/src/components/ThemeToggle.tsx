import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

export interface ThemeToggleProps {
	theme: Theme;
	onChange: (theme: Theme) => void;
}

/** Button that switches between light and dark mode. */
export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
	const isDark = theme === "dark";
	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={() => onChange(isDark ? "light" : "dark")}
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}
