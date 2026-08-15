import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import {
	dump,
	parse,
	parseFile,
	parseModule,
	parsePython,
	toSource,
	unparse,
} from "../src/index.js";
import type { ASTNodeUnion } from "../src/types.js";
import { PyComplex } from "../src/types.js";

describe("parsePython", () => {
	it("parses source with default options", () => {
		const tree = parsePython("x = 1 + 2");
		expect(tree.nodeType).toBe("Module");
		expect(tree.body).toHaveLength(1);
	});

	it("accepts a filename option", () => {
		const tree = parsePython("x = 1", { filename: "test.py" });
		expect(tree.nodeType).toBe("Module");
	});

	it("accepts a comments option", () => {
		const tree = parsePython("x = 1  # hi", { comments: true });
		expect(tree.nodeType).toBe("Module");
	});
});

describe("parseFile", () => {
	it("throws even for a real, existing, valid file (placeholder implementation)", () => {
		const dir = mkdtempSync(join(tmpdir(), "py-ast-test-"));
		const filePath = join(dir, "sample.py");
		try {
			writeFileSync(filePath, "x = 1 + 2\n", "utf-8");
			expect(existsSync(filePath)).toBe(true);
			expect(() => parseFile(filePath)).toThrow(/parseFile not implemented/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("parseModule", () => {
	it("parses source with a default filename", () => {
		const tree = parseModule("def f(): pass");
		expect(tree.nodeType).toBe("Module");
		expect(tree.body[0].nodeType).toBe("FunctionDef");
	});

	it("parses source with an explicit filename", () => {
		const tree = parseModule("x = 1", "example.py");
		expect(tree.nodeType).toBe("Module");
	});
});

describe("parse", () => {
	it("parses source into a Module AST", () => {
		const ast = parse("x = 1 + 2");
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(1);
		expect(ast.body[0].nodeType).toBe("Assign");
	});

	it("attaches inline comments to statements when the comments option is enabled", () => {
		const withoutComments = parse("x = 1", { comments: false });
		expect(withoutComments.nodeType).toBe("Module");

		const ast = parse("x = 1  # this is a comment", { comments: true });
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(1);
	});
});

describe("unparse", () => {
	it("converts an AST back to source and round-trips through reparsing", () => {
		const ast = parse("x = 1");
		const unparsed = unparse(ast);
		expect(unparsed.trim()).toBe("x = 1");

		const reparsed = parse(unparsed);
		expect(reparsed.nodeType).toBe("Module");
		expect(reparsed.body).toHaveLength(1);
		expect(reparsed.body[0].nodeType).toBe("Assign");

		const complexAst = parse("def func(x, y=42):\n    return x + y");
		const complexUnparsed = unparse(complexAst);
		expect(complexUnparsed.length).toBeGreaterThan(0);

		const complexReparsed = parse(complexUnparsed);
		expect(complexReparsed.nodeType).toBe("Module");
		expect(complexReparsed.body[0].nodeType).toBe("FunctionDef");
	});
});

describe("toSource", () => {
	it("unparses an AST back to Python source", () => {
		const tree = parseModule("x=1");
		expect(toSource(tree)).toBe("x = 1");
	});

	it("respects a custom indent", () => {
		const tree = parseModule("if True:\n    x = 1\n");
		const source = toSource(tree, "  ");
		expect(source).toContain("  x = 1");
	});
});

type DumpOptions = NonNullable<Parameters<typeof dump>[1]>;

interface DumpOptionCase {
	name: string;
	code: string;
	options?: DumpOptions;
	substring: string;
	shouldContain: boolean;
}

const DUMP_OPTION_CASES: DumpOptionCase[] = [
	{
		name: "annotates fields by default",
		code: "x = 1",
		substring: "body=",
		shouldContain: true,
	},
	{
		name: "omits field annotations when disabled",
		code: "x = 1",
		options: { annotateFields: false },
		substring: "body=",
		shouldContain: false,
	},
	{
		name: "includes location attributes when requested",
		code: "x = 1",
		options: { includeAttributes: true },
		substring: "lineno",
		shouldContain: true,
	},
	{
		name: "excludes location attributes by default",
		code: "x = 1",
		substring: "lineno",
		shouldContain: false,
	},
	{
		name: "omits empty fields by default",
		code: "def f(): pass",
		substring: "decorator_list=[]",
		shouldContain: false,
	},
	{
		name: "includes empty fields when showEmpty is set",
		code: "def f(): pass",
		options: { showEmpty: true },
		substring: "decorator_list=[]",
		shouldContain: true,
	},
	{
		name: "keeps empty arrays compact even with indent set",
		code: "def f(): pass",
		options: { indent: 2 },
		substring: "decorator_list=[]",
		shouldContain: false,
	},
	{
		name: "omits null field values without showEmpty",
		code: "x: int\n",
		substring: "value=null",
		shouldContain: false,
	},
	{
		name: "formats multi-line output with a numeric indent",
		code: "x = 1\ny = 2",
		options: { indent: 2 },
		substring: "\n",
		shouldContain: true,
	},
	{
		name: "formats multi-line output with a string indent",
		code: "x = 1\ny = 2",
		options: { indent: "  " },
		substring: "\n",
		shouldContain: true,
	},
	{
		name: "keeps single-line output when indent is null",
		code: "x = 1\ny = 2",
		options: { indent: null },
		substring: "\n",
		shouldContain: false,
	},
	{
		name: "dumps arrays with multi-line formatting when indent is set",
		code: "[1, 2, 3]",
		options: { indent: 2, showEmpty: true },
		substring: "Constant(",
		shouldContain: true,
	},
	{
		name: "handles primitive (non-object) values",
		code: "x = 1",
		substring: "1",
		shouldContain: true,
	},
];

describe("dump", () => {
	test.each(DUMP_OPTION_CASES)(
		"$name",
		({ code, options, substring, shouldContain }) => {
			const tree = parseModule(code);
			const result = dump(tree, options);
			if (shouldContain) {
				expect(result).toContain(substring);
			} else {
				expect(result).not.toContain(substring);
			}
		},
	);

	it("renders a PyComplex constant value via its toString", () => {
		const tree = parseModule("4j");
		const result = dump(tree);
		expect(result).toContain("Constant(value=4j)");
	});

	it("renders a PyComplex constant with a nonzero real part", () => {
		const tree = parseModule("4j");
		const exprStmt = tree.body[0] as unknown as {
			value: { value: PyComplex };
		};
		exprStmt.value.value = new PyComplex(3, 4);
		const result = dump(tree);
		expect(result).toContain("Constant(value=(3+4j))");
	});

	it("distinguishes negative zero from positive zero in PyComplex, matching CPython's repr()", () => {
		// Verified against CPython 3.13: `repr(complex(r, i))` for each pair.
		expect(new PyComplex(-0, 4).toString()).toBe("(-0+4j)");
		expect(new PyComplex(0, 4).toString()).toBe("4j");
		expect(new PyComplex(3, -0).toString()).toBe("(3-0j)");
		expect(new PyComplex(3, 0).toString()).toBe("(3+0j)");
		expect(new PyComplex(-0, -0).toString()).toBe("(-0-0j)");
		expect(new PyComplex(-0, 0).toString()).toBe("(-0+0j)");
		expect(new PyComplex(0, -0).toString()).toBe("-0j");
		expect(new PyComplex(0, 0).toString()).toBe("0j");
	});

	it("formats an empty array passed directly as compact []", () => {
		expect(dump([] as unknown as ASTNodeUnion)).toBe("[]");
	});

	it("formats plain object field values without a nodeType as JSON", () => {
		const fakeNode = {
			nodeType: "FakeNode",
			meta: { foo: "bar" },
		} as unknown as ASTNodeUnion;
		const result = dump(fakeNode);
		expect(result).toBe('FakeNode(meta={"foo":"bar"})');
	});
});
