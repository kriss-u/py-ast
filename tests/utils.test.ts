import { describe, expect, it, test } from "vitest";
import type {
	Arguments,
	BinOp,
	ClassDef,
	Constant,
	FunctionDef,
	Module,
	Name,
	Operator,
} from "../src/types.js";
import {
	ast,
	getDocstring,
	getSourceSegment,
	isASTNode,
	iterChildNodes,
	iterFields,
} from "../src/utils.js";
import { parseCode } from "./test-helpers.js";

describe("getDocstring", () => {
	it("returns the docstring of a module", () => {
		const tree = parseCode('"""module doc"""\nx = 1\n');
		expect(getDocstring(tree)).toBe("module doc");
	});

	it("returns the docstring of a function", () => {
		const tree = parseCode('def f():\n    """func doc"""\n    pass\n');
		const fn = tree.body[0];
		expect(getDocstring(fn)).toBe("func doc");
	});

	it("returns the docstring of an async function", () => {
		const tree = parseCode('async def f():\n    """async doc"""\n    pass\n');
		const fn = tree.body[0];
		expect(getDocstring(fn)).toBe("async doc");
	});

	it("returns the docstring of a class", () => {
		const tree = parseCode('class C:\n    """class doc"""\n    pass\n');
		const cls = tree.body[0];
		expect(getDocstring(cls)).toBe("class doc");
	});

	it("returns null for node types without docstrings", () => {
		const tree = parseCode("x = 1\n");
		const assign = tree.body[0];
		expect(getDocstring(assign)).toBeNull();
	});

	it("returns null when body is empty", () => {
		const tree = parseCode("class C: ...\n");
		const cls = tree.body[0] as ClassDef;
		cls.body = [];
		expect(getDocstring(cls)).toBeNull();
	});

	it("returns null when the first statement isn't an expression", () => {
		const tree = parseCode("def f():\n    x = 1\n");
		const fn = tree.body[0];
		expect(getDocstring(fn)).toBeNull();
	});

	it("returns null when the first expression isn't a string constant", () => {
		const tree = parseCode("def f():\n    1\n");
		const fn = tree.body[0];
		expect(getDocstring(fn)).toBeNull();
	});

	it("returns null when the first expression is a non-string constant-like call", () => {
		const tree = parseCode("def f():\n    x\n");
		const fn = tree.body[0];
		expect(getDocstring(fn)).toBeNull();
	});

	it("returns null when a docstring-eligible node has no body property at all", () => {
		const node = {
			nodeType: "Module",
			lineno: 1,
			col_offset: 0,
		} as unknown as Module;
		expect(getDocstring(node)).toBeNull();
	});
});

describe("iterFields", () => {
	it("yields fields excluding nodeType and location info", () => {
		const tree = parseCode("x = 1\n");
		const assign = tree.body[0];
		const fields = Array.from(iterFields(assign));
		const keys = fields.map(([k]) => k);
		expect(keys).not.toContain("nodeType");
		expect(keys).not.toContain("lineno");
		expect(keys).not.toContain("col_offset");
		expect(keys).not.toContain("end_lineno");
		expect(keys).not.toContain("end_col_offset");
		expect(keys).toContain("targets");
		expect(keys).toContain("value");
	});
});

describe("iterChildNodes", () => {
	it("yields direct child AST nodes from arrays and object fields", () => {
		const tree = parseCode("x = 1 + 2\n");
		const assign = tree.body[0];
		const children = Array.from(iterChildNodes(assign));
		const types = children.map((c) => c.nodeType);
		expect(types).toContain("Name");
		expect(types).toContain("BinOp");
	});

	it("skips non-node values", () => {
		const tree = parseCode("x = 1\n");
		const assign = tree.body[0];
		const children = Array.from(iterChildNodes(assign));
		expect(children.every((c) => isASTNode(c))).toBe(true);
	});

	it("skips non-node items inside array fields", () => {
		const tree = parseCode("def f():\n    global x, y\n");
		const fn = tree.body[0] as FunctionDef;
		const globalStmt = fn.body[0];
		expect(globalStmt.nodeType).toBe("Global");
		const children = Array.from(iterChildNodes(globalStmt));
		expect(children).toEqual([]);
	});

	it("skips non-node scalar fields", () => {
		const constant = {
			nodeType: "Constant",
			value: 42,
			kind: undefined,
		} as unknown as Constant;
		const children = Array.from(iterChildNodes(constant));
		expect(children).toEqual([]);
	});
});

describe("isASTNode", () => {
	it("returns true for objects with a nodeType property", () => {
		expect(isASTNode({ nodeType: "Name" })).toBe(true);
	});

	it("returns falsy for null", () => {
		expect(isASTNode(null)).toBeFalsy();
	});

	it("returns falsy for undefined", () => {
		expect(isASTNode(undefined)).toBeFalsy();
	});

	it("returns false for primitives", () => {
		expect(isASTNode(42)).toBe(false);
		expect(isASTNode("str")).toBe(false);
		expect(isASTNode(true)).toBe(false);
	});

	it("returns false for plain objects without nodeType", () => {
		expect(isASTNode({ foo: "bar" })).toBe(false);
	});
});

