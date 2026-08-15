#!/usr/bin/env node
/**
 * Unparser round-trip corpus test: for each file, `parse` it, `unparse` the
 * result, `parse` that output again, and diff the two ASTs (ignoring
 * position/cosmetic fields). A mismatch means the unparser produced source
 * that doesn't mean the same thing as the original — the same corpus used
 * by `run.mjs`, but exercising `unparser.ts` instead of (or in addition to)
 * `parser.ts`.
 *
 * `visitor.ts` gets incidental exercise here too, since both `parse` and
 * `unparse` walk the whole tree; a visitor-specific bug wouldn't generally
 * show up as a diff here unless it also broke traversal outright (which
 * would surface as a thrown error, not a silent mismatch).
 *
 * Usage:
 *   npm run build
 *   node scripts/corpus/roundtrip.mjs [options] [dir ...]
 *
 * Options: same as `run.mjs` (--limit, --max-diffs, --report, --stdlib-only,
 * --quiet), minus anything CPython-specific.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffRoundtrip, stripExtensions } from "./compare.mjs";
import { collectPyFiles, defaultCorpusDirs } from "./discover.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
	const opts = {
		limit: Infinity,
		maxDiffs: 5,
		report: path.join(__dirname, "roundtrip-report.json"),
		stdlibOnly: false,
		quiet: false,
		dirs: [],
	};
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

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	const distPath = path.join(REPO_ROOT, "dist", "index.esm.js");
	if (!existsSync(distPath)) {
		console.error("dist/index.esm.js not found — run `npm run build` first.");
		process.exit(1);
	}
	const { parse, unparse, PyComplex } = await import(distPath);

	const corpusDirs = opts.dirs.length > 0 ? opts.dirs : await defaultCorpusDirs(opts.stdlibOnly);
	console.log("Corpus directories:");
	for (const d of corpusDirs) console.log(`  ${d}`);

	let files = (await Promise.all(corpusDirs.map(collectPyFiles))).flat();
	files = [...new Set(files)];
	if (files.length > opts.limit) files = files.slice(0, opts.limit);
	console.log(`\nFound ${files.length} .py files. Round-tripping through the unparser...`);

	const summary = {
		total: files.length,
		matched: 0,
		mismatch: 0,
		parseError: 0,
		unparseError: 0,
		reparseError: 0,
	};
	const report = [];

	for (const file of files) {
		let source;
		let original;
		try {
			source = await readFile(file, "utf8");
			original = parse(source, { filename: file });
		} catch (err) {
			// Not py-ast's fault for this tool's purposes if it can't even
			// parse the original — run.mjs already tracks parse failures.
			summary.parseError++;
			continue;
		}

		let regenerated;
		try {
			regenerated = unparse(original);
		} catch (err) {
			summary.unparseError++;
			report.push({ file, category: "unparse-error", error: String(err.message ?? err) });
			if (!opts.quiet) console.log(`❌ [unparse error] ${file}\n   ${err.message ?? err}`);
			continue;
		}

		let reparsed;
		try {
			reparsed = parse(regenerated, { filename: file });
		} catch (err) {
			summary.reparseError++;
			report.push({
				file,
				category: "reparse-error",
				error: String(err.message ?? err),
				unparsedSnippet: regenerated.slice(0, 500),
			});
			if (!opts.quiet) console.log(`❌ [reparse error] ${file}\n   ${err.message ?? err}`);
			continue;
		}

		const diffs = [];
		diffRoundtrip(
			stripExtensions(original),
			stripExtensions(reparsed),
			PyComplex,
			"$",
			diffs,
			opts.maxDiffs,
		);
		if (diffs.length === 0) {
			summary.matched++;
			continue;
		}

		summary.mismatch++;
		report.push({ file, category: "roundtrip-mismatch", diffs });
		if (!opts.quiet) {
			console.log(`⚠️  [roundtrip mismatch] ${file}`);
			for (const d of diffs) console.log(`   ${d.path}: ${d.message}`);
		}
	}

	await writeFile(opts.report, JSON.stringify(report, null, 2));

	console.log("\n=== Summary ===");
	console.log(`Total files:              ${summary.total}`);
	console.log(`Matched:                  ${summary.matched}`);
	console.log(`Round-trip mismatches:    ${summary.mismatch}`);
	console.log(`Unparse errors:           ${summary.unparseError}`);
	console.log(`Reparse errors:           ${summary.reparseError}`);
	console.log(`(Original parse errors:   ${summary.parseError}, skipped — see run.mjs)`);
	console.log(`\nFull report written to ${opts.report}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
