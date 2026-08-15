import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	copyLocation,
	fixMissingLocations,
	incrementLineno,
	literalEval,
	parse,
	parseFile,
} from "../src/parser.js";
import type { ASTNode, ExprNode, Module, StmtNode } from "../src/types.js";
import { PyComplex } from "../src/types.js";
import { unparse } from "../src/unparser.js";
import { parseCode, parseExpression, parseStatement } from "./test-helpers.js";

describe("parser edge cases", () => {
	describe("comment handling at module level", () => {
		test("standalone comment before any statement", () => {
			const ast = parse("# leading\nx = 1\n", { comments: true });
			expect(ast.body.some((s) => s.nodeType === "Comment")).toBe(true);
		});

		test("inline comment attaches to previous statement", () => {
			const ast = parse("x = 1  # trailing\ny = 2\n", { comments: true });
			const first = ast.body.find(
				(s) => s.nodeType === "Assign" && "targets" in s,
			);
			expect(first?.inlineComment?.value).toBe("# trailing");
		});

		test("multiple standalone comments in a row at module level", () => {
			const ast = parse("# one\n# two\nx = 1\n", { comments: true });
			const comments = ast.body.filter((s) => s.nodeType === "Comment");
			expect(comments.length).toBeGreaterThanOrEqual(2);
		});

		test("comment immediately after colon before newline in suite", () => {
			const ast = parse("if True:  # note\n    pass\n", {
				comments: true,
			});
			expect(ast.comments?.length).toBeGreaterThan(0);
		});

		test("comments before INDENT inside a block", () => {
			const code = "if True:\n    # pre-indent comment\n    pass\n";
			const ast = parse(code, { comments: true });
			expect(ast.comments?.length).toBeGreaterThan(0);
		});

		test("comments nested in function/class/if/for/while/with/try/match bodies", () => {
			const code = [
				"def f():",
				"    # comment in function",
				"    pass",
				"",
				"class C:",
				"    # comment in class",
				"    pass",
				"",
				"if True:",
				"    x = 1  # inline in if",
				"else:",
				"    y = 2  # inline in else",
				"",
				"for i in range(3):",
				"    pass  # inline in for",
				"else:",
				"    pass  # inline in for-else",
				"",
				"while True:",
				"    break  # inline in while",
				"else:",
				"    pass  # inline in while-else",
				"",
				"with open('x') as fh:",
				"    pass  # inline in with",
				"",
				"try:",
				"    pass  # inline in try",
				"except Exception:",
				"    pass  # inline in except",
				"else:",
				"    pass  # inline in try-else",
				"finally:",
				"    pass  # inline in finally",
				"",
				"match 1:",
				"    case 1:",
				"        pass  # inline in match case",
				"",
			].join("\n");
			const ast = parse(code, { comments: true });
			expect(ast.comments?.length).toBeGreaterThan(10);
		});

		test("chained assignment collects trailing comment", () => {
			const ast = parse("x = y = 1  # chained\n", { comments: true });
			const stmt = ast.body[0];
			expect(stmt.nodeType).toBe("Assign");
			expect(stmt.inlineComment?.value).toBe("# chained");
		});

		test("standalone comment inside parenthesized assignment value", () => {
			const code = "x = (\n    # note\n    1\n)\n";
			const ast = parse(code, { comments: true });
			const stmt = ast.body[0] as ASTNode & {
				expressionComments?: { value: string }[];
			};
			expect(stmt.nodeType).toBe("Assign");
			expect(stmt.expressionComments?.length).toBe(1);
		});

		test("comment skipped after comma in list literal", () => {
			const ast = parse("x = [1,  # c\n    2]\n", { comments: true });
			expect(ast.comments?.length).toBeGreaterThan(0);
		});

		test("comments inside function parameter list", () => {
			const code = "def f(\n    a,  # first\n    b,\n):\n    pass\n";
			const ast = parse(code, { comments: true });
			expect(ast.comments?.length).toBeGreaterThan(0);
		});

		test("standalone comment on its own line inside parameter list", () => {
			const code = "def f(\n    a,\n    # standalone\n    b,\n):\n    pass\n";
			const ast = parse(code, { comments: true });
			expect(ast.comments?.length).toBeGreaterThan(0);
		});

		test("a second inline comment for a statement that already has one is discarded, at module level", () => {
			// The parenthesized tuple's trailing comma pulls "# internal" into
			// the Assign's own inlineComment while still inside expression
			// parsing; the semicolon then lets a second, genuinely separate
			// "# external" comment surface only once the statement has
			// already returned with inlineComment set.
			const src = "x = (1,  # internal\n)  ;  # external\n";
			const ast = parse(src, { comments: true });
			const assign = ast.body[0] as ASTNode & {
				inlineComment?: { value: string };
			};
			expect(assign.inlineComment?.value).toBe("# internal");
			expect(ast.comments?.some((c) => c.value === "# external")).toBe(false);
		});

		test("a second inline comment for a statement that already has one is discarded, inside a suite", () => {
			const src =
				"if True:\n    x = (1,  # internal\n    )  ;  # external\n    pass\n";
			const ast = parse(src, { comments: true });
			const ifStmt = ast.body[0] as ASTNode & { body: ASTNode[] };
			const assign = ifStmt.body[0] as ASTNode & {
				inlineComment?: { value: string };
			};
			expect(assign.inlineComment?.value).toBe("# internal");
			expect(ast.comments?.some((c) => c.value === "# external")).toBe(false);
		});
	});

	describe("branch coverage: decorators, defs, classes", () => {
		test("decorator followed by async-non-def throws", () => {
			expect(() => parseCode("@deco\nasync x = 1\n")).toThrow(
				/Invalid decorator target/,
			);
		});

		test("decorated async def without a return-type annotation", () => {
			// Only the decorated path routes through parseAsyncFunctionDef;
			// a bare top-level `async def` goes through parseAsyncStmt instead,
			// which delegates to parseFunctionDef.
			const module = parseCode("@deco\nasync def f():\n    pass\n");
			const fn = module.body[0] as ASTNode & { returns?: ASTNode };
			expect(fn.nodeType).toBe("AsyncFunctionDef");
			expect(fn.returns).toBeUndefined();
		});

		test("class with empty parentheses has no bases or keywords", () => {
			const module = parseCode("class Foo():\n    pass\n");
			const cls = module.body[0] as ASTNode & {
				bases: unknown[];
				keywords: unknown[];
			};
			expect(cls.nodeType).toBe("ClassDef");
			expect(cls.bases).toEqual([]);
			expect(cls.keywords).toEqual([]);
		});

		test("comment-only line between a decorator and its target does not throw", () => {
			const module = parseCode(
				"@deco\n# pragma: valid SAT pragma\ndef f():\n    pass\n",
			);
			const fn = module.body[0] as ASTNode & { lineno: number };
			expect(fn.nodeType).toBe("FunctionDef");
			expect(fn.lineno).toBe(3);
		});

		test("blank line between a decorator and its target does not throw", () => {
			const module = parseCode("@deco\n\ndef f():\n    pass\n");
			const fn = module.body[0] as ASTNode & { lineno: number };
			expect(fn.nodeType).toBe("FunctionDef");
			expect(fn.lineno).toBe(3);
		});

		test("multiple comment-only lines between stacked decorators do not throw", () => {
			const module = parseCode(
				"@deco1\n# note one\n# note two\n@deco2\n\nclass C:\n    pass\n",
			);
			const cls = module.body[0] as ASTNode & {
				decorator_list: unknown[];
				lineno: number;
			};
			expect(cls.nodeType).toBe("ClassDef");
			expect(cls.decorator_list).toHaveLength(2);
			expect(cls.lineno).toBe(6);
		});
	});

	describe("branch coverage: tuple/exprlist/subscript edge shapes", () => {
		test("assignment RHS testlist with three or more elements keeps building past the first comma", () => {
			// A plain `a, b, c` expression statement is parsed by the
			// separate parseTestListWithStar; assigning to a testlist RHS
			// (parseTestList) is the only way to exercise this loop.
			const module = parseCode("x = 1, 2, 3\n");
			const assign = module.body[0] as ASTNode & {
				value: ASTNode & { elts: ASTNode[] };
			};
			expect(assign.value.nodeType).toBe("Tuple");
			expect(assign.value.elts).toHaveLength(3);
		});

		test("assignment RHS testlist starting at column 0 (via line continuation) uses its own col_offset", () => {
			const module = parseCode("x = \\\n1, 2, 3\n");
			const assign = module.body[0] as ASTNode & { value: ASTNode };
			expect(assign.value.col_offset).toBe(0);
		});

		test("for-loop target with a trailing comma immediately before 'in'", () => {
			const module = parseCode("for x, in seq:\n    pass\n");
			const forStmt = module.body[0] as ASTNode & {
				target: ASTNode & { elts: ASTNode[] };
			};
			expect(forStmt.target.nodeType).toBe("Tuple");
			expect(forStmt.target.elts).toHaveLength(1);
		});

		test("comprehension target spanning a line continuation starts at column 0", () => {
			const module = parseCode("data = [x for\na, b in pairs]\n");
			const assign = module.body[0] as ASTNode & {
				value: ASTNode & {
					generators: { target: ASTNode }[];
				};
			};
			const target = assign.value.generators[0].target;
			expect(target.nodeType).toBe("Tuple");
			expect(target.col_offset).toBe(0);
		});

		test("subscript list with a trailing comma immediately before ']'", () => {
			const module = parseCode("x[1,]\n");
			const expr = module.body[0] as ASTNode & {
				value: ASTNode & { slice: ASTNode & { elts: ASTNode[] } };
			};
			expect(expr.value.slice.nodeType).toBe("Tuple");
			expect(expr.value.slice.elts).toHaveLength(1);
		});

		test("subscript list spanning a line continuation starts at column 0", () => {
			const module = parseCode("x[\n0,\n1]\n");
			const expr = module.body[0] as ASTNode & {
				value: ASTNode & { slice: ASTNode };
			};
			expect(expr.value.slice.col_offset).toBe(0);
		});

		test("slice with a lower bound and an explicit empty step (trailing colon before ']')", () => {
			const module = parseCode("x[1:2:]\n");
			const expr = module.body[0] as ASTNode & {
				value: ASTNode & { slice: ASTNode & { step?: ASTNode } };
			};
			expect(expr.value.slice.nodeType).toBe("Slice");
			expect(expr.value.slice.step).toBeUndefined();
		});

		test("slice with a lower bound spanning a line continuation starts at column 0", () => {
			const module = parseCode("x[\n0:1]\n");
			const expr = module.body[0] as ASTNode & {
				value: ASTNode & { slice: ASTNode };
			};
			expect(expr.value.slice.col_offset).toBe(0);
		});
	});

	describe("branch coverage: suite with an empty single-line body", () => {
		test("a compound-statement keyword right after ':' yields an empty suite body", () => {
			const module = parseCode("if True: class Foo: pass\n");
			const ifStmt = module.body[0] as ASTNode & { body: ASTNode[] };
			expect(ifStmt.body).toEqual([]);
			expect(module.body[1]?.nodeType).toBe("ClassDef");
		});
	});

	describe("syntax error branches", () => {
		test("unexpected indent at statement position throws", () => {
			expect(() => parseCode("    x = 1\n")).toThrow(/unexpected indent/);
		});

		test("two small statements on one line without separator", () => {
			expect(() => parseCode("pass pass\n")).toThrow(/invalid syntax/);
		});

		test("class with trailing comma in base list", () => {
			const stmt = parseStatement("class Foo(Base1, Base2,):\n    pass\n");
			expect(stmt.nodeType).toBe("ClassDef");
		});

		test("class with non-name base class expression", () => {
			const stmt = parseStatement("class Foo(get_base()):\n    pass\n");
			expect(stmt.nodeType).toBe("ClassDef");
		});

		test("class with parenthesized (non-name-start) base class expression", () => {
			const stmt = parseStatement("class Foo((Base)):\n    pass\n");
			expect(stmt.nodeType).toBe("ClassDef");
		});

		test("class with keyword and positional bases mixed", () => {
			const stmt = parseStatement(
				"class Foo(Base1, metaclass=Meta):\n    pass\n",
			);
			expect(stmt.nodeType).toBe("ClassDef");
		});

		test("mixing except and except* on the same try raises", () => {
			expect(() =>
				parseCode(
					"try:\n    pass\nexcept ValueError:\n    pass\nexcept* TypeError:\n    pass\n",
				),
			).toThrow(/cannot have both/);
		});

		test("mixing except* then except raises", () => {
			expect(() =>
				parseCode(
					"try:\n    pass\nexcept* ValueError:\n    pass\nexcept TypeError:\n    pass\n",
				),
			).toThrow(/cannot have both/);
		});

		test("except* without a bound name", () => {
			const stmt = parseStatement(
				"try:\n    pass\nexcept* ValueError:\n    pass\n",
			);
			expect(stmt.nodeType).toBe("TryStar");
		});

		test("bare except* (no type)", () => {
			const stmt = parseStatement("try:\n    pass\nexcept*:\n    pass\n");
			expect(stmt.nodeType).toBe("TryStar");
		});

		test("async not followed by def/for/with throws", () => {
			expect(() => parseCode("async x = 1\n")).toThrow(
				/Invalid async statement/,
			);
		});

		test("match statement missing case throws", () => {
			expect(() => parseCode("match x:\n    y = 1\n")).toThrow(
				/Expected 'case'/,
			);
		});

		test("cannot assign to a lambda", () => {
			expect(() => parseCode("(lambda: 1) = 2\n")).toThrow(/cannot assign to/);
		});

		test("cannot assign to a literal", () => {
			expect(() => parseCode("1 = x\n")).toThrow(/cannot assign to literal/);
		});

		test("cannot assign to a call expression", () => {
			expect(() => parseCode("f() = x\n")).toThrow(
				/cannot assign to expression/,
			);
		});

		test("from-import trailing comma without parens", () => {
			const stmt = parseStatement("from mod import a, b,\n");
			expect(stmt.nodeType).toBe("ImportFrom");
		});

		test("from-import parenthesized trailing comma", () => {
			const stmt = parseStatement("from mod import (a, b,)\n");
			expect(stmt.nodeType).toBe("ImportFrom");
		});
	});

	describe("lazy imports (PEP 810, Python 3.15+)", () => {
		test("'lazy import module' sets is_lazy", () => {
			const stmt = parseStatement("lazy import os\n") as Extract<
				StmtNode,
				{ nodeType: "Import" }
			>;
			expect(stmt.nodeType).toBe("Import");
			expect(stmt.is_lazy).toBe(1);
			expect(stmt.names[0].name).toBe("os");
		});

		test("'lazy from module import name' sets is_lazy", () => {
			const stmt = parseStatement("lazy from os import path\n") as Extract<
				StmtNode,
				{ nodeType: "ImportFrom" }
			>;
			expect(stmt.nodeType).toBe("ImportFrom");
			expect(stmt.is_lazy).toBe(1);
			expect(stmt.module).toBe("os");
		});

		test("plain 'import'/'from...import' leave is_lazy unset", () => {
			const importStmt = parseStatement("import os\n") as Extract<
				StmtNode,
				{ nodeType: "Import" }
			>;
			const fromStmt = parseStatement("from os import path\n") as Extract<
				StmtNode,
				{ nodeType: "ImportFrom" }
			>;
			expect(importStmt.is_lazy).toBeUndefined();
			expect(fromStmt.is_lazy).toBeUndefined();
		});

		test("'lazy' remains usable as an ordinary identifier (soft keyword)", () => {
			expect(parseStatement("lazy = 5\n").nodeType).toBe("Assign");
			expect(parseStatement("lazy(x)\n").nodeType).toBe("Expr");
			expect(parseStatement("def lazy():\n    pass\n").nodeType).toBe(
				"FunctionDef",
			);
		});

		test("lazy import with dotted module and alias", () => {
			const stmt = parseStatement("lazy import os.path as p\n") as Extract<
				StmtNode,
				{ nodeType: "Import" }
			>;
			expect(stmt.is_lazy).toBe(1);
			expect(stmt.names[0]).toMatchObject({ name: "os.path", asname: "p" });
		});

		test("lazy relative from-import", () => {
			const stmt = parseStatement("lazy from . import module\n") as Extract<
				StmtNode,
				{ nodeType: "ImportFrom" }
			>;
			expect(stmt.is_lazy).toBe(1);
			expect(stmt.level).toBe(1);
		});
	});

	describe("match statement patterns", () => {
		test("list pattern", () => {
			const stmt = parseStatement("match x:\n    case [1, 2]:\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("empty list pattern", () => {
			const stmt = parseStatement("match x:\n    case []:\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("tuple pattern", () => {
			const stmt = parseStatement("match x:\n    case (1, 2):\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("empty tuple pattern", () => {
			const stmt = parseStatement("match x:\n    case ():\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("star pattern inside sequence", () => {
			const stmt = parseStatement(
				"match x:\n    case [1, *rest]:\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("bare star pattern with no name", () => {
			const stmt = parseStatement("match x:\n    case [*_]:\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("literal true/false/none/string patterns", () => {
			const code = [
				"match x:",
				"    case True:",
				"        pass",
				"    case False:",
				"        pass",
				"    case None:",
				"        pass",
				"    case 'hi':",
				"        pass",
			].join("\n");
			const stmt = parseStatement(`${code}\n`);
			expect(stmt.nodeType).toBe("Match");
		});

		test("mapping pattern with rest", () => {
			const stmt = parseStatement(
				"match x:\n    case {'a': 1, **rest}:\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("trailing comma in list and tuple patterns", () => {
			const stmt = parseStatement(
				"match x:\n    case [1, 2,]:\n        pass\n    case (1, 2,):\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("blank line between case clauses", () => {
			const stmt = parseStatement(
				"match x:\n    case 1:\n        pass\n\n    case 2:\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("a class pattern with positional and keyword sub-patterns", () => {
			const ast = parseCode(
				"match x:\n    case Point(1, y=2):\n        pass\n",
			);
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchClass",
				cls: { nodeType: "Name", id: "Point" },
				patterns: [{ nodeType: "MatchValue", value: { value: 1 } }],
				kwd_attrs: ["y"],
				kwd_patterns: [{ nodeType: "MatchValue", value: { value: 2 } }],
			});
		});

		test("a dotted class pattern parses cls as an Attribute chain", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case mod.Point(x=1):\n  pass')`.
			const ast = parseCode(
				"match x:\n    case mod.Point(x=1):\n        pass\n",
			);
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchClass",
				cls: {
					nodeType: "Attribute",
					value: { nodeType: "Name", id: "mod" },
					attr: "Point",
				},
			});
		});

		test("a dotted name is a MatchValue(Attribute), not a capture pattern", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case Color.RED:\n  pass')`
			// produces `MatchValue(value=Attribute(...))`, not a `MatchAs` capture.
			const ast = parseCode("match x:\n    case Color.RED:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: {
					nodeType: "Attribute",
					value: { nodeType: "Name", id: "Color" },
					attr: "RED",
				},
			});
		});

		test("a multiply-dotted name chains Attribute nodes", () => {
			const ast = parseCode("match x:\n    case a.b.c:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: {
					nodeType: "Attribute",
					attr: "c",
					value: {
						nodeType: "Attribute",
						attr: "b",
						value: { nodeType: "Name", id: "a" },
					},
				},
			});
		});

		test("dotted value patterns can be combined with '|'", () => {
			const ast = parseCode(
				"match x:\n    case Color.RED | Color.BLUE:\n        pass\n",
			);
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern.nodeType).toBe("MatchOr");
		});

		test("`_` can't start a dotted value pattern", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case _.attr:\n  pass')`
			// raises `SyntaxError: invalid syntax`.
			expect(() =>
				parseCode("match x:\n    case _.attr:\n        pass\n"),
			).toThrow(/invalid syntax/);
		});

		test("`_` can't be used as a class pattern name", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case _():\n  pass')`
			// raises `SyntaxError: invalid syntax`.
			expect(() =>
				parseCode("match x:\n    case _():\n        pass\n"),
			).toThrow();
		});

		test("'as' binds a name to a value pattern", () => {
			const ast = parseCode("match x:\n    case 1 as y:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchAs",
				pattern: { nodeType: "MatchValue", value: { value: 1 } },
				name: "y",
			});
		});

		test("'as' binds a name to the whole '|' alternation, not just the last alternative", () => {
			const ast = parseCode("match x:\n    case 1 | 2 as y:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchAs",
				pattern: { nodeType: "MatchOr" },
				name: "y",
			});
		});

		test("'as' works after a parenthesized alternation", () => {
			const ast = parseCode("match x:\n    case (1 | 2) as y:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchAs",
				pattern: { nodeType: "MatchOr" },
				name: "y",
			});
		});

		test("'as' works on an element nested inside a sequence pattern", () => {
			const ast = parseCode("match x:\n    case [1 as a, 2]:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchSequence",
				patterns: [
					{
						nodeType: "MatchAs",
						pattern: { nodeType: "MatchValue", value: { value: 1 } },
						name: "a",
					},
					{ nodeType: "MatchValue", value: { value: 2 } },
				],
			});
		});

		test("a capture pattern can itself be re-bound with 'as'", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case y as z:\n  pass')`
			// produces `MatchAs(pattern=MatchAs(name='y'), name='z')`.
			const ast = parseCode("match x:\n    case y as z:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchAs",
				pattern: { nodeType: "MatchAs", name: "y" },
				name: "z",
			});
		});

		test("'as _' is rejected (CPython: cannot use '_' as a target)", () => {
			expect(() =>
				parseCode("match x:\n    case 1 as _:\n        pass\n"),
			).toThrow(/cannot use '_' as a target/);
		});

		test("a single parenthesized pattern with no trailing comma is a grouping, not a sequence", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case (1):\n  pass')`
			// produces `MatchValue(value=Constant(value=1))`, the same as `case 1:`.
			const ast = parseCode("match x:\n    case (1):\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: { value: 1 },
			});
		});

		test("a single parenthesized pattern with a trailing comma is a one-element sequence", () => {
			const ast = parseCode("match x:\n    case (1,):\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchSequence",
				patterns: [{ nodeType: "MatchValue", value: { value: 1 } }],
			});
		});

		test("a negative-number literal pattern parses as MatchValue(UnaryOp(USub, ...))", () => {
			const ast = parseCode("match x:\n    case -1:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: {
					nodeType: "UnaryOp",
					op: { nodeType: "USub" },
					operand: { nodeType: "Constant", value: 1 },
				},
			});
		});

		test("a complex-number literal pattern parses as MatchValue(BinOp(...))", () => {
			const ast = parseCode("match x:\n    case -1+2j:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: {
					nodeType: "BinOp",
					left: {
						nodeType: "UnaryOp",
						op: { nodeType: "USub" },
						operand: { nodeType: "Constant", value: 1 },
					},
					op: { nodeType: "Add" },
				},
			});
		});

		test("a complex-number literal pattern with '-' parses as MatchValue(BinOp(..., Sub, ...))", () => {
			const ast = parseCode("match x:\n    case 1-2j:\n        pass\n");
			const matchStmt = ast.body[0] as Extract<StmtNode, { nodeType: "Match" }>;
			expect(matchStmt.cases[0].pattern).toMatchObject({
				nodeType: "MatchValue",
				value: {
					nodeType: "BinOp",
					left: { nodeType: "Constant", value: 1 },
					op: { nodeType: "Sub" },
				},
			});
		});

		test("a non-imaginary right-hand side in a complex pattern is rejected", () => {
			// Verified against CPython 3.13: `ast.parse('match x:\n case 1+2:\n  pass')`
			// raises `SyntaxError: imaginary number required in complex literal`.
			expect(() =>
				parseCode("match x:\n    case 1+2:\n        pass\n"),
			).toThrow(/imaginary number required in complex literal/);
		});

		test("an unrecognized pattern token throws instead of silently matching as a wildcard", () => {
			// The parser's previous unconditional-fallback design silently
			// accepted any unrecognized pattern token as a wildcard `_` pattern;
			// it now throws instead. `-True` isn't valid pattern syntax in
			// CPython either (`signed_number` only allows `-` before a numeric
			// literal, not before `True`/`False`/`None`).
			expect(() =>
				parseCode("match x:\n    case -True:\n        pass\n"),
			).toThrow(/invalid syntax/);
		});

		test("blank line right after the match block's indent", () => {
			const stmt = parseStatement("match x:\n\n    case 1:\n        pass\n");
			expect(stmt.nodeType).toBe("Match");
		});

		test("blank (whitespace-only) line between case clauses", () => {
			const stmt = parseStatement(
				"match x:\n    case 1:\n        pass\n    \n    case 2:\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("blank line between one-line case clauses", () => {
			const stmt = parseStatement(
				"match x:\n    case 1: pass\n\n    case 2: pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});
	});

	describe("match/case/type as soft keywords", () => {
		// Verified against CPython 3.13: `match`, `case`, and `type` are soft
		// keywords, valid as ordinary identifiers everywhere outside the
		// specific syntax they introduce.
		test("match as a plain assignment target", () => {
			const stmt = parseStatement("match = 5\n");
			expect(stmt.nodeType).toBe("Assign");
		});

		test("match as a function name", () => {
			const stmt = parseStatement("def match():\n    pass\n");
			expect(stmt.nodeType).toBe("FunctionDef");
			expect((stmt as { name: string }).name).toBe("match");
		});

		test("match as an attribute name (re.match)", () => {
			const expr = parseExpression("re.match(pattern, s)");
			expect(expr.nodeType).toBe("Call");
		});

		test("case as a plain assignment target", () => {
			const stmt = parseStatement("case = 3\n");
			expect(stmt.nodeType).toBe("Assign");
		});

		test("match used as both the statement keyword and the subject name", () => {
			const stmt = parseStatement(
				"match match:\n    case case:\n        pass\n",
			);
			expect(stmt.nodeType).toBe("Match");
		});

		test("match followed by a subscript target is an annotated assignment, not a match statement", () => {
			// `match[0]: int = 1` parses as `AnnAssign` in CPython: the
			// match_stmt alternative fails (no NEWLINE after the header) and
			// backtracks entirely, same as this parser's speculative attempt.
			const stmt = parseStatement("match[0]: int = 1\n");
			expect(stmt.nodeType).toBe("AnnAssign");
		});

		test("match header with an invalid body still reports the real match-statement error", () => {
			// Once `match <expr> :` is followed by NEWLINE, CPython commits to
			// match_stmt; a missing `case` clause is a hard error, not a
			// backtrack into a different (also invalid) interpretation.
			expect(() => parseCode("match x:\n    y = 1\n")).toThrow(
				/Expected 'case'/,
			);
		});

		test("type as a plain assignment target", () => {
			const stmt = parseStatement("type = 5\n");
			expect(stmt.nodeType).toBe("Assign");
		});

		test("type as a call", () => {
			const expr = parseExpression("type(x)");
			expect(expr.nodeType).toBe("Call");
		});

		test("type alias statement still parses", () => {
			const stmt = parseStatement("type X = int\n");
			expect(stmt.nodeType).toBe("TypeAlias");
		});

		test("type alias statement with type params still parses", () => {
			const stmt = parseStatement("type X[T] = list[T]\n");
			expect(stmt.nodeType).toBe("TypeAlias");
			expect((stmt as { type_params: unknown[] }).type_params).toHaveLength(1);
		});

		test("match subject with no colon backtracks and reports invalid syntax", () => {
			// Exercises tryParseMatchStmt's "not a match statement" backtrack
			// when a colon never follows the subject expression.
			expect(() => parseCode("match x\n")).toThrow(/invalid syntax/);
		});

		test("type NAME with no '=' backtracks and reports invalid syntax", () => {
			// Exercises the type-alias attempt's "not a type alias" backtrack
			// when '=' never follows the name (and optional type params).
			expect(() => parseCode("type X\n")).toThrow(/invalid syntax/);
		});
	});

	describe("string escape sequences", () => {
		// Verified against CPython 3.13's escape table. Every case here
		// shares the same shape (parse a literal, check its decoded
		// `.value`), so it's one table rather than one `test()` per escape.
		test.each<[string, string, string]>([
			["hex escape \\x", '"\\x41"', "A"],
			["4-digit unicode escape \\u", '"\\u0041"', "A"],
			["8-digit unicode escape \\U", '"\\U0001F600"', "\u{1F600}"],
			["octal escape", '"\\101\\102\\103"', "ABC"],
			[
				"bell, backspace, formfeed, vertical tab escapes",
				'"\\a\\b\\f\\v"',
				"\x07\b\f\v",
			],
			[
				"line continuation is dropped entirely",
				'"line1\\\nline2"',
				"line1line2",
			],
			["unrecognized escape keeps the backslash literally", '"\\q"', "\\q"],
			["\\u is not decoded in a bytes literal", 'b"\\u0041"', "\\u0041"],
			[
				"raw strings still skip all escape processing",
				'r"\\x41\\n"',
				"\\x41\\n",
			],
			[
				"hex escape with fewer than 2 hex digits is kept literal",
				'"\\xg1"',
				"\\xg1",
			],
			[
				"\\N{...} named escape is kept literal (no name database)",
				'"\\N{DEGREE SIGN}"',
				"\\N{DEGREE SIGN}",
			],
			[
				"\\u escape with fewer than 4 hex digits is kept literal",
				'"\\u12"',
				"\\u12",
			],
			[
				"\\U escape with fewer than 8 hex digits is kept literal",
				'"\\U1234"',
				"\\U1234",
			],
			["\\N{ with no closing brace is kept literal", '"\\N{ABC"', "\\N{ABC"],
		])("%s", (_name, source, expected) => {
			const expr = parseExpression(source) as { value: string };
			expect(expr.value).toBe(expected);
		});
	});

	describe("parenthesized-base position tracking", () => {
		// Verified against CPython 3.13: a parenthesized atom keeps its inner
		// expression's own (paren-excluded) position when used standalone,
		// but a trailer chain built on top of one starts at the paren.
		test("attribute access on a parenthesized name starts at the paren", () => {
			const expr = parseExpression("(x).y") as ExprNode;
			expect(expr.col_offset).toBe(0);
			expect(expr.end_col_offset).toBe(5);
		});

		test("call on a parenthesized expression starts at the paren", () => {
			const expr = parseExpression("(x)()") as ExprNode;
			expect(expr.col_offset).toBe(0);
		});

		test("subscript on a parenthesized expression starts at the paren", () => {
			const expr = parseExpression("(x)[0]") as ExprNode;
			expect(expr.col_offset).toBe(0);
		});

		test("a bare parenthesized name stays transparent (no trailer applied)", () => {
			const expr = parseExpression("(x)") as ExprNode;
			expect(expr.nodeType).toBe("Name");
			expect(expr.col_offset).toBe(1);
		});
	});

	describe("slice with omitted lower bound", () => {
		test("col_offset points at the colon, not the upper-bound expression", () => {
			// Verified against CPython 3.13: `ast.parse('x[:3]', mode='eval')`
			// gives the Slice node col_offset 2 (the `:`), not 3 (the `3`).
			const expr = parseExpression("x[:3]") as {
				slice: { col_offset: number };
			};
			expect(expr.slice.col_offset).toBe(2);
		});
	});

	describe("decorated async function position", () => {
		test("lineno/col_offset point at 'async', not 'def'", () => {
			// Verified against CPython 3.13.
			const stmt = parseStatement(
				"class C:\n    @staticmethod\n    async def f():\n        pass\n",
			);
			const method = (stmt as { body: StmtNode[] }).body[0] as {
				nodeType: string;
				col_offset: number;
			};
			expect(method.nodeType).toBe("AsyncFunctionDef");
			expect(method.col_offset).toBe(4);
		});
	});

	describe("bare generator expression argument position", () => {
		// Verified against CPython 3.13: a lone, unparenthesized generator
		// expression argument (`f(x for x in y)`) uses the call's own parens
		// as its own — its position starts at `(` and ends at `)`, unlike an
		// explicitly-parenthesized one (`f((x for x in y))`), which keeps its
		// own separate, inner parens instead.
		test("bare generator expression spans the call's parens", () => {
			const expr = parseExpression("any(x for x in y)") as {
				args: ExprNode[];
			};
			const genexp = expr.args[0];
			expect(genexp.nodeType).toBe("GeneratorExp");
			expect(genexp.col_offset).toBe(3);
			expect(genexp.end_col_offset).toBe(17);
		});

		test("explicitly-parenthesized generator expression keeps its own parens", () => {
			const expr = parseExpression("f((x for x in y))") as {
				args: ExprNode[];
			};
			const genexp = expr.args[0];
			expect(genexp.nodeType).toBe("GeneratorExp");
			expect(genexp.col_offset).toBe(2);
			expect(genexp.end_col_offset).toBe(16);
		});
	});

	describe("single-element tuple target/value with a trailing comma", () => {
		// Verified against CPython 3.13: a trailing comma may be immediately
		// followed by `=` (or end the statement), making a single-element
		// `Tuple` rather than requiring another element after the comma.
		test("single-element tuple assignment target", () => {
			const stmt = parseStatement("a, = b\n") as {
				nodeType: string;
				targets: ExprNode[];
			};
			expect(stmt.nodeType).toBe("Assign");
			expect(stmt.targets[0].nodeType).toBe("Tuple");
			expect((stmt.targets[0] as { elts: ExprNode[] }).elts).toHaveLength(1);
		});

		test("multi-element tuple assignment target with trailing comma", () => {
			const stmt = parseStatement("a, b, = c\n") as {
				targets: ExprNode[];
			};
			expect((stmt.targets[0] as { elts: ExprNode[] }).elts).toHaveLength(2);
		});

		test("single-element tuple value in a chained assignment", () => {
			const stmt = parseStatement("x = y, = z\n") as {
				targets: ExprNode[];
			};
			expect(stmt.targets[1].nodeType).toBe("Tuple");
			expect((stmt.targets[1] as { elts: ExprNode[] }).elts).toHaveLength(1);
		});
	});

	describe("CRLF line endings", () => {
		// Verified against CPython 3.13: `ast.parse` performs universal-newline
		// translation (`\r\n`/`\r` -> `\n`) on the whole source, including
		// inside string literals, before tokenizing.
		test("indentation tracking isn't thrown off by \\r\\n", () => {
			const ast = parseCode(
				"class C:\r\n    x = 1\r\n\r\n    def f(self):\r\n        pass\r\n",
			);
			const cls = ast.body[0] as { body: StmtNode[] };
			expect(cls.body).toHaveLength(2);
			expect(cls.body[1].nodeType).toBe("FunctionDef");
		});

		test("a \\r\\n inside a triple-quoted string is normalized to \\n", () => {
			const expr = parseExpression('"""line1\r\nline2"""') as {
				value: string;
			};
			expect(expr.value).toBe("line1\nline2");
		});

		test("lone \\r line endings are also normalized", () => {
			const ast = parseCode("x = 1\ry = 2\r");
			expect(ast.body).toHaveLength(2);
		});
	});

	describe("source with no trailing newline", () => {
		// Verified against CPython 3.13: `ast.parse("def f():\n    return")`
		// (no trailing `\n`) is valid. Without a real `\n` character, nothing
		// emitted the `NEWLINE` a `return`/`yield` normally ends on, so the
		// parser read straight into `DEDENT`/`EOF` and misread it as the
		// statement's optional value.
		test("a bare 'return' as the last line", () => {
			const stmt = parseStatement("def f():\n    return") as {
				body: StmtNode[];
			};
			const ret = stmt.body[0] as { nodeType: string; value?: unknown };
			expect(ret.nodeType).toBe("Return");
			expect(ret.value).toBeUndefined();
		});

		test("a bare 'yield' as the last line", () => {
			const stmt = parseStatement("def f():\n    yield") as {
				body: StmtNode[];
			};
			const yieldExpr = (stmt.body[0] as { value: { value?: unknown } }).value;
			expect(yieldExpr.value).toBeUndefined();
		});

		test("a value-bearing 'return' as the last line still parses its value", () => {
			const stmt = parseStatement("def f():\n    return 1") as {
				body: StmtNode[];
			};
			const ret = stmt.body[0] as { value: { value: number } };
			expect(ret.value.value).toBe(1);
		});

		test("a simple statement with no trailing newline", () => {
			const ast = parseCode("x = 1");
			expect(ast.body).toHaveLength(1);
		});
	});

	describe("relative imports with 4+ leading dots", () => {
		// Verified against CPython 3.13: the lexer tokenizes any run of 3+
		// dots as one or more `...` (ELLIPSIS) tokens rather than that many
		// DOTs, so e.g. 4 dots comes through as ELLIPSIS + DOT.
		test.each([1, 2, 3, 4, 5, 6, 7])("%i leading dots", (n) => {
			const stmt = parseStatement(`from ${".".repeat(n)}a import x\n`) as {
				level: number;
			};
			expect(stmt.level).toBe(n);
		});
	});

	describe("starred expressions in previously-unsupported positions", () => {
		// Verified against CPython 3.13.
		test("starred element in a set display", () => {
			const expr = parseExpression("{*a, *b}") as { elts: ExprNode[] };
			expect(expr.nodeType).toBe("Set");
			expect(expr.elts.map((e) => e.nodeType)).toEqual(["Starred", "Starred"]);
		});

		test("starred element mixed with a plain element in a set display", () => {
			const expr = parseExpression("{a, *b}") as { elts: ExprNode[] };
			expect(expr.elts.map((e) => e.nodeType)).toEqual(["Name", "Starred"]);
		});

		test("set display starting with a starred element and a trailing comma", () => {
			const expr = parseExpression("{*a, *b,}") as { elts: ExprNode[] };
			expect(expr.elts.map((e) => e.nodeType)).toEqual(["Starred", "Starred"]);
		});

		test("starred return value", () => {
			const stmt = parseStatement("def f():\n    return *a, b\n") as {
				body: { value: ExprNode }[];
			};
			expect(stmt.body[0].value.nodeType).toBe("Tuple");
		});

		test("starred yield value", () => {
			const stmt = parseStatement("def f():\n    yield *a, b\n") as {
				body: { value: { value: ExprNode } }[];
			};
			expect(stmt.body[0].value.value.nodeType).toBe("Tuple");
		});

		test("starred assignment value", () => {
			const stmt = parseStatement("x = *a, b\n") as { value: ExprNode };
			expect(stmt.value.nodeType).toBe("Tuple");
		});

		test("starred chained-assignment value", () => {
			const stmt = parseStatement("x = y = *a, b\n") as { value: ExprNode };
			expect(stmt.value.nodeType).toBe("Tuple");
		});

		test("starred annotated-assignment value", () => {
			const stmt = parseStatement("x: tuple = *a, b\n") as {
				value: ExprNode;
			};
			expect(stmt.value.nodeType).toBe("Tuple");
		});

		test("starred for-loop iterable", () => {
			const stmt = parseStatement("for x in *a, b:\n    pass\n") as {
				iter: ExprNode;
			};
			expect(stmt.iter.nodeType).toBe("Tuple");
		});

		test("starred for-loop target", () => {
			const stmt = parseStatement("for label, *data in x:\n    pass\n") as {
				target: { elts: ExprNode[] };
			};
			expect(stmt.target.elts.map((e) => e.nodeType)).toEqual([
				"Name",
				"Starred",
			]);
		});

		test("starred class base", () => {
			const stmt = parseStatement("class C(*bases):\n    pass\n") as {
				bases: ExprNode[];
			};
			expect(stmt.bases[0].nodeType).toBe("Starred");
		});

		test("double-starred class keyword", () => {
			const stmt = parseStatement("class C(**kwds):\n    pass\n") as {
				keywords: { arg?: string }[];
			};
			expect(stmt.keywords[0].arg).toBeUndefined();
		});

		test("class with a mix of base, starred base, keyword, and double-starred keyword", () => {
			const stmt = parseStatement(
				"class C(base, *more, meta=X, **kw):\n    pass\n",
			) as { bases: ExprNode[]; keywords: { arg?: string }[] };
			expect(stmt.bases.map((b) => b.nodeType)).toEqual(["Name", "Starred"]);
			expect(stmt.keywords.map((k) => k.arg)).toEqual(["meta", undefined]);
		});
	});

	describe("single-line compound-statement body followed by a comment-only line", () => {
		// A comment-only line between a single-line `if a: ...` body and its
		// `elif`/`else` (or `except`/`finally`) previously left a stray
		// NEWLINE in the way of the follow-up clause check.
		test("elif after an inline if-body and a standalone comment", () => {
			const stmt = parseStatement(
				"if a: y = 1\n# comment\nelif b: y = 2\n",
			) as { orelse: StmtNode[] };
			expect(stmt.orelse[0].nodeType).toBe("If");
		});

		test("else after an inline while-body and a blank line", () => {
			const stmt = parseStatement("while a: y = 1\n\nelse: y = 2\n") as {
				orelse: StmtNode[];
			};
			expect(stmt.orelse).toHaveLength(1);
		});

		test("except after an inline try-body and a standalone comment", () => {
			const stmt = parseStatement("try: y = 1\n# c\nexcept: y = 2\n") as {
				handlers: unknown[];
			};
			expect(stmt.handlers).toHaveLength(1);
		});

		test("finally after an inline except-body and a standalone comment", () => {
			const stmt = parseStatement(
				"try: y = 1\nexcept: y = 2\n# c\nfinally: y = 3\n",
			) as { finalbody: StmtNode[] };
			expect(stmt.finalbody).toHaveLength(1);
		});
	});

	describe("f-strings", () => {
		test("nested f-string inside interpolation", () => {
			const expr = parseCode("f\"{f'{x}'}\"\n");
			expect(expr.body[0].nodeType).toBe("Expr");
		});

		test("quoted string literal inside interpolation", () => {
			const ast = parseCode("f\"{'a' + 'b'}\"\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("doubled braces are a literal brace, not an interpolation", () => {
			// Verified against CPython 3.13.
			const expr = parseExpression('f"{{literal}}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values).toHaveLength(1);
			expect(expr.values[0].nodeType).toBe("Constant");
			expect(expr.values[0].value).toBe("{literal}");
		});

		test("a real interpolation flanked by doubled-brace literals", () => {
			const expr = parseExpression('f"{a}{{b}}{c}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values.map((v) => v.nodeType)).toEqual([
				"FormattedValue",
				"Constant",
				"FormattedValue",
			]);
			expect(expr.values[1].value).toBe("{b}");
		});

		test("doubled braces immediately wrapping a real interpolation", () => {
			const expr = parseExpression('f"{{{x}}}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values.map((v) => v.nodeType)).toEqual([
				"Constant",
				"FormattedValue",
				"Constant",
			]);
			expect(expr.values[0].value).toBe("{");
			expect(expr.values[2].value).toBe("}");
		});

		test("four consecutive braces on each side collapse to pure literal text", () => {
			const expr = parseExpression('f"{{{{nested}}}}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values).toHaveLength(1);
			expect(expr.values[0].value).toBe("{{nested}}");
		});

		test("doubled braces between two real interpolations (dataclasses.py repr pattern)", () => {
			const expr = parseExpression('f"{f.name}={{self.{f.name}!r}}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values.map((v) => v.nodeType)).toEqual([
				"FormattedValue",
				"Constant",
				"FormattedValue",
				"Constant",
			]);
			expect(expr.values[1].value).toBe("={self.");
			expect(expr.values[3].value).toBe("!r}");
		});

		test("a doubled brace before the closing quote doesn't look unterminated (tkinter.py pattern)", () => {
			// Verified against CPython 3.13: `f'if {{"[{funcid} '` — the `{{`
			// must not count as opening a real field, or the lexer sees
			// unbalanced brace nesting and never finds the closing `'`.
			const expr = parseExpression(`f'if {{"[{funcid} '`) as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values.map((v) => v.nodeType)).toEqual([
				"Constant",
				"FormattedValue",
				"Constant",
			]);
			expect(expr.values[0].value).toBe('if {"[');
			expect(expr.values[2].value).toBe(" ");
		});

		test("\\N{...} braces between two fields aren't mistaken for a field boundary", () => {
			// Verified against CPython 3.13 (ptutils.py pattern): the `{`/`}`
			// of a `\N{...}` named escape are part of the escape, not a
			// field delimiter, even though this library leaves the name
			// itself unresolved (see the string-escape-sequences tests).
			const expr = parseExpression('f"{a}\\N{HORIZONTAL ELLIPSIS}{b}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values.map((v) => v.nodeType)).toEqual([
				"FormattedValue",
				"Constant",
				"FormattedValue",
			]);
			expect(expr.values[1].value).toBe("\\N{HORIZONTAL ELLIPSIS}");
		});

		test("real nested braces inside a field still nest normally (not the doubling escape)", () => {
			// Verified against CPython 3.13: `{ {1: 2} }` is a dict display
			// inside the field, unrelated to the `{{`/`}}` literal-brace
			// escape, which only applies outside a field.
			const expr = parseExpression('f"{ {1: 2} }"') as {
				values: { value: ExprNode }[];
			};
			expect(expr.values[0].value.nodeType).toBe("Dict");
		});

		test("escape sequences in literal text are decoded", () => {
			// Verified against CPython 3.13: the literal portions of an
			// f-string go through the same escape decoding as a plain string.
			const expr = parseExpression('f"\\nvalue={x}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values[0].value).toBe("\nvalue=");
		});

		test("raw f-string literal text is not escape-decoded", () => {
			const expr = parseExpression('rf"\\nvalue={x}"') as {
				values: { nodeType: string; value?: string }[];
			};
			expect(expr.values[0].value).toBe("\\nvalue=");
		});

		test("escape sequences in a format spec are decoded", () => {
			const expr = parseExpression('f"{x:\\n<5}"') as {
				values: { format_spec?: { values: { value?: string }[] } }[];
			};
			expect(expr.values[0].format_spec?.values[0].value).toBe("\n<5");
		});

		test("escape sequences in a nested f-string's literal text are decoded", () => {
			const expr = parseExpression("f\"outer {f'\\ninner {y}'}\"") as {
				values: {
					value?: { values: { value?: string }[] };
				}[];
			};
			const inner = expr.values[1].value;
			expect(inner?.values[0].value).toBe("\ninner ");
		});

		test("an emoji in literal text before an interpolation shifts the field's column by its UTF-8 byte length", () => {
			// Verified against CPython 3.13 (`f"😀{x}"` inside `a = ...`): the
			// emoji is 1 JS UTF-16 surrogate pair but 4 UTF-8 bytes, so the
			// literal Constant spans 4 columns and the field starts right
			// after it, not after just 1 (a naive JS-length count).
			const expr = parseExpression('f"😀{x}"') as {
				values: ExprNode[];
			};
			const literal = expr.values[0];
			const field = expr.values[1];
			expect(literal.end_col_offset - literal.col_offset).toBe(4);
			expect(field.col_offset).toBe(literal.end_col_offset);
		});

		test("conversion specifier with format spec", () => {
			const ast = parseCode('f"{x!r:>10}"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("conversion specifier without format spec", () => {
			const ast = parseCode('f"{x!s}"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("malformed interpolation expression throws (matches CPython)", () => {
			// Verified against CPython 3.13: `ast.parse('f"{,}"')` raises
			// `SyntaxError: f-string: invalid syntax`.
			expect(() => parseCode('f"{,}"\n')).toThrow(
				/f-string: invalid syntax in interpolated expression/,
			);
		});

		test("an empty interpolation throws (matches CPython)", () => {
			// Verified against CPython 3.13: `ast.parse('f"{}"')` raises
			// `SyntaxError: f-string: valid expression required before '}'`.
			expect(() => parseCode('f"{}"\n')).toThrow(
				/f-string: valid expression required before '\}'/,
			);
			expect(() => parseCode('t"{}"\n')).toThrow(
				/f-string: valid expression required before '\}'/,
			);
		});

		test("trailing/leftover tokens after a complete interpolation expression throw (matches CPython)", () => {
			// Verified against CPython 3.13: `ast.parse('f"{1 2}"')` raises
			// `SyntaxError: invalid syntax. Perhaps you forgot a comma?`.
			expect(() => parseCode('f"{1 2}"\n')).toThrow(
				/f-string: invalid syntax in interpolated expression/,
			);
		});

		test("escaped quote inside a nested string literal", () => {
			const code = "f\"{'a\\'b'}\"\n";
			const ast = parseCode(code);
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("unterminated nested string literal throws", () => {
			expect(() => parseCode('f"{\'a}"\n')).toThrow(
				/Unterminated string starting at position/,
			);
		});

		test("unterminated nested f-string throws", () => {
			expect(() => parseCode('f"{f\'{x}}"\n')).toThrow(
				/Unterminated f-string\/t-string starting at position/,
			);
		});

		test("brace-containing dict literal inside interpolation", () => {
			const ast = parseCode('f"{ {1: 2} }"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("slice colon inside interpolation is not mistaken for a format spec", () => {
			const ast = parseCode('f"{arr[1:2]}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Subscript");
			expect(formatted.format_spec).toBeUndefined();
		});

		test("dict literal colon inside interpolation is not mistaken for a format spec", () => {
			const ast = parseCode('f"{ {1: 2, 3: 4} }"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Dict");
			expect(formatted.format_spec).toBeUndefined();
		});

		test("format spec after a subscripted expression is still split out", () => {
			const ast = parseCode("f\"{d['a']:>10}\"\n");
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Subscript");
			expect(formatted.format_spec).toBeDefined();
		});

		test("conversion specifier immediately before a top-level colon still splits format spec", () => {
			const ast = parseCode('f"{x!r:>10}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.conversion).toBe(114);
			expect(formatted.format_spec).toBeDefined();
		});

		test("comparison operator inside interpolation parses as a Compare, not just its left operand", () => {
			const ast = parseCode('f"{a != b}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Compare");
		});

		test("boolean 'or' inside interpolation parses as a BoolOp, not just its left operand", () => {
			const ast = parseCode('f"{a or b}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("BoolOp");
		});

		test("conditional expression inside interpolation parses as an IfExp", () => {
			const ast = parseCode('f"{a if b else c}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("IfExp");
		});

		test("bare tuple inside interpolation parses as a Tuple", () => {
			const ast = parseCode('f"{1, 2}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Tuple");
		});

		test("self-documenting expression defaults to !r conversion and prepends a literal 'expr=' Constant", () => {
			const ast = parseCode('f"{x=}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "x=",
			});
			const formatted = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value).toMatchObject({ nodeType: "Name", id: "x" });
			expect(formatted.conversion).toBe(114);
		});

		test("self-documenting expression's synthesized literal merges with preceding literal text", () => {
			// Verified against CPython 3.13: `ast.parse('f"prefix: {x=}"')`
			// produces a single merged Constant('prefix: x='), not two
			// separate adjacent Constants.
			const ast = parseCode('f"prefix: {x=}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			expect(expr.values).toHaveLength(2);
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "prefix: x=",
			});
			expect(expr.values[1].nodeType).toBe("FormattedValue");
		});

		test("self-documenting expression preserves surrounding whitespace in the literal", () => {
			const ast = parseCode('f"{x =}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "x =",
			});
		});

		test("self-documenting expression with an explicit conversion keeps it instead of defaulting", () => {
			const ast = parseCode('f"{x=!s}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.conversion).toBe(115);
		});

		test("self-documenting expression with a format spec and no explicit conversion stays unconverted", () => {
			const ast = parseCode('f"{x=:>10}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.conversion).toBe(-1);
			expect(formatted.format_spec).toBeDefined();
		});

		test("self-documenting expression with an explicit conversion and a format spec keeps both", () => {
			const ast = parseCode('f"{x=!s:>10}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			const formatted = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.conversion).toBe(115);
			expect(formatted.format_spec).toBeDefined();
		});

		test("a self-documenting-looking expression nested in parens/calls is still recognized (nested '=' isn't mistaken)", () => {
			const ast = parseCode('f"{f(x=1)=}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "f(x=1)=",
			});
			const formatted = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "FormattedValue" }
			>;
			expect(formatted.value.nodeType).toBe("Call");
			expect(formatted.conversion).toBe(114);
		});

		test("comparison/walrus operators ending in '=' are not mistaken for the self-documenting marker", () => {
			for (const src of [
				'f"{x==y}"\n',
				'f"{x!=y}"\n',
				'f"{x<=y}"\n',
				'f"{x>=y}"\n',
			]) {
				const ast = parseCode(src);
				const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
					.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
				expect(expr.values).toHaveLength(1);
				expect(expr.values[0].nodeType).toBe("FormattedValue");
			}
		});

		test("a dangling comparison operator (invalid as real Python, e.g. '{x>=}') is not mistaken for the self-documenting marker either", () => {
			// Verified against CPython 3.13: `ast.parse('f"{x>=}"')` raises
			// `SyntaxError: f-string: expecting '=', or '!', or ':', or '}'` —
			// a trailing comparison operator can never be valid, complete
			// expression text (every comparison/walrus operator requires a
			// right-hand operand), so `isComparisonOrWalrus` only ever excludes
			// input that's already malformed. Since it isn't mistaken for the
			// self-documenting marker, `x>=` is left as the (invalid) expression
			// text, which correctly throws rather than being misread as a
			// self-documenting `{expr=}` marker.
			expect(() => parseCode('f"{x>=}"\n')).toThrow(
				/f-string: invalid syntax in interpolated expression/,
			);
		});

		test("self-documenting expression works the same way in a t-string interpolation", () => {
			const ast = parseCode('t"{x=}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "x=",
			});
			const interpolation = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			expect(interpolation.str).toBe("x");
			expect(interpolation.conversion).toBe(114);
		});
	});

	describe("t-strings (PEP 750 template strings)", () => {
		test("simple interpolation produces TemplateStr/Interpolation nodes", () => {
			const ast = parseCode('t"hello {x}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			expect(expr.nodeType).toBe("TemplateStr");
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "hello ",
			});
			const interpolation = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			expect(interpolation.nodeType).toBe("Interpolation");
			expect(interpolation.value.nodeType).toBe("Name");
			expect(interpolation.str).toBe("x");
			expect(interpolation.conversion).toBe(-1);
		});

		test("uppercase T prefix also produces a TemplateStr", () => {
			const ast = parseCode('T"hello {x}"\n');
			expect(
				(ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>).value.nodeType,
			).toBe("TemplateStr");
		});

		test("conversion specifier with format spec", () => {
			const ast = parseCode('t"{x!r:>10}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			const interpolation = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			expect(interpolation.conversion).toBe(114);
			expect(interpolation.str).toBe("x");
			expect(interpolation.format_spec?.nodeType).toBe("JoinedStr");
		});

		test("nested interpolation's format spec is JoinedStr/FormattedValue, not TemplateStr", () => {
			const ast = parseCode('t"{x:>{width}}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			const interpolation = expr.values[0] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			const formatSpec = interpolation.format_spec as Extract<
				ExprNode,
				{ nodeType: "JoinedStr" }
			>;
			expect(formatSpec.nodeType).toBe("JoinedStr");
			expect(
				formatSpec.values.some((v) => v.nodeType === "FormattedValue"),
			).toBe(true);
		});

		test("raw t-string (tr/rt prefixes) keeps backslashes literal", () => {
			for (const src of ['tr"a\\\\b {x}"\n', 'rt"a\\\\b {x}"\n']) {
				const ast = parseCode(src);
				const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
					.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
				expect(expr.values[0]).toMatchObject({
					nodeType: "Constant",
					value: "a\\\\b ",
				});
			}
		});

		test("triple-quoted t-string", () => {
			const src = 't"""multi\nline {x}"""\n';
			const ast = parseCode(src);
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			// `TemplateStr` has no `kind` field (CPython's `ast` doesn't have
			// one either); the original triple-quote style is instead recorded
			// on the py-ast-specific `quote_style` field, which the unparser
			// uses to round-trip it exactly.
			expect("kind" in expr).toBe(false);
			expect(expr.quote_style).toBe('t"""');
			expect(unparse(ast).trim()).toBe(src.trim());
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "multi\nline ",
			});
		});

		test("nested f-string inside a t-string interpolation", () => {
			const ast = parseCode("t\"outer {f'inner {y}'} end\"\n");
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			const interpolation = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			expect(interpolation.value.nodeType).toBe("JoinedStr");
		});

		test("nested t-string inside a t-string interpolation", () => {
			const ast = parseCode("t\"outer {t'inner {y}'} end\"\n");
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			const interpolation = expr.values[1] as Extract<
				ExprNode,
				{ nodeType: "Interpolation" }
			>;
			expect(interpolation.value.nodeType).toBe("TemplateStr");
		});

		test("adjacent t-string literals concatenate into one TemplateStr", () => {
			const ast = parseCode('t"a" t"{x}"\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			expect(expr.nodeType).toBe("TemplateStr");
			expect(expr.values).toHaveLength(2);
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "a",
			});
		});

		test("mixing f-string and t-string literals throws", () => {
			expect(() => parseCode('f"a" t"b"\n')).toThrow(
				/cannot mix f-string literals with t-string literals/,
			);
		});

		test("mixing t-string and plain string literals throws", () => {
			expect(() => parseCode('t"a" "b"\n')).toThrow(
				/cannot mix t-string literals with string or bytes literals/,
			);
		});

		test("empty t-string", () => {
			const ast = parseCode('t""\n');
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			expect(expr.nodeType).toBe("TemplateStr");
			expect(expr.values).toEqual([]);
		});
	});

	describe("comprehensions and generators", () => {
		test("async generator expression", () => {
			const ast = parseCode(
				"async def f():\n    return (x async for x in y)\n",
			);
			expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
		});

		test("async generator expression with additional for clause", () => {
			const ast = parseCode(
				"async def f():\n    return (x async for x in y for z in w)\n",
			);
			expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
		});

		test("async generator expression with nested async for", () => {
			const ast = parseCode(
				"async def f():\n    return (x async for x in y async for z in w)\n",
			);
			expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
		});

		test("generator expression: 'async' not followed by 'for' fails", () => {
			expect(() =>
				parseCode("async def f():\n    return (x async for x in y async z)\n"),
			).toThrow(/Expected '\)' after generator expression/);
		});

		test("list comprehension: 'async' not followed by 'for' fails", () => {
			expect(() =>
				parseCode("async def f():\n    return [x async for x in y async z]\n"),
			).toThrow(/Expected '\]' after list comprehension/);
		});

		test("dict comprehension: second clause's 'async' not followed by 'for' fails", () => {
			expect(() => parseCode("{k: v for k, v in x async z}\n")).toThrow(
				/Expected '}' after dict comprehension/,
			);
		});

		test("set comprehension: second clause's 'async' not followed by 'for' fails", () => {
			expect(() => parseCode("{v for v in x async z}\n")).toThrow(
				/Expected '}' after set comprehension/,
			);
		});

		test("list comprehension with trailing comma before closing bracket in subscript", () => {
			const ast = parseCode("x[1, 2,]\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("target tuple with trailing comma before 'in'", () => {
			const ast = parseCode("for a, b, in y:\n    pass\n");
			expect(ast.body[0].nodeType).toBe("For");
		});

		test("target tuple with three elements before 'in'", () => {
			const ast = parseCode("for a, b, c in y:\n    pass\n");
			expect(ast.body[0].nodeType).toBe("For");
		});

		test("subscript list with three elements and trailing comma", () => {
			const ast = parseCode("x[1, 2, 3,]\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("list literal trailing comma with comment after comma", () => {
			const ast = parse("[1,  # c\n 2]\n", { comments: true });
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("set literal trailing comma", () => {
			const ast = parseCode("{1, 2,}\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("dict comprehension", () => {
			const ast = parseCode("{k: v for k, v in items}\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("set comprehension", () => {
			const ast = parseCode("{v for v in items}\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("async list comprehension", () => {
			const ast = parseCode(
				"async def f():\n    return [x async for x in y]\n",
			);
			expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
		});
	});

	describe("PEP 695 type params and type alias with decorator target", () => {
		test("generic function", () => {
			const stmt = parseStatement("def f[T](x: T) -> T:\n    return x\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("generic class", () => {
			const stmt = parseStatement("class Box[T]:\n    pass\n");
			expect(stmt.nodeType).toBe("ClassDef");
		});

		test("type alias with type params", () => {
			const stmt = parseStatement("type Alias[T] = list[T]\n");
			expect(stmt.nodeType).toBe("TypeAlias");
		});

		test("decorated type alias with type parameters", () => {
			const stmt = parseStatement("@deco\nAlias[T] = list[T]\n");
			expect(stmt.nodeType).toBe("TypeAlias");
		});

		test("invalid decorator target throws", () => {
			expect(() => parseCode("@deco\nx = 1\n")).toThrow(
				/Invalid decorator target/,
			);
		});
	});

	describe("positional-only params and misc parameter syntax", () => {
		test("positional-only separator", () => {
			const stmt = parseStatement("def f(a, b, /, c):\n    pass\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("trailing comma in parameter list", () => {
			const stmt = parseStatement("def f(a, b,):\n    pass\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("blank line between trailing comma and closing paren", () => {
			const stmt = parseStatement("def f(\n    a,\n\n):\n    pass\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("keyword-only params after bare star", () => {
			const stmt = parseStatement("def f(a, *, b, c=1):\n    pass\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});
	});

	describe("global/nonlocal/walrus", () => {
		test("global with multiple names", () => {
			const stmt = parseStatement("def f():\n    global a, b, c\n");
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("nonlocal with multiple names", () => {
			const stmt = parseStatement(
				"def f():\n    def g():\n        nonlocal a, b\n",
			);
			expect(stmt.nodeType).toBe("FunctionDef");
		});

		test("walrus operator in expression", () => {
			const ast = parseCode("if (n := 10) > 5:\n    pass\n");
			expect(ast.body[0].nodeType).toBe("If");
		});

		test("setContext no-op branch: a non-target-shaped walrus target is left structurally unchanged", () => {
			// The parser (like this walrus production specifically) doesn't restrict
			// `:=`'s target to a bare NAME the way CPython does; setContext's fallback
			// branch simply leaves non-Name/Attribute/Subscript/Starred/List/Tuple
			// nodes untouched rather than crashing.
			const expr = parseExpression("(a + b := 5)");
			expect(expr.nodeType).toBe("NamedExpr");
			if (expr.nodeType === "NamedExpr") {
				expect(expr.target.nodeType).toBe("BinOp");
			}
		});
	});

	describe("chained comparisons and starred assignment", () => {
		test("chained comparison", () => {
			const ast = parseCode("a < b <= c == d != e\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("starred assignment target", () => {
			const ast = parseCode("a, *b, c = [1, 2, 3, 4]\n");
			expect(ast.body[0].nodeType).toBe("Assign");
		});
	});

	describe("raise/assert/type-alias statements", () => {
		test("bare raise", () => {
			const stmt = parseStatement("raise\n");
			expect(stmt.nodeType).toBe("Raise");
		});

		test("raise with cause", () => {
			const stmt = parseStatement("raise ValueError('x') from err\n");
			expect(stmt.nodeType).toBe("Raise");
		});

		test("assert with message", () => {
			const stmt = parseStatement("assert x, 'message'\n");
			expect(stmt.nodeType).toBe("Assert");
		});

		test("type alias without decorator", () => {
			const stmt = parseStatement("type X = int\n");
			expect(stmt.nodeType).toBe("TypeAlias");
		});
	});

	describe("empty source and trailing constructs", () => {
		test("empty source produces empty module", () => {
			const ast = parseCode("");
			expect(ast.body).toEqual([]);
		});

		test("source with only comments", () => {
			const ast = parse("# just a comment\n", { comments: true });
			expect(ast.body.length).toBeGreaterThan(0);
		});

		test("source with only whitespace/newlines", () => {
			const ast = parseCode("\n\n\n");
			expect(ast.body).toEqual([]);
		});

		test("source ending in a bare name with no trailing newline", () => {
			const ast = parseCode("x");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("trailing inline comment with no trailing newline", () => {
			const ast = parse("x = 1  # trailing", { comments: true });
			expect(ast.body[0].nodeType).toBe("Assign");
		});
	});

	describe("exported utility functions", () => {
		test("parseFile is unimplemented", () => {
			expect(() => parseFile("nonexistent.py")).toThrow(
				/parseFile not implemented/,
			);
		});

		test("literalEval evaluates a list", () => {
			expect(literalEval("[1, 2, 3]")).toEqual([1, 2, 3]);
		});

		test("literalEval evaluates a tuple", () => {
			expect(literalEval("(1, 2, 3)")).toEqual([1, 2, 3]);
		});

		test("literalEval evaluates a dict", () => {
			expect(literalEval("{'a': 1, 'b': 2}")).toEqual({ a: 1, b: 2 });
		});

		test("literalEval evaluates a set", () => {
			expect(literalEval("{1, 2, 3}")).toEqual(new Set([1, 2, 3]));
		});

		test("literalEval evaluates unary plus/minus", () => {
			expect(literalEval("-5")).toBe(-5);
			expect(literalEval("+5")).toBe(5);
		});

		test("literalEval evaluates binary add/sub of numbers", () => {
			expect(literalEval("1 + 2")).toBe(3);
			expect(literalEval("5 - 2")).toBe(3);
		});

		test("literalEval evaluates imaginary literals", () => {
			expect(literalEval("4j")).toEqual(new PyComplex(0, 4));
			expect(literalEval("+4j")).toEqual(new PyComplex(0, 4));
			expect(literalEval("-4j")).toEqual(new PyComplex(-0, -4));
			expect(literalEval("3 + 4j")).toEqual(new PyComplex(3, 4));
			expect(literalEval("3 - 4j")).toEqual(new PyComplex(3, -4));
			expect(literalEval("4j + 3")).toEqual(new PyComplex(3, 4));
			expect(literalEval("4j - 3")).toEqual(new PyComplex(-3, 4));
			expect(literalEval("4j + 3j")).toEqual(new PyComplex(0, 7));
			expect(literalEval("4j - 3j")).toEqual(new PyComplex(0, 1));
			expect(() => literalEval("4j * 2")).toThrow(/Cannot evaluate/);
		});

		test("literalEval throws with no expression statement", () => {
			expect(() => literalEval("x = 1\n")).toThrow(
				/No expression found to evaluate/,
			);
		});

		test("literalEval throws on unsupported node type", () => {
			expect(() => literalEval("f()")).toThrow(/Cannot evaluate/);
		});

		test("literalEval throws on unsupported unary operator", () => {
			expect(() => literalEval("~5")).toThrow(
				/Cannot evaluate UnaryOp in literal context/,
			);
		});

		test("literalEval throws on unsupported binary operator", () => {
			expect(() => literalEval("2 * 3")).toThrow(
				/Cannot evaluate BinOp in literal context/,
			);
		});

		test("copyLocation copies position fields", () => {
			const oldNode: ASTNode = {
				nodeType: "Name",
				lineno: 5,
				col_offset: 3,
				end_lineno: 5,
				end_col_offset: 10,
			} as unknown as ASTNode;
			const newNode: ASTNode = {
				nodeType: "Name",
				lineno: 1,
				col_offset: 0,
			} as unknown as ASTNode;
			const result = copyLocation(newNode, oldNode);
			expect(result.lineno).toBe(5);
			expect(result.col_offset).toBe(3);
			expect(result.end_lineno).toBe(5);
			expect(result.end_col_offset).toBe(10);
		});

		test("fixMissingLocations fills in nested nodes recursively", () => {
			const module: Module = parseCode("x = 1\n");
			const assign = module.body[0] as ASTNode & {
				lineno: number | undefined;
				col_offset: number | undefined;
			};
			assign.lineno = undefined;
			assign.col_offset = undefined;
			const fixed = fixMissingLocations(module) as Module;
			const fixedAssign = fixed.body[0] as ASTNode;
			expect(fixedAssign.lineno).toBe(1);
			expect(fixedAssign.col_offset).toBe(0);
		});

		test("fixMissingLocations handles non-object input gracefully", () => {
			const module = parseCode("x = 1\n");
			expect(() => fixMissingLocations(module)).not.toThrow();
		});

		test("fixMissingLocations falls back to parent location for a child whose own location keys are absent (array and object fields)", () => {
			const raw = {
				nodeType: "Module",
				lineno: 7,
				col_offset: 2,
				end_lineno: 7,
				end_col_offset: 20,
				body: [
					{
						nodeType: "Wrapper",
						child: {
							nodeType: "Constant",
							value: 1,
							lineno: undefined,
							col_offset: undefined,
						},
						children: [
							{
								nodeType: "Constant",
								value: 2,
								lineno: undefined,
								col_offset: undefined,
							},
						],
					},
				],
			} as unknown as ASTNode & {
				body: (ASTNode & {
					child: ASTNode;
					children: ASTNode[];
				})[];
			};
			const fixed = fixMissingLocations(raw) as typeof raw;
			const wrapper = fixed.body[0];
			expect(wrapper.child.lineno).toBe(7);
			expect(wrapper.child.col_offset).toBe(2);
			expect(wrapper.children[0].lineno).toBe(7);
			expect(wrapper.children[0].col_offset).toBe(2);
		});

		test("fixMissingLocations skips primitive items inside array fields", () => {
			const module = parseCode("global a, b\n");
			expect(() => fixMissingLocations(module)).not.toThrow();
		});

		test("fixMissingLocations fills in missing end_lineno/end_col_offset", () => {
			const node = {
				nodeType: "Name",
				lineno: 1,
				col_offset: 0,
				end_lineno: undefined,
				end_col_offset: undefined,
			} as unknown as ASTNode;
			const fixed = fixMissingLocations(node) as unknown as {
				end_lineno: number;
				end_col_offset: number;
			};
			expect(fixed.end_lineno).toBe(1);
			expect(fixed.end_col_offset).toBe(0);
		});

		test("incrementLineno shifts lineno/end_lineno recursively", () => {
			const module = parseCode("x = 1\ny = 2\n");
			const shifted = incrementLineno(module, 10) as Module;
			expect(shifted.body[0].lineno).toBe(11);
			expect(shifted.body[1].lineno).toBe(12);
		});

		test("incrementLineno defaults to shifting by 1", () => {
			const module = parseCode("x = 1\n");
			const shifted = incrementLineno(module) as Module;
			expect(shifted.body[0].lineno).toBe(2);
		});

		test("incrementLineno skips primitive items inside array fields", () => {
			const module = parseCode("global a, b\n");
			expect(() => incrementLineno(module)).not.toThrow();
		});

		test("incrementLineno shifts a numeric end_lineno field", () => {
			const node = {
				nodeType: "Name",
				lineno: 1,
				col_offset: 0,
				end_lineno: 1,
				end_col_offset: 5,
			} as unknown as ASTNode;
			const shifted = incrementLineno(node, 3) as unknown as {
				end_lineno: number;
			};
			expect(shifted.end_lineno).toBe(4);
		});
	});

	describe("real file parsing via fs (parseFile placeholder validation)", () => {
		test("reading file contents and parsing them works even though parseFile itself does not", () => {
			const dir = mkdtempSync(join(tmpdir(), "py-ast-test-"));
			const filePath = join(dir, "sample.py");
			try {
				writeFileSync(filePath, "x = 1 + 2\n", "utf-8");
				expect(existsSync(filePath)).toBe(true);
				expect(() => parseFile(filePath)).toThrow();
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	});
});