describe("getSourceSegment", () => {
	it("extracts a single-line segment", () => {
		const source = "x = 1 + 2\n";
		const node = {
			nodeType: "BinOp",
			lineno: 1,
			col_offset: 4,
			end_lineno: 1,
			end_col_offset: 9,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node);
		expect(segment).toBe("1 + 2");
	});

	it("extracts a multi-line segment", () => {
		const source = "x = (\n    1 +\n    2\n)\n";
		const node = {
			nodeType: "BinOp",
			lineno: 2,
			col_offset: 4,
			end_lineno: 3,
			end_col_offset: 5,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node);
		expect(segment).toBe("1 +\n    2");
	});

	it("includes untouched middle lines in a multi-line segment", () => {
		const source = "x = (\n    1 +\n    2 +\n    3\n)\n";
		const node = {
			nodeType: "BinOp",
			lineno: 2,
			col_offset: 4,
			end_lineno: 4,
			end_col_offset: 5,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node);
		expect(segment).toBe("1 +\n    2 +\n    3");
	});

	it("pads the first line when padded option is set", () => {
		const source = "x = (\n    1 +\n    2\n)\n";
		const node = {
			nodeType: "BinOp",
			lineno: 2,
			col_offset: 4,
			end_lineno: 3,
			end_col_offset: 5,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node, { padded: true });
		expect(segment?.split("\n")[0]).toBe("    1 +");
	});

	it("skips missing lines within a multi-line segment's middle and end", () => {
		const source = "a\nb\n";
		const node = {
			nodeType: "BinOp",
			lineno: 1,
			col_offset: 0,
			end_lineno: 10,
			end_col_offset: 1,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node);
		expect(segment).toBe("a\nb\n");
	});

	it("omits the first line of a multi-line segment when its start line doesn't exist", () => {
		const source = "a\nb\n";
		const node = {
			nodeType: "BinOp",
			lineno: 20,
			col_offset: 0,
			end_lineno: 21,
			end_col_offset: 1,
		} as unknown as BinOp;
		const segment = getSourceSegment(source, node);
		expect(segment).toBe("");
	});

	it("returns null when location info is missing", () => {
		const node = { nodeType: "Name", id: "x" } as unknown as Name;
		expect(getSourceSegment("x = 1\n", node)).toBeNull();
	});

	it("returns null when lineno is undefined", () => {
		const node = {
			nodeType: "Name",
			id: "x",
			lineno: undefined,
			col_offset: 0,
			end_lineno: 1,
			end_col_offset: 1,
		} as unknown as Name;
		expect(getSourceSegment("x = 1\n", node)).toBeNull();
	});

	it("returns null when the referenced line doesn't exist", () => {
		const node = {
			nodeType: "Name",
			id: "x",
			lineno: 99,
			col_offset: 0,
			end_lineno: 99,
			end_col_offset: 1,
		} as unknown as Name;
		expect(getSourceSegment("x = 1\n", node)).toBeNull();
	});
});

interface AstFactoryCase {
	name: string;
	run: () => void;
}

