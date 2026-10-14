#!/usr/bin/env node
/**
 * Fetches the pinned real-world repositories listed in `repos.json` into
 * `scripts/corpus/.cache/<name>` for use as a corpus by `run.mjs` and
 * `roundtrip.mjs` (via their `--repos` flag).
 *
 * Each repo is a shallow (`--depth 1`), blobless, sparse clone that checks
 * out only `*.py` files, so even very large projects (pytorch, transformers,
 * home-assistant) cost a fraction of a full clone. A `.corpus-ref` marker in
 * each checkout records the ref it was fetched at; re-running is a no-op for
 * repos already at their pinned ref and re-fetches the ones whose ref moved.
 *
 * Usage:
 *   node scripts/corpus/fetch.mjs [options]
 *
 * Options:
 *   --only a,b,c     Only fetch the named repos (default: all).
 *   --head           Fetch each repo's default branch tip instead of its
 *                    pinned `ref` (unreleased code, not reproducible).
 *   --bump           Don't fetch; rewrite `repos.json` so every `ref` is the
 *                    newest tag on the remote matching its `tagPattern`.
 *   --jobs N         Concurrent clones (default: 4).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = path.join(__dirname, "repos.json");
export const CACHE_DIR = path.join(__dirname, ".cache");
const MARKER = ".corpus-ref";

function parseArgs(argv) {
	const opts = { only: null, head: false, bump: false, jobs: 4 };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--only") opts.only = new Set(argv[++i].split(","));
		else if (arg === "--head") opts.head = true;
		else if (arg === "--bump") opts.bump = true;
		else if (arg === "--jobs") opts.jobs = Number(argv[++i]);
		else throw new Error(`unknown argument: ${arg}`);
	}
	return opts;
}

/** Runs `git` with `args`, resolving to stdout; rejects with stderr on a non-zero exit. */
function git(args) {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => {
			out += d;
		});
		child.stderr.on("data", (d) => {
			err += d;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(out);
			else reject(new Error(`git ${args.join(" ")} failed (${code}): ${err.trim()}`));
		});
	});
}

/** Reads and returns the `repos` array from `repos.json`. */
export async function loadManifest() {
	return JSON.parse(await readFile(MANIFEST_PATH, "utf8")).repos;
}

/**
 * Orders two tag names by their embedded numeric components, so `v2.10.0`
 * sorts after `v2.9.3` and `rel_2_1_10` after `rel_2_1_9`.
 */
function compareVersions(a, b) {
	const na = (a.match(/\d+/g) ?? []).map(Number);
	const nb = (b.match(/\d+/g) ?? []).map(Number);
	for (let i = 0; i < Math.max(na.length, nb.length); i++) {
		const diff = (na[i] ?? -1) - (nb[i] ?? -1);
		if (diff !== 0) return diff;
	}
	return 0;
}

async function latestTag(repo) {
	const out = await git(["ls-remote", "--tags", "--refs", repo.url]);
	const pattern = new RegExp(repo.tagPattern);
	const tags = out
		.split("\n")
		.map((line) => line.split("\t")[1]?.replace("refs/tags/", ""))
		.filter((tag) => tag && pattern.test(tag));
	tags.sort(compareVersions);
	return tags.at(-1) ?? null;
}

async function fetchRepo(repo, head) {
	const dir = path.join(CACHE_DIR, repo.name);
	const wanted = head ? "HEAD" : repo.ref;
	const markerPath = path.join(dir, MARKER);
	if (!head && existsSync(markerPath) && (await readFile(markerPath, "utf8")).trim() === wanted) {
		return `${repo.name}: already at ${wanted}`;
	}
	await rm(dir, { recursive: true, force: true });
	const branchArgs = head ? [] : ["--branch", repo.ref];
	await git([
		"clone",
		"--quiet",
		"--depth",
		"1",
		"--single-branch",
		"--filter=blob:none",
		"--no-checkout",
		...branchArgs,
		repo.url,
		dir,
	]);
	await git(["-C", dir, "sparse-checkout", "set", "--no-cone", "*.py"]);
	await git(["-C", dir, "checkout", "--quiet"]);
	await writeFile(markerPath, `${wanted}\n`);
	return `${repo.name}: fetched ${wanted}`;
}

/** Runs `task` over `items` with at most `limit` in flight, logging each result or failure as it lands. */
async function pool(items, limit, task) {
	const queue = [...items];
	let failures = 0;
	async function worker() {
		while (queue.length > 0) {
			const item = queue.shift();
			try {
				console.log(await task(item));
			} catch (err) {
				failures++;
				console.error(`${item.name}: ${err.message ?? err}`);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
	return failures;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const repos = await loadManifest();
	const selected = opts.only ? repos.filter((r) => opts.only.has(r.name)) : repos;
	if (opts.only) {
		const known = new Set(repos.map((r) => r.name));
		const unknown = [...opts.only].filter((n) => !known.has(n));
		if (unknown.length > 0) throw new Error(`unknown repo(s): ${unknown.join(", ")}`);
	}

	if (opts.bump) {
		const failures = await pool(selected, opts.jobs, async (repo) => {
			const tag = await latestTag(repo);
			if (!tag) throw new Error(`no tag matches ${repo.tagPattern}`);
			const old = repo.ref;
			repo.ref = tag;
			return old === tag ? `${repo.name}: ${tag} (unchanged)` : `${repo.name}: ${old} -> ${tag}`;
		});
		const { $comment } = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
		const rows = repos.map((r) => `\t\t${JSON.stringify(r).replace(/^\{/, "{ ").replace(/\}$/, " }").replaceAll('","', '", "').replaceAll('":"', '": "')}`);
		await writeFile(MANIFEST_PATH, `{\n\t"$comment": ${JSON.stringify($comment)},\n\t"repos": [\n${rows.join(",\n")}\n\t]\n}\n`);
		console.log(`\nUpdated ${MANIFEST_PATH}`);
		process.exit(failures > 0 ? 1 : 0);
	}

	const failures = await pool(selected, opts.jobs, (repo) => fetchRepo(repo, opts.head));
	console.log(`\nCorpus cache: ${CACHE_DIR}`);
	process.exit(failures > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
