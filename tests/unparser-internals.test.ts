import { describe, expect, test } from "vitest";
import { parse } from "../src/parser.js";
import type {
	Arg,
	Constant,
	Dict,
	Expression,
	FormattedValue,
	FunctionDef,
	FunctionType,
	Interactive,
	Interpolation,
	JoinedStr,
	MatchAs,
	MatchSingleton,
	MatchValue,
	Module,
} from "../src/types.js";
import { PyComplex } from "../src/types.js";
import { unparse } from "../src/unparser.js";
import { ast } from "../src/utils.js";

/**
 * White-box tests for the unparser's defensive/fallback code paths: nodes
 * hand-constructed to bypass `parse()` entirely (malformed shapes, node
 * kinds `parse()` never produces standalone, or shapes at the edge of what
 * the type system allows). These exercise fallback branches that no
 * `parse()`-driven input can reach — see unparser.test.ts for tests of
 * actual Python syntax edge cases.
 */
describe("Unparser Internals", () => {
	describe("Non-finite float constants constructed directly", () => {
		test("a NaN Constant unparses as the (1e309-1e309) arithmetic trick", () => {
			const node: Constant = {
				nodeType: "Constant",
				value: Number.NaN,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("(1e309-1e309)");
		});

		test("a directly-constructed negative-Infinity Constant still unparses correctly", () => {
			// Unlike a parsed `-1e1000` (a `UnaryOp` wrapping a positive-`inf`
			// `Constant`, see unparser.test.ts), a hand-built AST could set
			// `value: -Infinity` directly on a `Constant` — still handled, not
			// just the `UnaryOp`-wrapped form.
			const node: Constant = {
				nodeType: "Constant",
				value: Number.NEGATIVE_INFINITY,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("-1e309");
		});

		test("a Complex value with a nonzero real part (not producible by the parser) unparses as '(re+imj)'", () => {
			// The parser only ever produces a purely-imaginary `Constant` for a
			// literal like `4j`; a `PyComplex` with both a nonzero real and
			// imaginary part only arises from directly overwriting the value,
			// exercising `formatConstant`'s general complex-number branch.
			const tree = parse("4j");
			const exprStmt = tree.body[0] as unknown as {
				value: { value: PyComplex };
			};
			exprStmt.value.value = new PyComplex(3, 4);
			expect(unparse(tree).trim()).toBe("(3+4j)");
			exprStmt.value.value = new PyComplex(3, -4);
			expect(unparse(tree).trim()).toBe("(3-4j)");
		});
	});

	describe("Module-level node kinds constructed directly", () => {
		test("Interactive node renders its statement body", () => {
			const body = parse("a = 1\nb = 2").body;
			const node: Interactive = {
				nodeType: "Interactive",
				body,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("a = 1\nb = 2");
		});

		test("Expression node renders a bare eval-mode body", () => {
			const exprStmt = parse("1 + 2").body[0];
			if (exprStmt.nodeType !== "Expr") throw new Error("expected Expr");
			const node: Expression = {
				nodeType: "Expression",
				body: exprStmt.value,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("1 + 2");
		});

		test("FunctionType node renders a type-comment-style signature", () => {
			const intType = parse("int").body[0];
			const strType = parse("str").body[0];
			const boolType = parse("bool").body[0];
			if (
				intType.nodeType !== "Expr" ||
				strType.nodeType !== "Expr" ||
				boolType.nodeType !== "Expr"
			) {
				throw new Error("expected Expr statements");
			}
			const node: FunctionType = {
				nodeType: "FunctionType",
				argtypes: [intType.value, strType.value],
				returns: boolType.value,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("(int, str) -> bool");
		});

		test("MatchSingleton node renders None/True/False", () => {
			const noneNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: null,
				lineno: 1,
				col_offset: 0,
			};
			const trueNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: true,
				lineno: 1,
				col_offset: 0,
			};
			const falseNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: false,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(noneNode)).toBe("None");
			expect(unparse(trueNode)).toBe("True");
			expect(unparse(falseNode)).toBe("False");
		});

		test("MatchAs node with a wrapped sub-pattern renders 'pattern as name'", () => {
			const valuePattern: MatchValue = {
				nodeType: "MatchValue",
				value: ast.Constant(1),
				lineno: 1,
				col_offset: 0,
			};
			const node: MatchAs = {
				nodeType: "MatchAs",
				pattern: valuePattern,
				name: "p",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("1 as p");
		});

		test("standalone FormattedValue node with a non-JoinedStr format_spec", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: ast.Name("x"),
				conversion: 114,
				format_spec: ast.Name("spec"),
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x!r:spec}");
		});

		test("standalone FormattedValue node with the !s and !a conversions", () => {
			const makeNode = (conversion: number): FormattedValue => ({
				nodeType: "FormattedValue",
				value: ast.Name("x"),
				conversion,
				lineno: 1,
				col_offset: 0,
			});
			expect(unparse(makeNode(115))).toBe("{x!s}");
			expect(unparse(makeNode(97))).toBe("{x!a}");
		});

		test("standalone FormattedValue node with a JoinedStr format_spec", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: ast.Name("x"),
				conversion: -1,
				format_spec: {
					nodeType: "JoinedStr",
					values: [ast.Constant(">10")],
					lineno: 1,
					col_offset: 0,
				},
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x:>10}");
		});

		test("standalone Interpolation node (t-string field visited outside a TemplateStr)", () => {
			const node: Interpolation = {
				nodeType: "Interpolation",
				value: ast.Name("x"),
				str: "x",
				conversion: 114,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x!r}");
		});

		test("JoinedStr value with a non-JoinedStr format_spec on its FormattedValue", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				values: [
					{
						nodeType: "FormattedValue",
						value: ast.Name("x"),
						conversion: -1,
						format_spec: ast.Name("spec"),
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"{x:spec}"');
		});

		test("JoinedStr containing a raw expression value (not Constant/FormattedValue)", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				values: [ast.Name("raw")],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"raw"');
		});

		test("JoinedStr without a kind hint falls back to double-quoted f-string", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				values: [ast.Constant("hi")],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"hi"');
		});

		test("Constant with a value outside the known literal kinds falls back to String()", () => {
			const node: Constant = {
				nodeType: "Constant",
				value: { toString: () => "custom" },
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("custom");
		});
	});

	describe("Indentation detection with irregular hand-built ASTs", () => {
		test("compound statement with an empty body is skipped, falling back to default indent", () => {
			const emptyFunction: FunctionDef = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				col_offset: 0,
			};
			const outer: FunctionDef = {
				nodeType: "FunctionDef",
				name: "g",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 3, col_offset: 4 }],
				decorator_list: [],
				type_params: [],
				lineno: 2,
				col_offset: 0,
			};
			const mod: Module = {
				nodeType: "Module",
				body: [emptyFunction, outer],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(mod)).toBe("def f():\ndef g():\n    pass");
		});

		// The parser always attaches numeric col_offset values; a missing one
		// only occurs on hand-built AST fragments, hence the `any` escape hatch.
		test("compound statement missing col_offset info is skipped by the indent detector", () => {
			// biome-ignore lint/suspicious/noExplicitAny: constructing a deliberately malformed node to exercise a defensive check
			const outer: any = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 1, col_offset: 4 }],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				// col_offset intentionally omitted
			};
			// biome-ignore lint/suspicious/noExplicitAny: constructing a deliberately malformed node to exercise a defensive check
			const mod: any = {
				nodeType: "Module",
				body: [outer],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(mod)).toBe("def f():\n    pass");
		});
	});

	describe("F-string conversion codes outside the known set", () => {
		test("FormattedValue inside a JoinedStr with an unrecognized conversion code writes no conversion marker", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				values: [
					{
						nodeType: "FormattedValue",
						value: ast.Name("x"),
						conversion: 0,
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"{x}"');
		});

		test("standalone FormattedValue with an unrecognized conversion code writes no conversion marker", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: ast.Name("x"),
				conversion: 0,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x}");
		});
	});

	describe("String constant with an unrecognized quote-style kind", () => {
		test("falls back to double-quoted formatting when kind is neither triple nor single/double", () => {
			const node: Constant = {
				nodeType: "Constant",
				value: "hi",
				kind: "z",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('"hi"');
		});
	});

	describe("Dict unpacking entries constructed directly", () => {
		test("a null key renders a '**value' unpacking entry", () => {
			const node: Dict = ast.Dict(
				[ast.Constant("a"), null],
				[ast.Constant(1), ast.Name("rest")],
			);
			expect(unparse(node)).toBe('{"a": 1, **rest}');
		});
	});

	describe("Match pattern nodes with unusual shapes", () => {
		test("MatchSingleton with a value outside None/True/False falls back to String()", () => {
			const node: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: 42,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("42");
		});

		test("MatchAs with neither a wrapped pattern nor a bound name renders the wildcard '_'", () => {
			const node: MatchAs = {
				nodeType: "MatchAs",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("_");
		});
	});

	describe("Keyword-only arguments with a short kw_defaults array", () => {
		test("a keyword-only arg past the end of kw_defaults renders without a default", () => {
			const b: Arg = {
				nodeType: "Arg",
				arg: "b",
				lineno: 1,
				col_offset: 0,
			};
			const func: FunctionDef = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [
						{ nodeType: "Arg", arg: "a", lineno: 1, col_offset: 0 },
						b,
					],
					kw_defaults: [ast.Constant(1)],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 1, col_offset: 0 }],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(func)).toBe("def f(*, a=1, b):\n    pass");
		});
	});
});