const AST_FACTORY_CASES: AstFactoryCase[] = [
	{
		name: "Name",
		run: () => {
			const node = ast.Name("x");
			expect(node.nodeType).toBe("Name");
			expect(node.id).toBe("x");
			expect(node.ctx.nodeType).toBe("Load");
			expect(node.lineno).toBe(1);
			expect(node.col_offset).toBe(0);
		},
	},
	{
		name: "Name (explicit context)",
		run: () => {
			const node = ast.Name("x", "Store");
			expect(node.ctx.nodeType).toBe("Store");
		},
	},
	{
		name: "Constant",
		run: () => {
			const node = ast.Constant(42);
			expect(node.nodeType).toBe("Constant");
			expect(node.value).toBe(42);
			expect(node.kind).toBeUndefined();
		},
	},
	{
		name: "Constant (with kind)",
		run: () => {
			const node = ast.Constant("hi", "u");
			expect(node.kind).toBe("u");
		},
	},
	{
		name: "Call (defaults)",
		run: () => {
			const node = ast.Call(ast.Name("print"));
			expect(node.nodeType).toBe("Call");
			expect(node.args).toEqual([]);
			expect(node.keywords).toEqual([]);
		},
	},
	{
		name: "Call (args and keywords)",
		run: () => {
			const node = ast.Call(ast.Name("print"), [ast.Constant("hi")], []);
			expect(node.args).toHaveLength(1);
		},
	},
	{
		name: "BinOp (operator node)",
		run: () => {
			const node = ast.BinOp(
				ast.Constant(1),
				{ nodeType: "Add" } as Operator,
				ast.Constant(2),
			);
			expect(node.op.nodeType).toBe("Add");
		},
	},
	{
		name: "BinOp (string operator shorthand)",
		run: () => {
			const node = ast.BinOp(ast.Constant(1), "Add", ast.Constant(2));
			expect(node.op.nodeType).toBe("Add");
		},
	},
	{
		name: "Assign",
		run: () => {
			const node = ast.Assign([ast.Name("x", "Store")], ast.Constant(1));
			expect(node.nodeType).toBe("Assign");
			expect(node.type_comment).toBeUndefined();
		},
	},
	{
		name: "Assign (with type comment)",
		run: () => {
			const node = ast.Assign([ast.Name("x", "Store")], ast.Constant(1), "int");
			expect(node.type_comment).toBe("int");
		},
	},
	{
		name: "Expr",
		run: () => {
			const node = ast.Expr(ast.Constant(1));
			expect(node.nodeType).toBe("Expr");
		},
	},
	{
		name: "List",
		run: () => {
			const node = ast.List([ast.Constant(1)]);
			expect(node.nodeType).toBe("List");
			expect(node.ctx.nodeType).toBe("Load");
		},
	},
	{
		name: "Tuple",
		run: () => {
			const node = ast.Tuple([ast.Constant(1)], "Store");
			expect(node.nodeType).toBe("Tuple");
			expect(node.ctx.nodeType).toBe("Store");
		},
	},
	{
		name: "Attribute",
		run: () => {
			const node = ast.Attribute(ast.Name("obj"), "attr");
			expect(node.nodeType).toBe("Attribute");
			expect(node.attr).toBe("attr");
		},
	},
	{
		name: "Dict",
		run: () => {
			const node = ast.Dict([ast.Constant("k")], [ast.Constant("v")]);
			expect(node.nodeType).toBe("Dict");
		},
	},
	{
		name: "NamedExpr",
		run: () => {
			const node = ast.NamedExpr(ast.Name("x", "Store"), ast.Constant(1));
			expect(node.nodeType).toBe("NamedExpr");
		},
	},
	{
		name: "Lambda",
		run: () => {
			const emptyArgs = {
				posonlyargs: [],
				args: [],
				vararg: undefined,
				kwonlyargs: [],
				kw_defaults: [],
				kwarg: undefined,
				defaults: [],
			} as unknown as Arguments;
			const node = ast.Lambda(emptyArgs, ast.Constant(1));
			expect(node.nodeType).toBe("Lambda");
		},
	},
	{
		name: "IfExp",
		run: () => {
			const node = ast.IfExp(
				ast.Name("cond"),
				ast.Constant(1),
				ast.Constant(2),
			);
			expect(node.nodeType).toBe("IfExp");
		},
	},
	{
		name: "Await",
		run: () => {
			const node = ast.Await(ast.Name("x"));
			expect(node.nodeType).toBe("Await");
		},
	},
	{
		name: "Yield (no value)",
		run: () => {
			const node = ast.Yield();
			expect(node.nodeType).toBe("Yield");
			expect(node.value).toBeUndefined();
		},
	},
	{
		name: "Yield (with value)",
		run: () => {
			const node = ast.Yield(ast.Constant(1));
			expect(node.value).toBeDefined();
		},
	},
	{
		name: "YieldFrom",
		run: () => {
			const node = ast.YieldFrom(ast.Name("gen"));
			expect(node.nodeType).toBe("YieldFrom");
		},
	},
	{
		name: "Starred",
		run: () => {
			const node = ast.Starred(ast.Name("args"));
			expect(node.nodeType).toBe("Starred");
			expect(node.ctx.nodeType).toBe("Load");
		},
	},
	{
		name: "Slice (all bounds)",
		run: () => {
			const node = ast.Slice(
				ast.Constant(0),
				ast.Constant(10),
				ast.Constant(2),
			);
			expect(node.nodeType).toBe("Slice");
			expect(node.lower).toBeDefined();
			expect(node.upper).toBeDefined();
			expect(node.step).toBeDefined();
		},
	},
	{
		name: "Slice (no bounds)",
		run: () => {
			const node = ast.Slice();
			expect(node.lower).toBeUndefined();
			expect(node.upper).toBeUndefined();
			expect(node.step).toBeUndefined();
		},
	},
	{
		name: "Delete",
		run: () => {
			const node = ast.Delete([ast.Name("x", "Del")]);
			expect(node.nodeType).toBe("Delete");
		},
	},
	{
		name: "Nonlocal",
		run: () => {
			const node = ast.Nonlocal(["x", "y"]);
			expect(node.nodeType).toBe("Nonlocal");
			expect(node.names).toEqual(["x", "y"]);
		},
	},
];

describe("ast factory", () => {
	test.each(AST_FACTORY_CASES)("builds a $name node", ({ run }) => {
		run();
	});
});
