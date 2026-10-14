import { describe, expect, test } from "vitest";
import { parse } from "../src/parser.js";
import { unparse } from "../src/unparser.js";
import { cpythonDump } from "./test-helpers.js";

/**
 * Syntax that real-world code (the pinned corpus in `scripts/corpus/repos.json`)
 * uses and py-ast once got wrong. Each row pairs a source snippet with
 * `ast.dump(ast.parse(source).body[-1])` copied verbatim from CPython 3.15,
 * and is checked twice: parsing must produce that tree, and so must parsing
 * `unparse`'s output, so the unparser can't silently change meaning either.
 */
function lastStatementDump(source: string): string {
	return cpythonDump(parse(source).body.at(-1));
}

/** Registers the parse and round-trip checks for a table of `[source, CPython dump]` rows. */
function checkParity(rows: [string, string][]): void {
	test.each(rows)("parses %j like CPython", (source, expected) => {
		expect(lastStatementDump(source)).toBe(expected);
	});
	test.each(rows)("round-trips %j through unparse", (source, expected) => {
		expect(lastStatementDump(unparse(parse(source)))).toBe(expected);
	});
}

describe("f-strings and t-strings (PEP 701/750)", () => {
	checkParity([
		[
			'f"""{ 0\n & 1\n}"""',
			"Expr(value=JoinedStr(values=[FormattedValue(value=BinOp(left=Constant(value=0), op=BitAnd(), right=Constant(value=1)), conversion=-1)]))",
		],
		[
			"f'{x # c\n}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1)]))",
		],
		[
			'f"{a \\\n    } more"',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='a'), conversion=-1), Constant(value=' more')]))",
		],
		[
			"f'{x:\"}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1, format_spec=JoinedStr(values=[Constant(value='\"')]))]))",
		],
		[
			'f"{x:\'}"',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1, format_spec=JoinedStr(values=[Constant(value=\"'\")]))]))",
		],
		[
			"f'''{x:#}'''",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1, format_spec=JoinedStr(values=[Constant(value='#')]))]))",
		],
		[
			"f'{raw:!r}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='raw'), conversion=-1, format_spec=JoinedStr(values=[Constant(value='!r')]))]))",
		],
		[
			"f'{2:{\"{\"}>10}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Constant(value=2), conversion=-1, format_spec=JoinedStr(values=[FormattedValue(value=Constant(value='{'), conversion=-1), Constant(value='>10')]))]))",
		],
		[
			'f"{x:{{1}.pop()}}"',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1, format_spec=JoinedStr(values=[FormattedValue(value=Call(func=Attribute(value=Set(elts=[Constant(value=1)]), attr='pop')), conversion=-1)]))]))",
		],
		[
			"f'{x!r }'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=114)]))",
		],
		[
			"f'{x = !r:^5}'",
			"Expr(value=JoinedStr(values=[Constant(value='x = '), FormattedValue(value=Name(id='x'), conversion=114, format_spec=JoinedStr(values=[Constant(value='^5')]))]))",
		],
		[
			'f"{a +\n    b=}"',
			"Expr(value=JoinedStr(values=[Constant(value='a +\\n    b='), FormattedValue(value=BinOp(left=Name(id='a'), op=Add(), right=Name(id='b')), conversion=114)]))",
		],
		[
			't"""{value =\\\n}"""',
			"Expr(value=TemplateStr(values=[Constant(value='value =\\\\\\n'), Interpolation(value=Name(id='value'), str='value ', conversion=114)]))",
		],
		[
			'f"{1+2 = # c\n}"',
			"Expr(value=JoinedStr(values=[Constant(value='1+2 = \\n'), FormattedValue(value=BinOp(left=Constant(value=1), op=Add(), right=Constant(value=2)), conversion=114)]))",
		],
		[
			't"{ x }"',
			"Expr(value=TemplateStr(values=[Interpolation(value=Name(id='x'), str=' x ', conversion=-1)]))",
		],
		[
			't"{x !r}"',
			"Expr(value=TemplateStr(values=[Interpolation(value=Name(id='x'), str='x ', conversion=114)]))",
		],
		[
			't"{ x = }"',
			"Expr(value=TemplateStr(values=[Constant(value=' x = '), Interpolation(value=Name(id='x'), str=' x ', conversion=114)]))",
		],
		[
			't"""{\n    1 + 2  # comment\n}"""',
			"Expr(value=TemplateStr(values=[Interpolation(value=BinOp(left=Constant(value=1), op=Add(), right=Constant(value=2)), str='\\n    1 + 2  \\n', conversion=-1)]))",
		],
		[
			"f'{a[\"}\"]}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Subscript(value=Name(id='a'), slice=Constant(value='}')), conversion=-1)]))",
		],
		[
			"f'{rf\"{1}\\d\"}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=JoinedStr(values=[FormattedValue(value=Constant(value=1), conversion=-1), Constant(value='\\\\d')]), conversion=-1)]))",
		],
		[
			'f\'{"""a{"""}\'',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Constant(value='a{'), conversion=-1)]))",
		],
		[
			"f'{b\"a\"}'",
			"Expr(value=JoinedStr(values=[FormattedValue(value=Constant(value=b'a'), conversion=-1)]))",
		],
		[
			"f'\\\\N{x}'",
			"Expr(value=JoinedStr(values=[Constant(value='\\\\N'), FormattedValue(value=Name(id='x'), conversion=-1)]))",
		],
		['f"a\\}}b"', "Expr(value=JoinedStr(values=[Constant(value='a\\\\}b')]))"],
		['f"" ""', "Expr(value=JoinedStr())"],
		[
			'"" f"{x}" "" "a"',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1), Constant(value='a')]))",
		],
		[
			'u"a" f"{x}"',
			"Expr(value=JoinedStr(values=[Constant(value='a', kind='u'), FormattedValue(value=Name(id='x'), conversion=-1)]))",
		],
		[
			'f"{x}" u"a"',
			"Expr(value=JoinedStr(values=[FormattedValue(value=Name(id='x'), conversion=-1), Constant(value='a', kind='u')]))",
		],
	]);
});

