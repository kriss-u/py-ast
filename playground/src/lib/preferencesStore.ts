import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Theme } from "../components/ThemeToggle";

const DB_NAME = "py-ast-playground";
const DB_VERSION = 1;
const STORE_NAME = "preferences";

/** Source shown on first visit, and restored by "reset to defaults". */
export const SAMPLE_SOURCE = `# Edit this Python source to explore its AST.
from dataclasses import dataclass


@dataclass
class Item:
    name: str
    price: float
    quantity: int


def calculate_subtotal(items: list[Item]) -> float:
    total = 0.0
    for item in items:
        if item.quantity < 0:
            raise ValueError(f"Negative quantity for {item.name}")
        total += item.price * item.quantity
    return total


def apply_discount(subtotal: float, is_member: bool, coupon: str | None = None) -> float:
    discount = 0.0
    if is_member:
        discount += 0.1
    if coupon == "SAVE10":
        discount += 0.1
    elif coupon == "SAVE20":
        discount += 0.2
    return subtotal * (1 - min(discount, 0.5))


def calculate_tax(amount: float, region: str) -> float:
    rates = {"US": 0.07, "EU": 0.20, "UK": 0.20}
    return amount * rates.get(region, 0.0)


class Order:
    """A customer order, ready for checkout."""

    def __init__(self, items: list[Item], region: str = "US"):
        self.items = items
        self.region = region
        self.is_member = False
        self.coupon = None

    def total(self) -> float:
        subtotal = calculate_subtotal(self.items)
        discounted = apply_discount(subtotal, self.is_member, self.coupon)
        tax = calculate_tax(discounted, self.region)
        return discounted + tax

    def summary(self) -> str:
        try:
            total = self.total()
        except ValueError as exc:
            return f"Order invalid: {exc}"
        else:
            return f"Total: {total:.2f} ({len(self.items)} items)"


def checkout(order: Order) -> str:
    for attempt in range(3):
        try:
            return order.summary()
        except Exception:
            continue
    return "Checkout failed"


order = Order([Item("Widget", 9.99, 3), Item("Gadget", 19.99, 1)])
print(checkout(order))
`;

/** Shape of the persisted playground preferences. */
export interface Preferences {
	source: string;
	excludeComments: boolean;
	theme: Theme;
	editorWidthPercent: number;
}

interface PreferencesDBSchema extends DBSchema {
	[STORE_NAME]: {
		key: keyof Preferences;
		value: Preferences[keyof Preferences];
	};
}

/** Computes the default theme from the OS color-scheme preference. */
export function systemTheme(): Theme {
	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Default preferences restored by "reset to defaults" and used before persisted state loads. */
export function defaultPreferences(): Preferences {
	return {
		source: SAMPLE_SOURCE,
		excludeComments: false,
		theme: systemTheme(),
		editorWidthPercent: 50,
	};
}

let dbPromise: Promise<IDBPDatabase<PreferencesDBSchema> | null> | null = null;

/**
 * Opens (and memoizes) the preferences database connection.
 *
 * Returns `null` instead of throwing when IndexedDB is unavailable or fails
 * to open (private-browsing restrictions, disabled storage, older browsers)
 * so callers can fall back to in-memory defaults without breaking the app.
 */
function getDB(): Promise<IDBPDatabase<PreferencesDBSchema> | null> {
	if (typeof indexedDB === "undefined") {
		return Promise.resolve(null);
	}
	if (!dbPromise) {
		dbPromise = openDB<PreferencesDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			},
		}).catch((error) => {
			console.warn("py-ast playground: IndexedDB unavailable, preferences will not persist.", error);
			return null;
		});
	}
	return dbPromise;
}

/**
 * Loads persisted preferences, merged over the defaults.
 *
 * Missing keys (first visit, or a key added in a later release) fall back
 * to their default individually rather than discarding the whole record.
 */
export async function loadPreferences(): Promise<Preferences> {
	const defaults = defaultPreferences();
	const db = await getDB();
	if (!db) {
		return defaults;
	}
	try {
		const entries = await Promise.all(
			(Object.keys(defaults) as (keyof Preferences)[]).map(async (key) => [key, await db.get(STORE_NAME, key)] as const),
		);
		const loaded = { ...defaults };
		for (const [key, value] of entries) {
			if (value !== undefined) {
				(loaded as Record<keyof Preferences, unknown>)[key] = value;
			}
		}
		return loaded;
	} catch (error) {
		console.warn("py-ast playground: failed to load preferences, using defaults.", error);
		return defaults;
	}
}

/** Persists a single preference. Failures are logged, not thrown — a save failure must not break the app. */
export async function savePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
	const db = await getDB();
	if (!db) {
		return;
	}
	try {
		await db.put(STORE_NAME, value, key);
	} catch (error) {
		console.warn(`py-ast playground: failed to save preference "${key}".`, error);
	}
}

/** Clears all persisted preferences so the next load falls back to defaults. */
export async function resetPreferences(): Promise<void> {
	const db = await getDB();
	if (!db) {
		return;
	}
	try {
		await db.clear(STORE_NAME);
	} catch (error) {
		console.warn("py-ast playground: failed to reset preferences.", error);
	}
}
