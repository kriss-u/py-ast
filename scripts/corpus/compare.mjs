/**
 * Normalization and structural diffing between a CPython `ast` dump (as
 * produced by `dump_ast.py`) and a py-ast parse tree, for corpus-based
 * differential testing (see `run.mjs`).
 *
 * py-ast deliberately extends/diverges from CPython's `ast` module in a few
 * documented ways; those are normalized away here rather than reported as
 * mismatches:
 *
 *   - `Comment` statement nodes and `inlineComment`/`comments` fields are a
 *     py-ast extension with no CPython equivalent, so they're stripped.
 *   - `quote_style` is a py-ast-only round-tripping field, stripped.
 *   - `Constant.value` for int vs float is JS-number-space on the py-ast
 *     side (both are just `number`), so int/float are compared loosely
 *     (numeric equality) rather than requiring the CPython type tag to
 *     match.
 *   - `Ellipsis` and `bytes` constants are both represented as plain JS
 *     strings by py-ast (see `Constant.quote_style`/`kind` for how to tell
 *     them apart from a real `str`), so they're decoded back into a
 *     comparable shape before diffing.
 */

// `quote_style` is intentionally NOT stripped here even though it's a
// py-ast-only field: `encodePyAstConstant` reads it off `Constant` nodes to
// tell a bytes/ellipsis literal apart from a real `str`. The generic
// structural diff never compares it directly (Constant nodes are handled
// specially, short-circuiting before generic field iteration), so leaving
// it in the tree doesn't cause spurious mismatches.
const NON_STRUCTURAL_FIELDS = new Set(["inlineComment", "comments"]);

// `type_ignores` is only ever populated when `ast.parse` is called with
// `type_comments=True`; `dump_ast.py` doesn't pass that, so it's always `[]`
// and would otherwise show up as a `[] !== undefined` mismatch (py-ast has
// no field for it at all) on every single Module node in the corpus.
const CPYTHON_ONLY_NOISE_FIELDS = new Set(["type_ignores"]);

/** Strips CPython fields that are always-empty noise given how `dump_ast.py` invokes `ast.parse`. */
export function stripCpythonNoise(node) {
	if (Array.isArray(node)) return node.map(stripCpythonNoise);
	if (node && typeof node === "object" && "nodeType" in node) {
		const out = {};
		for (const [key, value] of Object.entries(node)) {
			if (CPYTHON_ONLY_NOISE_FIELDS.has(key)) continue;
			out[key] = stripCpythonNoise(value);
		}
		return out;
	}
	return node;
}

/** Strips py-ast-only fields and `Comment` statement nodes from a tree so it lines up with CPython's `_fields`. */
export function stripExtensions(node) {
	if (Array.isArray(node)) {
		return node
			.filter((item) => !(item && item.nodeType === "Comment"))
			.map(stripExtensions);
	}
	if (node && typeof node === "object" && "nodeType" in node) {
		const out = {};
		for (const [key, value] of Object.entries(node)) {
			if (NON_STRUCTURAL_FIELDS.has(key)) continue;
			out[key] = stripExtensions(value);
		}
		return out;
	}
	return node;
}

/** Best-effort decoding of a py-ast `Constant` node into the same `{$type, $value}` shape `dump_ast.py` emits. */
export function encodePyAstConstant(constNode, PyComplex) {
	const { value, kind, quote_style: quoteStyle } = constNode;

	if (value === null) return { $type: "NoneType", $value: null };
	if (typeof value === "boolean") return { $type: "bool", $value: value };
	if (value instanceof PyComplex) {
		return { $type: "complex", $value: { real: value.real, imag: value.imag } };
	}
	if (typeof value === "number") {
		if (Number.isNaN(value)) return { $type: "float", $value: "nan" };
		if (value === Infinity) return { $type: "float", $value: "inf" };
		if (value === -Infinity) return { $type: "float", $value: "-inf" };
		// int vs float is not distinguishable from a bare JS number; the
		// comparator special-cases numeric fields to compare loosely.
		return { $type: "number", $value: value };
	}
	if (typeof value === "string") {
		if (value === "..." && kind === undefined && quoteStyle === undefined) {
			return { $type: "ellipsis", $value: null };
		}
		if (quoteStyle && /^[a-zA-Z]*b/i.test(quoteStyle)) {
			return { $type: "bytes", $value: Array.from(Buffer.from(value, "latin1")) };
		}
		return { $type: "str", $value: value };
	}
	return { $type: "unknown", $value: value };
}