describe("statements and expressions", () => {
	checkParity([
		[
			"try: pass\nexcept A, B: pass",
			"Try(body=[Pass()], handlers=[ExceptHandler(type=Tuple(elts=[Name(id='A'), Name(id='B')]), body=[Pass()])])",
		],
		[
			"try: pass\nexcept* A, B: pass",
			"TryStar(body=[Pass()], handlers=[ExceptHandler(type=Tuple(elts=[Name(id='A'), Name(id='B')]), body=[Pass()])])",
		],
		[
			"try: pass\nexcept A,: pass",
			"Try(body=[Pass()], handlers=[ExceptHandler(type=Tuple(elts=[Name(id='A')]), body=[Pass()])])",
		],
		[
			"try: pass\nexcept A, B,: pass",
			"Try(body=[Pass()], handlers=[ExceptHandler(type=Tuple(elts=[Name(id='A'), Name(id='B')]), body=[Pass()])])",
		],
		[
			"async def f(): {x async for x in y}",
			"AsyncFunctionDef(name='f', args=arguments(), body=[Expr(value=SetComp(elt=Name(id='x'), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=1)]))])",
		],
		[
			"async def f(): {k: v async for k, v in y}",
			"AsyncFunctionDef(name='f', args=arguments(), body=[Expr(value=DictComp(key=Name(id='k'), value=Name(id='v'), generators=[comprehension(target=Tuple(elts=[Name(id='k', ctx=Store()), Name(id='v', ctx=Store())], ctx=Store()), iter=Name(id='y'), is_async=1)]))])",
		],
		[
			"async def f(): f(x async for x in y)",
			"AsyncFunctionDef(name='f', args=arguments(), body=[Expr(value=Call(func=Name(id='f'), args=[GeneratorExp(elt=Name(id='x'), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=1)])]))])",
		],
		[
			"async def f(): (x async for x in y)",
			"AsyncFunctionDef(name='f', args=arguments(), body=[Expr(value=GeneratorExp(elt=Name(id='x'), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=1)]))])",
		],
		[
			"async def f(): [x for x in y async for z in w]",
			"AsyncFunctionDef(name='f', args=arguments(), body=[Expr(value=ListComp(elt=Name(id='x'), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=0), comprehension(target=Name(id='z', ctx=Store()), iter=Name(id='w'), is_async=1)]))])",
		],
		[
			"[*x for x in y]",
			"Expr(value=ListComp(elt=Starred(value=Name(id='x')), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=0)]))",
		],
		[
			"{*x for x in y}",
			"Expr(value=SetComp(elt=Starred(value=Name(id='x')), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=0)]))",
		],
		[
			"{**d for d in ds}",
			"Expr(value=DictComp(key=Name(id='d'), generators=[comprehension(target=Name(id='d', ctx=Store()), iter=Name(id='ds'), is_async=0)]))",
		],
		[
			"(*x for x in y)",
			"Expr(value=GeneratorExp(elt=Starred(value=Name(id='x')), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=0)]))",
		],
		[
			"f(*x for x in y)",
			"Expr(value=Call(func=Name(id='f'), args=[GeneratorExp(elt=Starred(value=Name(id='x')), generators=[comprehension(target=Name(id='x', ctx=Store()), iter=Name(id='y'), is_async=0)])]))",
		],
		[
			"match a, b:\n case _: pass",
			"Match(subject=Tuple(elts=[Name(id='a'), Name(id='b')]), cases=[match_case(pattern=MatchAs(), body=[Pass()])])",
		],
		[
			"match *a, b:\n case _: pass",
			"Match(subject=Tuple(elts=[Starred(value=Name(id='a')), Name(id='b')]), cases=[match_case(pattern=MatchAs(), body=[Pass()])])",
		],
		[
			"match a,:\n case _: pass",
			"Match(subject=Tuple(elts=[Name(id='a')]), cases=[match_case(pattern=MatchAs(), body=[Pass()])])",
		],
		[
			"match x:\n case 0, *rest: pass",
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchSequence(patterns=[MatchValue(value=Constant(value=0)), MatchStar(name='rest')]), body=[Pass()])])",
		],
		[
			"match x:\n case 0, *rest, : pass",
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchSequence(patterns=[MatchValue(value=Constant(value=0)), MatchStar(name='rest')]), body=[Pass()])])",
		],
		[
			"match x:\n case a, b if a: pass",
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchSequence(patterns=[MatchAs(name='a'), MatchAs(name='b')]), guard=Name(id='a'), body=[Pass()])])",
		],
		[
			'match x:\n case "a" "b": pass',
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchValue(value=Constant(value='ab')), body=[Pass()])])",
		],
		[
			'match x:\n case b"a": pass',
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchValue(value=Constant(value=b'a')), body=[Pass()])])",
		],
		[
			"match x:\n case +1: pass",
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchValue(value=UnaryOp(op=UAdd(), operand=Constant(value=1))), body=[Pass()])])",
		],
		[
			"match x:\n case +1 + 2j: pass",
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchValue(value=BinOp(left=UnaryOp(op=UAdd(), operand=Constant(value=1)), op=Add(), right=Constant(value=2j))), body=[Pass()])])",
		],
		[
			'match x:\n case {"a": 1, **rest,}: pass',
			"Match(subject=Name(id='x'), cases=[match_case(pattern=MatchMapping(keys=[Constant(value='a')], patterns=[MatchValue(value=Constant(value=1))], rest='rest'), body=[Pass()])])",
		],
		["del y,", "Delete(targets=[Name(id='y', ctx=Del())])"],
		["del a, b,; x", "Expr(value=Name(id='x'))"],
		[
			"for a in 1,: pass",
			"For(target=Name(id='a', ctx=Store()), iter=Tuple(elts=[Constant(value=1)]), body=[Pass()])",
		],
		[
			"class A[\n  T: int,\n  U,\n](B): pass",
			"ClassDef(name='A', bases=[Name(id='B')], body=[Pass()], type_params=[TypeVar(name='T', bound=Name(id='int')), TypeVar(name='U')])",
		],
		[
			"def f[T,](): pass",
			"FunctionDef(name='f', args=arguments(), body=[Pass()], type_params=[TypeVar(name='T')])",
		],
		[
			"type X[T,] = T",
			"TypeAlias(name=Name(id='X', ctx=Store()), type_params=[TypeVar(name='T')], value=Name(id='T'))",
		],
		[
			"await x ** 2",
			"Expr(value=BinOp(left=Await(value=Name(id='x')), op=Pow(), right=Constant(value=2)))",
		],
		[
			"-await x",
			"Expr(value=UnaryOp(op=USub(), operand=Await(value=Name(id='x'))))",
		],
		[
			"x[*Ts]",
			"Expr(value=Subscript(value=Name(id='x'), slice=Tuple(elts=[Starred(value=Name(id='Ts'))])))",
		],
		[
			"x[*a or b]",
			"Expr(value=Subscript(value=Name(id='x'), slice=Tuple(elts=[Starred(value=BoolOp(op=Or(), values=[Name(id='a'), Name(id='b')]))])))",
		],
		[
			"x[a, *b]",
			"Expr(value=Subscript(value=Name(id='x'), slice=Tuple(elts=[Name(id='a'), Starred(value=Name(id='b'))])))",
		],
		[
			"(y): int",
			"AnnAssign(target=Name(id='y', ctx=Store()), annotation=Name(id='int'), simple=0)",
		],
		[
			"((y)): int = 1",
			"AnnAssign(target=Name(id='y', ctx=Store()), annotation=Name(id='int'), value=Constant(value=1), simple=0)",
		],
		[
			"with (): pass",
			"With(items=[withitem(context_expr=Tuple())], body=[Pass()])",
		],
		[
			"with (a := b, c): pass",
			"With(items=[withitem(context_expr=Tuple(elts=[NamedExpr(target=Name(id='a', ctx=Store()), value=Name(id='b')), Name(id='c')]))], body=[Pass()])",
		],
		[
			"with (item := 42,): pass",
			"With(items=[withitem(context_expr=Tuple(elts=[NamedExpr(target=Name(id='item', ctx=Store()), value=Constant(value=42))]))], body=[Pass()])",
		],
		[
			"with (a, b) as c: pass",
			"With(items=[withitem(context_expr=Tuple(elts=[Name(id='a'), Name(id='b')]), optional_vars=Name(id='c', ctx=Store()))], body=[Pass()])",
		],
		[
			"with (a := b): pass",
			"With(items=[withitem(context_expr=NamedExpr(target=Name(id='a', ctx=Store()), value=Name(id='b')))], body=[Pass()])",
		],
		[
			"with (a := b), c: pass",
			"With(items=[withitem(context_expr=NamedExpr(target=Name(id='a', ctx=Store()), value=Name(id='b'))), withitem(context_expr=Name(id='c'))], body=[Pass()])",
		],
		['"\\477"', "Expr(value=Constant(value='Ŀ'))"],
		['b"\\477"', "Expr(value=Constant(value=b'?'))"],
	]);
});

