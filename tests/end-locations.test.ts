import { describe, expect, test } from "vitest";
import { parse } from "../src/parser.js";
import type {
	Assign,
	ClassDef,
	Compare,
	Expr,
	For,
	FormattedValue,
	FunctionDef,
	If,
	Import,
	ImportFrom,
	JoinedStr,
	Match,
	Try,
} from "../src/types.js";

describe("end_lineno / end_col_offset", () => {
	test("simple binop expression", () => {
		const mod = parse("x = 1 + 2\n");
		const assign = mod.body[0] as Assign;
		expect(assign.end_lineno).toBe(1);
		expect(assign.end_col_offset).toBe(9);
		expect(assign.value.end_lineno).toBe(1);
		expect(assign.value.end_col_offset).toBe(9);
	});

	test("multi-line triple-quoted string", () => {
		const mod = parse('x = """abc\ndef"""\n');
		const assign = mod.body[0] as Assign;
		expect(assign.value.lineno).toBe(1);
		expect(assign.value.col_offset).toBe(4);
		expect(assign.value.end_lineno).toBe(2);
		expect(assign.value.end_col_offset).toBe(6);
	});

	test("implicit string concatenation across lines", () => {
		const mod = parse('y = ("a"\n     "b")\n');
		const assign = mod.body[0] as Assign;
		expect(assign.end_lineno).toBe(2);
		expect(assign.end_col_offset).toBe(9);
	});

	test("function body end excludes the closing DEDENT", () => {
		const mod = parse("def f(x, y=1):\n    return x + y\n");
		const fn = mod.body[0] as FunctionDef;
		expect(fn.end_lineno).toBe(2);
		expect(fn.end_col_offset).toBe(16);
	});

	test("class body end", () => {
		const mod = parse("class A(B, metaclass=C):\n    pass\n");
		const cls = mod.body[0] as ClassDef;
		expect(cls.end_lineno).toBe(2);
		expect(cls.end_col_offset).toBe(8);
	});

	test("if/elif/else end tracks the else clause, not the primary body", () => {
		const mod = parse("if a:\n    x = 1\nelse:\n    y = 2\n");
		const stmt = mod.body[0] as If;
		expect(stmt.end_lineno).toBe(4);
		expect(stmt.end_col_offset).toBe(9);
	});

	test("for/else end tracks the else clause", () => {
		const mod = parse("for i in r:\n    pass\nelse:\n    pass\n");
		const stmt = mod.body[0] as For;
		expect(stmt.end_lineno).toBe(4);
		expect(stmt.end_col_offset).toBe(8);
	});

	test("try end tracks finally over else/except/body", () => {
		const mod = parse(
			"try:\n    pass\nexcept Exception as e:\n    pass\nelse:\n    pass\nfinally:\n    pass\n",
		);
		const stmt = mod.body[0] as Try;
		expect(stmt.end_lineno).toBe(8);
		expect(stmt.end_col_offset).toBe(8);
	});

	test("try/except without else/finally tracks the last handler's body", () => {
		const mod = parse("try:\n    pass\nexcept A:\n    x = 1\n");
		const stmt = mod.body[0] as Try;
		expect(stmt.end_lineno).toBe(4);
		expect(stmt.end_col_offset).toBe(9);
	});

	test("match end tracks the last case's body", () => {
		const mod = parse(
			"match x:\n    case 1:\n        pass\n    case _:\n        y = 2\n",
		);
		const stmt = mod.body[0] as Match;
		expect(stmt.end_lineno).toBe(5);
		expect(stmt.end_col_offset).toBe(13);
	});

	test("import alias positions are per-name, not the statement start", () => {
		const mod = parse("import os.path as p, sys\n");
		const imp = mod.body[0] as Import;
		const [osPath, sys] = imp.names;
		expect(osPath.lineno).toBe(1);
		expect(osPath.col_offset).toBe(7);
		expect(osPath.end_lineno).toBe(1);
		expect(osPath.end_col_offset).toBe(19);
		expect(sys.lineno).toBe(1);
		expect(sys.col_offset).toBe(21);
		expect(sys.end_col_offset).toBe(24);
	});

	test("from-import alias positions, including a multi-line parenthesized list", () => {
		const mod = parse("from a import (b as c,\n    d)\n");
		const imp = mod.body[0] as ImportFrom;
		const [b, d] = imp.names;
		expect(b.lineno).toBe(1);
		expect(b.col_offset).toBe(15);
		expect(b.end_col_offset).toBe(21);
		expect(d.lineno).toBe(2);
		expect(d.col_offset).toBe(4);
		expect(d.end_col_offset).toBe(5);
	});

	test("from-import star alias position", () => {
		const mod = parse("from a import *\n");
		const imp = mod.body[0] as ImportFrom;
		expect(imp.names[0].lineno).toBe(1);
		expect(imp.names[0].col_offset).toBe(14);
		expect(imp.names[0].end_col_offset).toBe(15);
	});

	test("a defaulted parameter's end excludes its default value", () => {
		const mod = parse("def f(y=1, z: int = 2):\n    pass\n");
		const fn = mod.body[0] as FunctionDef;
		const [y, z] = fn.args.args;
		expect(y.end_col_offset).toBe(7); // just "y", not "y=1"
		expect(z.end_col_offset).toBe(17); // "z: int", not "z: int = 2"
	});

	test("call keyword/starred argument positions start at their own token, not the value", () => {
		const mod = parse("foo(*args, key=value, **kwargs)\n");
		const call = (mod.body[0] as Expr).value as import("../src/types.js").Call;
		expect(call.args[0].col_offset).toBe(4); // Starred at '*'
		expect(call.keywords[0].col_offset).toBe(11); // Keyword at 'key'
		expect(call.keywords[1].col_offset).toBe(22); // **kwargs at '**'
	});

	test("line-continuation backslash does not double-count the line number", () => {
		const mod = parse("x = a \\\n    + b\n");
		const assign = mod.body[0] as Assign;
		expect(assign.end_lineno).toBe(2);
		expect(assign.end_col_offset).toBe(7);
	});

	describe("f-strings", () => {
		test("interpolation positions are real source positions, not (0,0)-relative", () => {
			const mod = parse('x = f"hello {name} world {value!r:>10}"\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			expect(joinedStr.lineno).toBe(1);
			expect(joinedStr.col_offset).toBe(4);
			expect(joinedStr.end_lineno).toBe(1);
			expect(joinedStr.end_col_offset).toBe(39);

			const [helloConst, nameField, worldConst, valueField] = joinedStr.values;
			expect(helloConst.col_offset).toBe(6);
			expect(helloConst.end_col_offset).toBe(12);

			const name = nameField as FormattedValue;
			expect(name.col_offset).toBe(12);
			expect(name.end_col_offset).toBe(18);
			expect(name.value.lineno).toBe(1);
			expect(name.value.col_offset).toBe(13);
			expect(name.value.end_col_offset).toBe(17);

			expect(worldConst.col_offset).toBe(18);
			expect(worldConst.end_col_offset).toBe(25);

			const value = valueField as FormattedValue;
			expect(value.col_offset).toBe(25);
			expect(value.end_col_offset).toBe(38);
			expect(value.value.col_offset).toBe(26);
			expect(value.value.end_col_offset).toBe(31);
			expect(value.format_spec?.lineno).toBe(1);
			expect(value.format_spec?.col_offset).toBe(33); // starts at the ':'
			expect(value.format_spec?.end_col_offset).toBe(37);
		});

		test("self-documenting {expr=} positions", () => {
			const mod = parse('x = f"{a=}"\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			const [selfDocConst, field] = joinedStr.values;
			expect(selfDocConst.col_offset).toBe(7);
			expect(selfDocConst.end_col_offset).toBe(9);
			const formatted = field as FormattedValue;
			expect(formatted.col_offset).toBe(6);
			expect(formatted.end_col_offset).toBe(10);
			expect(formatted.value.col_offset).toBe(7);
			expect(formatted.value.end_col_offset).toBe(8);
		});

		test("multi-line f-string advances lineno for later segments", () => {
			const mod = parse('x = f"""line1 {a}\nline2 {b}"""\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			const [line1Const, aField, line2Const, bField] = joinedStr.values;
			expect(line1Const.lineno).toBe(1);
			expect(line1Const.end_lineno).toBe(1);
			const aFormatted = aField as FormattedValue;
			expect(aFormatted.lineno).toBe(1);
			expect(aFormatted.end_lineno).toBe(1);
			expect(line2Const.lineno).toBe(1);
			expect(line2Const.end_lineno).toBe(2);
			expect(line2Const.end_col_offset).toBe(6);
			const bFormatted = bField as FormattedValue;
			expect(bFormatted.lineno).toBe(2);
			expect(bFormatted.col_offset).toBe(6);
			expect(bFormatted.end_lineno).toBe(2);
			expect(bFormatted.end_col_offset).toBe(9);
			expect(joinedStr.end_lineno).toBe(2);
			expect(joinedStr.end_col_offset).toBe(12);
		});

		test("nested f-string positions are shifted correctly at every level", () => {
			const mod = parse("x = f\"{f'{y}'}\"\n");
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			const outerField = joinedStr.values[0] as FormattedValue;
			expect(outerField.col_offset).toBe(6);
			expect(outerField.end_col_offset).toBe(14);
			const innerJoinedStr = outerField.value as JoinedStr;
			expect(innerJoinedStr.lineno).toBe(1);
			expect(innerJoinedStr.col_offset).toBe(7);
			expect(innerJoinedStr.end_col_offset).toBe(13);
			const innerField = innerJoinedStr.values[0] as FormattedValue;
			expect(innerField.col_offset).toBe(9);
			expect(innerField.end_col_offset).toBe(12);
			expect(innerField.value.col_offset).toBe(10);
			expect(innerField.value.end_col_offset).toBe(11);
		});

		test("concatenated f-strings merge into one JoinedStr with a correct end position", () => {
			const mod = parse("x = f'a' f'b'\n");
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			expect(joinedStr.lineno).toBe(1);
			expect(joinedStr.col_offset).toBe(4);
			expect(joinedStr.end_lineno).toBe(1);
			expect(joinedStr.end_col_offset).toBe(13);
			expect(joinedStr.values).toHaveLength(1);
			expect(joinedStr.values[0].col_offset).toBe(6);
			expect(joinedStr.values[0].end_col_offset).toBe(12);
		});

		test("concatenated multi-line f-strings", () => {
			const mod = parse('x = (\n    f"first {a}"\n    f"second {b}"\n)\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			expect(joinedStr.lineno).toBe(2);
			expect(joinedStr.col_offset).toBe(4);
			expect(joinedStr.end_lineno).toBe(3);
			expect(joinedStr.end_col_offset).toBe(17);
		});

		test("a multi-line parenthesized expression inside an interpolation shifts every line, not just the first", () => {
			const mod = parse('x = f"{(\n    a +\n    b\n)}"\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			const field = joinedStr.values[0] as FormattedValue;
			expect(field.lineno).toBe(1);
			expect(field.col_offset).toBe(6);
			expect(field.end_lineno).toBe(4);
			expect(field.end_col_offset).toBe(2);

			const binOp = field.value as import("../src/types.js").BinOp;
			expect(binOp.lineno).toBe(2);
			expect(binOp.col_offset).toBe(4);
			expect(binOp.end_lineno).toBe(3);
			expect(binOp.end_col_offset).toBe(5);
			expect(binOp.left.lineno).toBe(2);
			expect(binOp.right.lineno).toBe(3);

			expect(joinedStr.end_lineno).toBe(4);
			expect(joinedStr.end_col_offset).toBe(3);
		});

		test("a lambda with a bare-* keyword-only parameter inside an interpolation shifts a null kw_defaults entry safely", () => {
			const mod = parse('x = f"{(lambda *, a: a)}"\n');
			const joinedStr = (mod.body[0] as Assign).value as JoinedStr;
			const field = joinedStr.values[0] as FormattedValue;
			const lambda = field.value as import("../src/types.js").Lambda;
			expect(lambda.args.kw_defaults).toEqual([null]);
			expect(lambda.args.kwonlyargs[0].lineno).toBe(1);
			expect(lambda.args.kwonlyargs[0].col_offset).toBe(18);
		});
	});

	describe("a trailing ';' on a suite's last statement extends the enclosing compound statement's end past it", () => {
		// Verified against CPython 3.13: a `;` with nothing else before the
		// line ends is consumed as part of the suite, extending the
		// *compound* statement's own `end_col_offset` by one — but not the
		// last simple statement's own end, which excludes it.
		test("single-line suite", () => {
			const mod = parse("def f(): yield x;\n");
			const fn = mod.body[0] as FunctionDef;
			expect(fn.end_col_offset).toBe(17);
			expect(fn.body[0].end_col_offset).toBe(16);
		});

		test("block-indented suite", () => {
			const mod = parse("if a:\n    x = 1;\n");
			const ifStmt = mod.body[0] as If;
			expect(ifStmt.end_lineno).toBe(2);
			expect(ifStmt.end_col_offset).toBe(10);
			expect(ifStmt.body[0].end_col_offset).toBe(9);
		});

		test("does not leak across an unrelated later statement without a trailing ';'", () => {
			const mod = parse("if a:\n    x = 1;\n    y = 2\n");
			const ifStmt = mod.body[0] as If;
			expect(ifStmt.end_lineno).toBe(3);
			expect(ifStmt.end_col_offset).toBe(9);
		});

		test("does not leak across a nested compound statement", () => {
			const mod = parse("if a:\n    x = 1;\n    if b:\n        y = 2\n");
			const ifStmt = mod.body[0] as If;
			expect(ifStmt.end_lineno).toBe(4);
			expect(ifStmt.end_col_offset).toBe(13);
		});

		test("try/except: the last handler's own end is used, not its raw body array", () => {
			const mod = parse("try:\n    x = 1\nexcept:\n    pass;\n");
			const tryStmt = mod.body[0] as Try;
			expect(tryStmt.end_lineno).toBe(4);
			expect(tryStmt.end_col_offset).toBe(9);
			expect(tryStmt.handlers[0].end_col_offset).toBe(9);
			expect(tryStmt.handlers[0].body[0].end_col_offset).toBe(8);
		});
	});

	test("parenthesized comparison keeps CPython's node-shape quirks unaffected by this change", () => {
		// Regression guard: adding end positions must not disturb existing
		// (already-correct) start-position behavior for ordinary comparisons.
		const mod = parse("x = a < b < c\n");
		const compare = (mod.body[0] as Assign).value as Compare;
		expect(compare.lineno).toBe(1);
		expect(compare.col_offset).toBe(4);
		expect(compare.end_col_offset).toBe(13);
	});
});