/**
 * Deep-compares a CPython constant encoding against a py-ast constant
 * encoding, returning a human-readable mismatch reason or `null` if they're
 * considered equivalent.
 */
function compareConstants(cpy, pyast) {
	const numericTypes = new Set(["int", "float", "number"]);
	if (numericTypes.has(cpy.$type) && numericTypes.has(pyast.$type)) {
		const cpyNum = cpy.$type === "int" ? Number(cpy.$value) : Number(cpy.$value);
		if (cpyNum !== pyast.$value && !(Number.isNaN(cpyNum) && Number.isNaN(pyast.$value))) {
			return `constant value ${cpy.$value} !== ${pyast.$value}`;
		}
		return null;
	}
	if (cpy.$type !== pyast.$type) {
		return `constant type ${cpy.$type} !== ${pyast.$type}`;
	}
	if (cpy.$type === "bytes") {
		const a = cpy.$value;
		const b = pyast.$value;
		if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
			return `bytes constant mismatch (lengths ${a.length} vs ${b.length})`;
		}
		return null;
	}
	if (cpy.$type === "complex") {
		if (cpy.$value.real !== pyast.$value.real || cpy.$value.imag !== pyast.$value.imag) {
			return `complex constant mismatch ${JSON.stringify(cpy.$value)} !== ${JSON.stringify(pyast.$value)}`;
		}
		return null;
	}
	if (cpy.$type === "str") {
		return cpy.$value === pyast.$value
			? null
			: `str constant mismatch ${JSON.stringify(cpy.$value)} !== ${JSON.stringify(pyast.$value)}`;
	}
	return null;
}

/**
 * Recursively diffs a CPython AST dict (from `dump_ast.py`, already run
 * through nothing else) against a py-ast tree (already run through
 * {@link stripExtensions}), collecting up to `maxDiffs` mismatches.
 * @param cpy CPython node/list/leaf.
 * @param pyast py-ast node/list/leaf, extension fields already stripped.
 * @param PyComplex The `PyComplex` class from py-ast, for constant decoding.
 * @param path Human-readable path to the current node, for reporting.
 * @param diffs Accumulator array of `{path, message}` mismatches.
 * @param maxDiffs Stop recursing into new diffs once this many are collected.
 */
export function diffTrees(cpy, pyast, PyComplex, path, diffs, maxDiffs) {
	if (diffs.length >= maxDiffs) return;

	if (cpy && typeof cpy === "object" && "nodeType" in cpy) {
		if (!pyast || typeof pyast !== "object" || !("nodeType" in pyast)) {
			diffs.push({ path, message: `expected node ${cpy.nodeType}, got ${JSON.stringify(pyast)}` });
			return;
		}
		if (cpy.nodeType !== pyast.nodeType) {
			diffs.push({ path, message: `nodeType ${cpy.nodeType} !== ${pyast.nodeType}` });
			return;
		}
		if (cpy.nodeType === "Constant") {
			const pyastEncoded = encodePyAstConstant(pyast, PyComplex);
			const reason = compareConstants(cpy.value, pyastEncoded);
			if (reason) diffs.push({ path: `${path}.value`, message: reason });
			return;
		}
		for (const key of Object.keys(cpy)) {
			if (key === "nodeType") continue;
			diffTrees(cpy[key], pyast[key], PyComplex, `${path}.${key}`, diffs, maxDiffs);
			if (diffs.length >= maxDiffs) return;
		}
		return;
	}

	if (Array.isArray(cpy)) {
		if (!Array.isArray(pyast)) {
			diffs.push({ path, message: `expected array, got ${JSON.stringify(pyast)}` });
			return;
		}
		if (cpy.length !== pyast.length) {
			diffs.push({ path, message: `array length ${cpy.length} !== ${pyast.length}` });
			return;
		}
		for (let i = 0; i < cpy.length; i++) {
			diffTrees(cpy[i], pyast[i], PyComplex, `${path}[${i}]`, diffs, maxDiffs);
			if (diffs.length >= maxDiffs) return;
		}
		return;
	}

	// Leaf field (string/number/bool/null identifier, e.g. Name.id, arg.arg).
	const cpyIsAbsent = cpy === null || cpy === undefined;
	const pyastIsAbsent = pyast === null || pyast === undefined;
	if (cpyIsAbsent || pyastIsAbsent) {
		if (cpyIsAbsent !== pyastIsAbsent) {
			diffs.push({ path, message: `${JSON.stringify(cpy)} !== ${JSON.stringify(pyast)}` });
		}
		return;
	}
	if (cpy !== pyast) {
		diffs.push({ path, message: `${JSON.stringify(cpy)} !== ${JSON.stringify(pyast)}` });
	}
}