describe("identifiers, form feeds, and line continuations", () => {
	test("keywords are matched before NFKC normalization, like CPython", () => {
		// `ｉｆ` isn't the keyword `if`, but normalizes to a name spelled `if`.
		// Not round-trippable: no ASCII spelling of that name exists, so
		// `unparse` (like CPython's `ast.unparse`) writes the keyword.
		expect(lastStatementDump("ｉｆ = 1")).toBe(
			"Assign(targets=[Name(id='if', ctx=Store())], value=Constant(value=1))",
		);
	});

	checkParity([
		[
			"ｗｉｄｔｈ = 1",
			"Assign(targets=[Name(id='width', ctx=Store())], value=Constant(value=1))",
		],
		[
			"𝒞 = 5",
			"Assign(targets=[Name(id='C', ctx=Store())], value=Constant(value=5))",
		],
		[
			"x󠄀 = 4",
			"Assign(targets=[Name(id='x󠄀', ctx=Store())], value=Constant(value=4))",
		],
		[
			"if 1:\n\f    x = 1",
			"If(test=Constant(value=1), body=[Assign(targets=[Name(id='x', ctx=Store())], value=Constant(value=1))])",
		],
		[
			"x = 1 \f+ 2",
			"Assign(targets=[Name(id='x', ctx=Store())], value=BinOp(left=Constant(value=1), op=Add(), right=Constant(value=2)))",
		],
		["class P:\n\\\n    pass", "ClassDef(name='P', body=[Pass()])"],
		[
			"if x:\n  \\\ny",
			"If(test=Name(id='x'), body=[Expr(value=Name(id='y'))])",
		],
		[
			"if x:\n  \\\n  y\n  z",
			"If(test=Name(id='x'), body=[Expr(value=Name(id='y')), Expr(value=Name(id='z'))])",
		],
	]);
});

