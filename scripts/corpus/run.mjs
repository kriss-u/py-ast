#!/usr/bin/env node
/**
 * Differential corpus test: parses real-world Python files with both
 * CPython's `ast` module and py-ast, and reports where their ASTs diverge.
 *
 * Usage:
 *   npm run build                     # py-ast is imported from dist/
 *   node scripts/corpus/run.mjs [options] [dir ...]
 *
 * Options:
 *   --limit N        Only process the first N files found (default: all).
 *   --max-diffs N     Max diffs recorded per file (default: 5).
 *   --report PATH     Where to write the full JSON report (default:
 *                      scripts/corpus/report.json).
 *   --stdlib-only      Only use the CPython stdlib as the corpus.
 *   --quiet            Only print the summary, not per-file failures.
 *
 * With no directories given, the corpus defaults to the local CPython
 * stdlib plus whichever of a curated list of popular third-party packages
 * (requests, jinja2, pydantic, flask, numpy, click, ...) are importable in
 * the active Python environment. This makes the corpus "free" (no network
 * access) and reproducible per-machine, per the intent in CLAUDE.md of
 * validating against real-world code starting with CPython itself.
 */

import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffTrees, stripCpythonNoise, stripExtensions } from "./compare.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

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

function parseArgs(argv) {
	const opts = { limit: Infinity, maxDiffs: 5, report: path.join(__dirname, "report.json"), stdlibOnly: false, quiet: false, dirs: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--limit") opts.limit = Number(argv[++i]);
		else if (arg === "--max-diffs") opts.maxDiffs = Number(argv[++i]);
		else if (arg === "--report") opts.report = path.resolve(argv[++i]);
		else if (arg === "--stdlib-only") opts.stdlibOnly = true;
		else if (arg === "--quiet") opts.quiet = true;
		else opts.dirs.push(path.resolve(argv[i]));
	}
	return opts;
}

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

async function defaultCorpusDirs(stdlibOnly) {
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

async function collectPyFiles(dir) {
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

/**
 * Spawns a single long-lived `dump_ast.py` process for `files` and returns
 * an async iterable yielding one parsed result object per line, in order.
 * Results are consumed one at a time by the caller rather than buffered
 * into an array up front — a full corpus (tens of thousands of files,
 * some from packages like numpy with large modules) holding every CPython
 * AST dump in memory simultaneously runs the Node heap out of memory.
 */
async function* dumpWithPython(files) {
	const child = spawn("python3", [path.join(__dirname, "dump_ast.py")]);
	let stderr = "";
	child.stderr.on("data", (d) => {
		stderr += d;
	});
	child.stdin.write(files.join("\n") + "\n");
	child.stdin.end();

	const rl = createInterface({ input: child.stdout });
	let exitCode = null;
	child.on("close", (code) => {
		exitCode = code;
	});

	let count = 0;
	for await (const line of rl) {
		if (!line.trim()) continue;
		count++;
		yield JSON.parse(line);
	}
	if (exitCode !== 0 && count < files.length) {
		throw new Error(`dump_ast.py exited with ${exitCode}: ${stderr}`);
	}
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	const distPath = path.join(REPO_ROOT, "dist", "index.esm.js");
	if (!existsSync(distPath)) {
		console.error("dist/index.esm.js not found — run `npm run build` first.");
		process.exit(1);
	}
	const { parse, PyComplex } = await import(distPath);

	const corpusDirs = opts.dirs.length > 0 ? opts.dirs : await defaultCorpusDirs(opts.stdlibOnly);
	console.log("Corpus directories:");
	for (const d of corpusDirs) console.log(`  ${d}`);

	let files = (await Promise.all(corpusDirs.map(collectPyFiles))).flat();
	files = [...new Set(files)];
	if (files.length > opts.limit) files = files.slice(0, opts.limit);
	console.log(`\nFound ${files.length} .py files. Dumping CPython ASTs...`);

	const { readFile } = await import("node:fs/promises");

	const summary = {
		total: files.length,
		matched: 0,
		valueMismatch: 0,
		structureMismatch: 0,
		cpythonSyntaxError: 0,
		pyAstParseError: 0,
	};
	const report = [];

	let i = -1;
	for await (const cpy of dumpWithPython(files)) {
		i++;
		const file = files[i];
		if (cpy.file !== file) {
			throw new Error(`out-of-order result for ${file} (got ${cpy.file})`);
		}
		if (!cpy.ok) {
			summary.cpythonSyntaxError++;
			continue;
		}

		let pyastTree;
		try {
			const source = await readFile(file, "utf8");
			pyastTree = stripExtensions(parse(source, { filename: file }));
		} catch (err) {
			summary.pyAstParseError++;
			report.push({ file, category: "py-ast-parse-error", error: String(err.message ?? err) });
			if (!opts.quiet) console.log(`❌ [py-ast error] ${file}\n   ${err.message ?? err}`);
			continue;
		}

		const diffs = [];
		diffTrees(stripCpythonNoise(cpy.ast), pyastTree, PyComplex, "$", diffs, opts.maxDiffs);
		if (diffs.length === 0) {
			summary.matched++;
			continue;
		}

		const isValueOnly = diffs.every((d) => d.path.endsWith(".value"));
		if (isValueOnly) summary.valueMismatch++;
		else summary.structureMismatch++;

		report.push({ file, category: isValueOnly ? "value-mismatch" : "structure-mismatch", diffs });
		if (!opts.quiet) {
			console.log(`⚠️  [${isValueOnly ? "value" : "structure"} mismatch] ${file}`);
			for (const d of diffs) console.log(`   ${d.path}: ${d.message}`);
		}
	}

	await writeFile(opts.report, JSON.stringify(report, null, 2));

	console.log("\n=== Summary ===");
	console.log(`Total files:              ${summary.total}`);
	console.log(`Matched:                  ${summary.matched}`);
	console.log(`Value mismatches:         ${summary.valueMismatch}`);
	console.log(`Structure mismatches:     ${summary.structureMismatch}`);
	console.log(`CPython syntax errors:    ${summary.cpythonSyntaxError} (skipped, not py-ast's fault)`);
	console.log(`py-ast parse errors:      ${summary.pyAstParseError}`);
	console.log(`\nFull report written to ${opts.report}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
