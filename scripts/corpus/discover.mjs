/**
 * Corpus file discovery, shared by `run.mjs` (differential vs. CPython) and
 * `roundtrip.mjs` (parse -> unparse -> re-parse self-consistency).
 */

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const CURATED_PACKAGES = [
	"requests",
	"jinja2",
	"pydantic",
	"flask",
	"click",
	"numpy",
	"yaml",
	"attr",
	"attrs",
	"urllib3",
	"idna",
	"certifi",
	"charset_normalizer",
	"packaging",
	"pytest",
	"setuptools",
];

function runPython(code) {
	return new Promise((resolve, reject) => {
		const child = spawn("python3", ["-c", code]);
		let out = "";
		child.stdout.on("data", (d) => {
			out += d;
		});
		child.on("error", reject);
		child.on("close", (code_) => {
			if (code_ !== 0) reject(new Error(`python3 exited with ${code_}`));
			else resolve(out.trim());
		});
	});
}

/**
 * The local CPython stdlib directory, plus (unless `stdlibOnly`) whichever
 * of a curated list of popular third-party packages are importable in the
 * active `python3` — see `README.md` for why this makes the corpus "free".
 */
export async function defaultCorpusDirs(stdlibOnly) {
	const dirs = [];
	const stdlib = await runPython("import sysconfig; print(sysconfig.get_path('stdlib'))");
	dirs.push(stdlib);
	if (stdlibOnly) return dirs;

	const findPkg = `
import importlib, os, sys
names = ${JSON.stringify(CURATED_PACKAGES)}
found = []
for name in names:
    try:
        mod = importlib.import_module(name)
    except Exception:
        continue
    p = getattr(mod, "__file__", None)
    if p:
        found.append(os.path.dirname(p))
print("\\n".join(found))
`;
	const out = await runPython(findPkg);
	for (const line of out.split("\n")) {
		if (line.trim()) dirs.push(line.trim());
	}
	return dirs;
}

/** Recursively collects every `.py` file under `dir`, skipping `__pycache__` and dotfiles/dirs. */
export async function collectPyFiles(dir) {
	const files = [];
	async function walk(current) {
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".py")) {
				files.push(full);
			}
		}
	}
	await walk(dir);
	return files;
}