describe("syntax CPython rejects", () => {
	test.each([
		[
			"try: pass\nexcept A, B as e: pass",
			/multiple exception types must be parenthesized when using 'as'/,
		],
		['f"{x! r}"', /f-string: invalid conversion character/],
		['f"{x!z}"', /f-string: invalid conversion character/],
		['f"{x!r=}"', /f-string: invalid conversion character/],
		["for f() in y: pass", /cannot assign to expression/],
		["[x for f() in y]", /cannot assign to expression/],
		["with a := b: pass", /invalid syntax/],
		["match *a:\n case _: pass", /cannot assign to expression/],
		["async def f(): await await x", /Unexpected token/],
		["async def f(): await -x", /Unexpected token/],
		["x[*a:b]", /Expected ']'/],
		["f'{x:'", /Unterminated f-string literal/],
		['f"\\N{abc"', /Unterminated f-string literal/],
		["f\"{'a\n'}\"", /Unterminated f-string literal/],
		['f"{x:\n}"', /Unterminated f-string literal/],
		["f\"{rf'{x'}\"", /Unterminated f-string literal/],
	])("rejects %j", (source, error) => {
		expect(() => parse(source)).toThrow(error);
	});
});

/**
 * Exact `unparse` output. Where CPython's own `ast.unparse` is valid, this
 * matches it (e.g. parenthesizing every walrus and non-statement `yield`);
 * where it isn't (`f'{0:{{}'`, `{**a if b else c for a in d}`, a lone tuple
 * with-item re-split into two items, a dropped `u` prefix), py-ast's output
 * is verified to reparse in CPython to the original tree.
 */