// Position fields are expected to differ after a parse -> unparse -> parse
// round-trip (the regenerated source's layout isn't the original's), and
// `quote_style` is a cosmetic round-tripping hint the unparser is free to
// change (e.g. normalizing quote characters).
const ROUNDTRIP_IGNORED_FIELDS = new Set([
	"lineno",
	"col_offset",
	"end_lineno",
	"end_col_offset",
	"quote_style",
]);

/**
 * Recursively diffs two py-ast trees against each other (both already run
 * through {@link stripExtensions}) — used to check that `unparse(parse(src))`
 * round-trips to something that reparses to the same AST as the original,
 * ignoring position/cosmetic fields (see {@link ROUNDTRIP_IGNORED_FIELDS}).
 * Unlike {@link diffTrees}, both sides use the same (py-ast) `Constant.value`
 * representation, so no CPython-side type-tag decoding is needed.
 * @param a First tree (typically the original parse).
 * @param b Second tree (typically the re-parsed, unparsed output).
 * @param PyComplex The `PyComplex` class from py-ast, for constant comparison.
 * @param path Human-readable path to the current node, for reporting.
 * @param diffs Accumulator array of `{path, message}` mismatches.
 * @param maxDiffs Stop recursing into new diffs once this many are collected.
 */
export function diffRoundtrip(a, b, PyComplex, path, diffs, maxDiffs) {
	if (diffs.length >= maxDiffs) return;

	if (a && typeof a === "object" && "nodeType" in a) {
		if (!b || typeof b !== "object" || !("nodeType" in b)) {
			diffs.push({ path, message: `expected node ${a.nodeType}, got ${JSON.stringify(b)}` });
			return;
		}
		if (a.nodeType !== b.nodeType) {
			diffs.push({ path, message: `nodeType ${a.nodeType} !== ${b.nodeType}` });
			return;
		}
		for (const key of Object.keys(a)) {
			if (key === "nodeType" || ROUNDTRIP_IGNORED_FIELDS.has(key)) continue;
			if (key === "value" && a.nodeType === "Constant") {
				const reason = compareRoundtripConstant(a.value, b.value, PyComplex);
				if (reason) diffs.push({ path: `${path}.value`, message: reason });
				continue;
			}
			diffRoundtrip(a[key], b[key], PyComplex, `${path}.${key}`, diffs, maxDiffs);
			if (diffs.length >= maxDiffs) return;
		}
		return;
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			diffs.push({ path, message: `expected array, got ${JSON.stringify(b)}` });
			return;
		}
		if (a.length !== b.length) {
			diffs.push({ path, message: `array length ${a.length} !== ${b.length}` });
			return;
		}
		for (let i = 0; i < a.length; i++) {
			diffRoundtrip(a[i], b[i], PyComplex, `${path}[${i}]`, diffs, maxDiffs);
			if (diffs.length >= maxDiffs) return;
		}
		return;
	}

	const aAbsent = a === null || a === undefined;
	const bAbsent = b === null || b === undefined;
	if (aAbsent || bAbsent) {
		if (aAbsent !== bAbsent) {
			diffs.push({ path, message: `${JSON.stringify(a)} !== ${JSON.stringify(b)}` });
		}
		return;
	}
	if (a !== b) {
		diffs.push({ path, message: `${JSON.stringify(a)} !== ${JSON.stringify(b)}` });
	}
}

function compareRoundtripConstant(a, b, PyComplex) {
	if (a instanceof PyComplex || b instanceof PyComplex) {
		const ar = a instanceof PyComplex ? a.real : a;
		const ai = a instanceof PyComplex ? a.imag : 0;
		const br = b instanceof PyComplex ? b.real : b;
		const bi = b instanceof PyComplex ? b.imag : 0;
		return ar === br && ai === bi
			? null
			: `complex constant mismatch ${JSON.stringify({ ar, ai })} !== ${JSON.stringify({ br, bi })}`;
	}
	if (typeof a === "number" && typeof b === "number") {
		if (Number.isNaN(a) && Number.isNaN(b)) return null;
		return a === b ? null : `constant value ${a} !== ${b}`;
	}
	return a === b ? null : `constant value ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
}
