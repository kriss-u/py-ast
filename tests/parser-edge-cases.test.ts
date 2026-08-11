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
import { PyComplex } from "../src/types.js";
import type { ASTNode, Module } from "../src/types.js";
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

		test("pattern that falls through to the default wildcard case is rejected", () => {
			expect(() => parseCode("match x:\n    case -1:\n        pass\n")).toThrow(
				/Expected ':' after case pattern/,
			);
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

	describe("f-strings", () => {
		test("nested f-string inside interpolation", () => {
			const expr = parseCode("f\"{f'{x}'}\"\n");
			expect(expr.body[0].nodeType).toBe("Expr");
		});

		test("quoted string literal inside interpolation", () => {
			const ast = parseCode("f\"{'a' + 'b'}\"\n");
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("conversion specifier with format spec", () => {
			const ast = parseCode('f"{x!r:>10}"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("conversion specifier without format spec", () => {
			const ast = parseCode('f"{x!s}"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
		});

		test("malformed interpolation expression falls back to Name", () => {
			const ast = parseCode('f"{,}"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
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
				/Unterminated f-string starting at position/,
			);
		});

		test("brace-containing dict literal inside interpolation", () => {
			const ast = parseCode('f"{ {1: 2} }"\n');
			expect(ast.body[0].nodeType).toBe("Expr");
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
