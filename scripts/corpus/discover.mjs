/**
 * Corpus file discovery, shared by `run.mjs` (differential vs. CPython) and
 * `roundtrip.mjs` (parse -> unparse -> re-parse self-consistency).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, loadManifest } from "./fetch.mjs";

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
	"scipy",
	"pandas",
	"sympy",
	"networkx",
	"matplotlib",
	"tornado",
	"aiohttp",
	"black",
	"cryptography",
	"sqlalchemy",
	"django",
	"fastapi",
	"starlette",
	"boto3",
	"mypy",
	"pygments",
	"docutils",
	"pip",
	"wheel",
	"jsonschema",
	"markupsafe",
	"multidict",
	"yarl",
	"typing_extensions",
	"pluggy",
	"iniconfig",
	"coverage",
	"more_itertools",
	"toolz",
	"cffi",
	"nacl",
];

/**
 * The interpreter used both as the CPython oracle (`dump_ast.py`) and for
 * package discovery: `$CORPUS_PYTHON` (set by `--python`) or `python3`.
 * Newer repos in `repos.json` use syntax an older interpreter rejects, and
 * those files are then skipped as "CPython syntax errors", so pointing this
 * at the newest Python available widens the effective corpus.
 */
export function pythonCommand() {
	return process.env.CORPUS_PYTHON || "python3";
}

function runPython(code) {
	return new Promise((resolve, reject) => {
		const child = spawn(pythonCommand(), ["-c", code]);
		let out = "";
		child.stdout.on("data", (d) => {
			out += d;
		});
		child.on("error", reject);
		child.on("close", (code_) => {
			if (code_ !== 0) reject(new Error(`${pythonCommand()} exited with ${code_}`));
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

/**
 * Checkout directories under `.cache/` for the repos in `repos.json` that
 * `fetch.mjs` has already fetched. `names` restricts to those repos; `null`
 * means all of them. Throws if a requested repo isn't fetched yet, so a
 * typo or a forgotten `npm run corpus:fetch` isn't silently a smaller corpus.
 */
export async function repoCorpusDirs(names) {
	const repos = await loadManifest();
	const selected = names ? repos.filter((r) => names.includes(r.name)) : repos;
	const unknown = names ? names.filter((n) => !repos.some((r) => r.name === n)) : [];
	if (unknown.length > 0) throw new Error(`unknown repo(s) in --repos: ${unknown.join(", ")}`);
	const dirs = selected.map((r) => path.join(CACHE_DIR, r.name));
	const missing = dirs.filter((d) => !existsSync(d));
	if (names && missing.length > 0) {
		throw new Error(`not fetched yet (run \`npm run corpus:fetch\`): ${missing.map((d) => path.basename(d)).join(", ")}`);
	}
	const present = dirs.filter((d) => existsSync(d));
	if (present.length === 0) throw new Error("no repos fetched yet — run `npm run corpus:fetch` first");
	return present;
}

/**
 * Parses the CLI flags shared by `run.mjs` and `roundtrip.mjs`, with
 * `defaultReport` as the `--report` fallback. A `--python` value is exported
 * as `$CORPUS_PYTHON` so every spawn in this process picks it up.
 */
export function parseCorpusArgs(argv, defaultReport) {
	const opts = { limit: Infinity, maxDiffs: 5, report: defaultReport, stdlibOnly: false, quiet: false, repos: undefined, dirs: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--limit") opts.limit = Number(argv[++i]);
		else if (arg === "--max-diffs") opts.maxDiffs = Number(argv[++i]);
		else if (arg === "--report") opts.report = path.resolve(argv[++i]);
		else if (arg === "--stdlib-only") opts.stdlibOnly = true;
		else if (arg === "--quiet") opts.quiet = true;
		else if (arg === "--python") process.env.CORPUS_PYTHON = argv[++i];
		else if (arg === "--repos") opts.repos = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i].split(",") : null;
		else opts.dirs.push(path.resolve(arg));
	}
	return opts;
}

/**
 * Resolves the corpus directories for parsed `opts`: explicit dirs and/or
 * fetched repos when given, otherwise the installed-packages default.
 */
export async function resolveCorpusDirs(opts) {
	if (opts.repos === undefined && opts.dirs.length > 0) return opts.dirs;
	if (opts.repos === undefined) return defaultCorpusDirs(opts.stdlibOnly);
	return [...opts.dirs, ...(await repoCorpusDirs(opts.repos))];
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
