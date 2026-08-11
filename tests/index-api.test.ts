import { describe, expect, it } from "vitest";
import { dump, parseModule, parsePython, toSource } from "../src/index.js";
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

describe("dump", () => {
	it("dumps a node with annotated fields by default", () => {
		const tree = parseModule("x = 1");
		const result = dump(tree);
		expect(result).toContain("Module(");
		expect(result).toContain("body=");
	});

	it("dumps without field annotations", () => {
		const tree = parseModule("x = 1");
		const result = dump(tree, { annotateFields: false });
		expect(result).not.toContain("body=");
		expect(result).toContain("Module(");
	});

	it("includes location attributes when requested", () => {
		const tree = parseModule("x = 1");
		const result = dump(tree, { includeAttributes: true });
		expect(result).toContain("lineno");
	});

	it("excludes location attributes by default", () => {
		const tree = parseModule("x = 1");
		const result = dump(tree);
		expect(result).not.toContain("lineno");
	});

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

	it("formats multi-line output with a numeric indent", () => {
		const tree = parseModule("x = 1\ny = 2");
		const result = dump(tree, { indent: 2 });
		expect(result).toContain("\n");
	});

	it("formats multi-line output with a string indent", () => {
		const tree = parseModule("x = 1\ny = 2");
		const result = dump(tree, { indent: "  " });
		expect(result).toContain("\n");
	});

	it("keeps single-line output when indent is null", () => {
		const tree = parseModule("x = 1\ny = 2");
		const result = dump(tree, { indent: null });
		expect(result).not.toContain("\n");
	});

	it("omits empty fields by default", () => {
		const tree = parseModule("def f(): pass");
		const result = dump(tree);
		expect(result).not.toContain("decorator_list=[]");
	});

	it("includes empty fields when showEmpty is set", () => {
		const tree = parseModule("def f(): pass");
		const result = dump(tree, { showEmpty: true });
		expect(result).toContain("decorator_list=[]");
	});

	it("dumps arrays with multi-line formatting when indent is set", () => {
		const tree = parseModule("[1, 2, 3]");
		const result = dump(tree, { indent: 2, showEmpty: true });
		expect(result).toContain("Constant(");
	});

	it("dumps empty arrays compactly even with indent set", () => {
		const tree = parseModule("def f(): pass");
		const result = dump(tree, { indent: 2 });
		expect(result).not.toContain("decorator_list=[]");
	});

	it("handles primitive (non-object) values", () => {
		const tree = parseModule("x = 1");
		const result = dump(tree);
		expect(result).toContain("1");
	});

	it("handles null field values without showEmpty", () => {
		const tree = parseModule("x: int\n");
		const result = dump(tree);
		expect(result).not.toContain("value=null");
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