describe("unparse output", () => {
	test.each([
		["f((yield 1), 1)", "f((yield 1), 1)"],
		["if (yield): pass", "if (yield):\n    pass"],
		["yield 1, (yield 2), 3", "yield (1, (yield 2), 3)"],
		["x = yield 1", "x = (yield 1)"],
		["x = yield from y", "x = (yield from y)"],
		["(y := 1)", "(y := 1)"],
		['f"{(x := 1)}"', 'f"{(x := 1)}"'],
		['f"{(lambda: 1)}"', 'f"{(lambda: 1)}"'],
		["await (await x)", "await (await x)"],
		["await (a + b)", "await (a + b)"],
		["lambda a, /: a", "lambda a, /: a"],
		[
			"match x:\n case (0 | 1) | 2: pass",
			"match x:\n    case (0 | 1) | 2:\n        pass",
		],
		[
			"match x:\n case (0 as w) as z: pass",
			"match x:\n    case (0 as w) as z:\n        pass",
		],
		['x = "..."', 'x = "..."'],
		["x = ...", "x = ..."],
		["x = 1e1000j", "x = 1e309j"],
		["x = -1e1000j", "x = -1e309j"],
		['f"{0:\\x7b}"', 'f"{0:\\x7b}"'],
		["with (a := b, c): pass", "with (((a := b), c)):\n    pass"],
		[
			"async def f():\n    async with ((a, b)): pass",
			"async def f():\n    async with ((a, b)):\n        pass",
		],
		['x = u"a" f"{b}"', 'x = u"a" f"{b}"'],
		['x = f"{b}" u"a"', 'x = f"{b}" u"a"'],
		['x = u"a" f""', 'x = u"a" f""'],
		["(y): int = 1", "(y): int = 1"],
		["{**(a if b else c) for a in d}", "{**(a if b else c) for a in d}"],
		["x[*Ts]", "x[*Ts]"],
		['t"{ x = }"', 't" x = { x !r}"'],
	])("unparses %j", (source, expected) => {
		expect(unparse(parse(source))).toBe(expected);
	});
});
