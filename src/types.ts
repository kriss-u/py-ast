/**
 * Python AST Types based on the ASDL grammar
 * This provides TypeScript interfaces for all Python AST nodes
 */

/**
 * Base interface for all AST nodes.
 *
 * @remarks
 * Location fields are optional here because some synthetic/helper nodes
 * (e.g. operator singletons like `Add`, `Load`) are not required to carry
 * source positions. {@link Located} narrows these to required fields for
 * nodes that always originate from parsed source.
 */
export interface ASTNode {
	readonly nodeType: string;
	/** 1-indexed source line the node starts on. */
	lineno?: number;
	/** 0-indexed byte offset (UTF-8) within `lineno` where the node starts. */
	col_offset?: number;
	/** 1-indexed source line the node ends on. */
	end_lineno?: number;
	/** 0-indexed byte offset (UTF-8) within `end_lineno` where the node ends. */
	end_col_offset?: number;
	/** Optional inline comment attached to this node. */
	inlineComment?: Comment;
}

/**
 * Base interface for nodes that can have location attributes.
 *
 * Mirrors CPython AST nodes declared with an ASDL `attributes (...)` clause:
 * `lineno` and `col_offset` are always present, while `end_lineno` and
 * `end_col_offset` remain optional for compatibility with grammars/targets
 * that don't populate end positions.
 */
export interface Located extends ASTNode {
	lineno: number;
	col_offset: number;
	end_lineno?: number;
	end_col_offset?: number;
}

/**
 * A source comment captured during parsing (not part of the Python `ast`
 * grammar itself; a py-ast extension for round-tripping comments).
 */
export interface Comment extends Located {
	nodeType: "Comment";
	value: string;
	/** True if this comment appears on the same line as other content (a trailing comment) rather than on its own line. */
	inline?: boolean;
}

// ==== Module nodes ====
/**
 * The `mod` sum type: the root node produced by parsing, one variant per
 * parse mode (`exec`, `single`/interactive, `eval`, or a function type comment).
 */
export type ModuleNode = Module | Interactive | Expression | FunctionType;

/** The root node of a Python file/module parsed in `exec` mode. */
export interface Module extends Located {
	nodeType: "Module";
	body: StmtNode[];
	/** All comments found in the module when the `comments: true` parse option is enabled. */
	comments?: Comment[];
}

/** The root node produced when parsing a single interactive statement (REPL-style input). */
export interface Interactive extends Located {
	nodeType: "Interactive";
	body: StmtNode[];
}

/** The root node produced when parsing a single expression (`eval` mode). */
export interface Expression extends Located {
	nodeType: "Expression";
	body: ExprNode;
}

/** Represents a parsed function type comment, e.g. `# type: (int, str) -> bool`. */
export interface FunctionType extends Located {
	nodeType: "FunctionType";
	argtypes: ExprNode[];
	returns: ExprNode;
}

// ==== Statement nodes ====
/** The `stmt` sum type: every kind of Python statement, plus `Comment` as a py-ast extension. */
export type StmtNode =
	| FunctionDef
	| AsyncFunctionDef
	| ClassDef
	| Return
	| Delete
	| Assign
	| TypeAlias
	| AugAssign
	| AnnAssign
	| For
	| AsyncFor
	| While
	| If
	| With
	| AsyncWith
	| Match
	| Raise
	| Try
	| TryStar
	| Assert
	| Import
	| ImportFrom
	| Global
	| Nonlocal
	| Expr
	| Pass
	| Break
	| Continue
	| Comment;

/** A `def` function definition, e.g. `def f(x: int) -> bool: ...`. */
export interface FunctionDef extends Located {
	nodeType: "FunctionDef";
	name: string;
	args: Arguments;
	body: StmtNode[];
	decorator_list: ExprNode[];
	returns?: ExprNode;
	type_comment?: string;
	type_params: TypeParamNode[];
}

/** An `async def` function definition. */
export interface AsyncFunctionDef extends Located {
	nodeType: "AsyncFunctionDef";
	name: string;
	args: Arguments;
	body: StmtNode[];
	decorator_list: ExprNode[];
	returns?: ExprNode;
	type_comment?: string;
	type_params: TypeParamNode[];
}

/** A `class` definition, e.g. `class Foo(Base, meta=Meta): ...`. */
export interface ClassDef extends Located {
	nodeType: "ClassDef";
	name: string;
	bases: ExprNode[];
	keywords: Keyword[];
	body: StmtNode[];
	decorator_list: ExprNode[];
	type_params: TypeParamNode[];
}

/** A `return` statement, optionally with a value. */
export interface Return extends Located {
	nodeType: "Return";
	value?: ExprNode;
}

/** A `del` statement, e.g. `del x, y[0]`. */
export interface Delete extends Located {
	nodeType: "Delete";
	targets: ExprNode[];
}

/** A simple assignment, e.g. `x = y = 1` (`targets` holds each assignment target). */
export interface Assign extends Located {
	nodeType: "Assign";
	targets: ExprNode[];
	value: ExprNode;
	type_comment?: string;
}

/** A PEP 695 `type` alias statement, e.g. `type Alias[T] = list[T]`. */
export interface TypeAlias extends Located {
	nodeType: "TypeAlias";
	name: ExprNode;
	type_params: TypeParamNode[];
	value: ExprNode;
}

/** An augmented assignment, e.g. `x += 1`. */
export interface AugAssign extends Located {
	nodeType: "AugAssign";
	target: ExprNode;
	op: OperatorNode;
	value: ExprNode;
}

/** An annotated assignment, e.g. `x: int = 1` or `self.x: int`. */
export interface AnnAssign extends Located {
	nodeType: "AnnAssign";
	target: ExprNode;
	annotation: ExprNode;
	value?: ExprNode;
	/** 1 if `target` is an unparenthesized bare name (e.g. `x: int`), 0 otherwise (e.g. `(x): int` or `self.x: int`). */
	simple: number;
}

/** A `for` loop; `orelse` holds the body of the loop's `else` clause, if any. */
export interface For extends Located {
	nodeType: "For";
	target: ExprNode;
	iter: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
	type_comment?: string;
}

/** An `async for` loop; `orelse` holds the body of the loop's `else` clause, if any. */
export interface AsyncFor extends Located {
	nodeType: "AsyncFor";
	target: ExprNode;
	iter: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
	type_comment?: string;
}

/** A `while` loop; `orelse` holds the body of the loop's `else` clause, if any. */
export interface While extends Located {
	nodeType: "While";
	test: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
}

/** An `if` statement; `orelse` holds the `elif`/`else` branch (nested `If` nodes chain `elif`s). */
export interface If extends Located {
	nodeType: "If";
	test: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
}

/** A `with` statement, e.g. `with open(f) as fh: ...`. */
export interface With extends Located {
	nodeType: "With";
	items: WithItem[];
	body: StmtNode[];
	type_comment?: string;
}

/** An `async with` statement. */
export interface AsyncWith extends Located {
	nodeType: "AsyncWith";
	items: WithItem[];
	body: StmtNode[];
	type_comment?: string;
}

/** A `match` statement (structural pattern matching, PEP 634). */
export interface Match extends Located {
	nodeType: "Match";
	subject: ExprNode;
	cases: MatchCase[];
}

/** A `raise` statement, optionally re-raising `exc` and/or chaining `from cause`. */
export interface Raise extends Located {
	nodeType: "Raise";
	exc?: ExprNode;
	cause?: ExprNode;
}

/** A `try`/`except`/`else`/`finally` statement. */
export interface Try extends Located {
	nodeType: "Try";
	body: StmtNode[];
	handlers: ExceptHandler[];
	orelse: StmtNode[];
	finalbody: StmtNode[];
}

/** A `try`/`except*`/`else`/`finally` statement (PEP 654 exception groups). */
export interface TryStar extends Located {
	nodeType: "TryStar";
	body: StmtNode[];
	handlers: ExceptHandler[];
	orelse: StmtNode[];
	finalbody: StmtNode[];
}

/** An `assert` statement, optionally with a failure message. */
export interface Assert extends Located {
	nodeType: "Assert";
	test: ExprNode;
	msg?: ExprNode;
}

/** An `import` statement, e.g. `import a, b as c`. */
export interface Import extends Located {
	nodeType: "Import";
	names: Alias[];
}

/** A `from ... import ...` statement. */
export interface ImportFrom extends Located {
	nodeType: "ImportFrom";
	module?: string;
	names: Alias[];
	/** Number of leading dots for relative imports (e.g. `from . import x` is level 1); absent/undefined for absolute imports. */
	level?: number;
}

/** A `global` statement. */
export interface Global extends Located {
	nodeType: "Global";
	names: string[];
}

/** A `nonlocal` statement. */
export interface Nonlocal extends Located {
	nodeType: "Nonlocal";
	names: string[];
}

/** An expression used as a statement (its value is discarded), e.g. a bare function call. */
export interface Expr extends Located {
	nodeType: "Expr";
	value: ExprNode;
}

/** A `pass` statement. */
export interface Pass extends Located {
	nodeType: "Pass";
}

/** A `break` statement. */
export interface Break extends Located {
	nodeType: "Break";
}

/** A `continue` statement. */
export interface Continue extends Located {
	nodeType: "Continue";
}

// ==== Expression nodes ====
/** The `expr` sum type: every kind of Python expression. */
export type ExprNode =
	| BoolOp
	| NamedExpr
	| BinOp
	| UnaryOp
	| Lambda
	| IfExp
	| Dict
	| Set
	| ListComp
	| SetComp
	| DictComp
	| GeneratorExp
	| Await
	| Yield
	| YieldFrom
	| Compare
	| Call
	| FormattedValue
	| Interpolation
	| JoinedStr
	| TemplateStr
	| Constant
	| Attribute
	| Subscript
	| Starred
	| Name
	| List
	| Tuple
	| Slice;

/** A boolean operation chain, e.g. `a and b and c` (short-circuiting `and`/`or`). */
export interface BoolOp extends Located {
	nodeType: "BoolOp";
	op: BoolOpNode;
	values: ExprNode[];
}

/** A named expression / "walrus" assignment, e.g. `(x := 1)`. */
export interface NamedExpr extends Located {
	nodeType: "NamedExpr";
	target: ExprNode;
	value: ExprNode;
}

/** A binary operation, e.g. `a + b`. */
export interface BinOp extends Located {
	nodeType: "BinOp";
	left: ExprNode;
	op: OperatorNode;
	right: ExprNode;
}

/** A unary operation, e.g. `-x`, `not x`. */
export interface UnaryOp extends Located {
	nodeType: "UnaryOp";
	op: UnaryOpNode;
	operand: ExprNode;
}

/** A `lambda` expression. */
export interface Lambda extends Located {
	nodeType: "Lambda";
	args: Arguments;
	body: ExprNode;
}

/** A conditional (ternary) expression, e.g. `a if test else b`. */
export interface IfExp extends Located {
	nodeType: "IfExp";
	test: ExprNode;
	body: ExprNode;
	orelse: ExprNode;
}

/** A dict display, e.g. `{k: v, **rest}`. */
export interface Dict extends Located {
	nodeType: "Dict";
	/** Parallel to `values`; a `null` entry marks a `**dict` unpacking at that position (its value is the corresponding entry in `values`). */
	keys: (ExprNode | null)[];
	values: ExprNode[];
}

/** A set display, e.g. `{1, 2, 3}`. */
export interface Set extends Located {
	nodeType: "Set";
	elts: ExprNode[];
}

/** A list comprehension, e.g. `[x for x in xs if x]`. */
export interface ListComp extends Located {
	nodeType: "ListComp";
	elt: ExprNode;
	generators: Comprehension[];
}

/** A set comprehension, e.g. `{x for x in xs}`. */
export interface SetComp extends Located {
	nodeType: "SetComp";
	elt: ExprNode;
	generators: Comprehension[];
}

/** A dict comprehension, e.g. `{k: v for k, v in items}`. */
export interface DictComp extends Located {
	nodeType: "DictComp";
	key: ExprNode;
	value: ExprNode;
	generators: Comprehension[];
}

/** A generator expression, e.g. `(x for x in xs)`. */
export interface GeneratorExp extends Located {
	nodeType: "GeneratorExp";
	elt: ExprNode;
	generators: Comprehension[];
}

/** An `await` expression. */
export interface Await extends Located {
	nodeType: "Await";
	value: ExprNode;
}

/** A `yield` expression, optionally with a value. */
export interface Yield extends Located {
	nodeType: "Yield";
	value?: ExprNode;
}

/** A `yield from` expression. */
export interface YieldFrom extends Located {
	nodeType: "YieldFrom";
	value: ExprNode;
}

/**
 * A chained comparison, e.g. `a < b < c`.
 *
 * @remarks
 * Represented as a sequence (`left`, then `ops`/`comparators` pairwise) so
 * that `a < b < c` can be distinguished from `(a < b) < c`.
 */
export interface Compare extends Located {
	nodeType: "Compare";
	left: ExprNode;
	ops: CmpOpNode[];
	comparators: ExprNode[];
}

/** A function/callable call, e.g. `f(a, b, *args, kw=1, **kwargs)`. */
export interface Call extends Located {
	nodeType: "Call";
	func: ExprNode;
	args: ExprNode[];
	keywords: Keyword[];
}

/** A single `{value}` replacement field within an f-string. */
export interface FormattedValue extends Located {
	nodeType: "FormattedValue";
	value: ExprNode;
	/** Conversion code applied before formatting: -1 = none, 115 = `!s`, 114 = `!r`, 97 = `!a` (ASCII codes of s/r/a). */
	conversion: number;
	format_spec?: ExprNode;
}

/** An f-string, represented as a sequence of literal `Constant` parts and `FormattedValue` replacement fields. */
export interface JoinedStr extends Located {
	nodeType: "JoinedStr";
	values: ExprNode[];
	/** Original quote/prefix style of the string, e.g. `f"`, `f'`. */
	kind?: string;
}

/**
 * A single `{value}` interpolation field within a t-string (PEP 750
 * template string, Python 3.14+).
 *
 * @remarks
 * Unlike {@link FormattedValue}, an `Interpolation` also carries `str`: the
 * verbatim source text of the interpolated expression (before any `!conv`
 * or `:format_spec`), as `string.templatelib.Interpolation` exposes it at
 * runtime.
 */
export interface Interpolation extends Located {
	nodeType: "Interpolation";
	value: ExprNode;
	/** Verbatim source text of the interpolated expression, exactly as written. */
	str: string;
	/** Conversion code applied before formatting: -1 = none, 115 = `!s`, 114 = `!r`, 97 = `!a` (ASCII codes of s/r/a). */
	conversion: number;
	format_spec?: ExprNode;
}

/** A t-string (PEP 750 template string, Python 3.14+), represented as a sequence of literal `Constant` parts and `Interpolation` fields. */
export interface TemplateStr extends Located {
	nodeType: "TemplateStr";
	values: ExprNode[];
	/** Original quote/prefix style of the string, e.g. `t"`, `t'`. */
	kind?: string;
}

/**
 * A Python `complex` value, produced by parsing an imaginary literal
 * (e.g. `4j`, `3.5j`). Python's grammar only ever produces a *literal* for
 * the pure-imaginary case, so `real` is `0` for any value the parser
 * constructs; `real` is still exposed so the class can represent a full
 * complex value (e.g. one built up via `evaluateLiteral` from `3 + 4j`),
 * mirroring CPython's `complex` type.
 */
export class PyComplex {
	constructor(
		public readonly real: number,
		public readonly imag: number,
	) {}

	/**
	 * Renders the value the way CPython's `repr()`/`ast.unparse` would, e.g.
	 * `4j`, `-4j`, or `(3+4j)`.
	 */
	toString(): string {
		if (this.real === 0) {
			return `${this.imag}j`;
		}
		const sign = this.imag < 0 ? "" : "+";
		return `(${this.real}${sign}${this.imag}j)`;
	}
}

/** A literal constant: string, number, boolean, `None`, bytes, complex, tuple of constants, or `Ellipsis`. */
export interface Constant extends Located {
	nodeType: "Constant";
	// biome-ignore lint/suspicious/noExplicitAny: could be any type
	value: any;
	kind?: string;
}

/** Attribute access, e.g. `obj.attr`. */
export interface Attribute extends Located {
	nodeType: "Attribute";
	value: ExprNode;
	attr: string;
	ctx: ExprContextNode;
}

/** A subscript operation, e.g. `obj[key]` or `obj[start:stop:step]`. */
export interface Subscript extends Located {
	nodeType: "Subscript";
	value: ExprNode;
	slice: ExprNode;
	ctx: ExprContextNode;
}

/** A starred expression used in an assignment target or call, e.g. `*rest`. */
export interface Starred extends Located {
	nodeType: "Starred";
	value: ExprNode;
	ctx: ExprContextNode;
}

/** An identifier reference, e.g. `x`. */
export interface Name extends Located {
	nodeType: "Name";
	id: string;
	ctx: ExprContextNode;
}

/** A list display, e.g. `[1, 2, 3]`. */
export interface List extends Located {
	nodeType: "List";
	elts: ExprNode[];
	ctx: ExprContextNode;
}

/** A tuple display, e.g. `(1, 2, 3)` or `1, 2, 3`. */
export interface Tuple extends Located {
	nodeType: "Tuple";
	elts: ExprNode[];
	ctx: ExprContextNode;
}

/** A slice, e.g. `1:2:3` — only valid inside a {@link Subscript}. */
export interface Slice extends Located {
	nodeType: "Slice";
	lower?: ExprNode;
	upper?: ExprNode;
	step?: ExprNode;
}

// ==== Expression context ====
/** The `expr_context` sum type: how an expression is being used (read, assigned to, or deleted). */
export type ExprContextNode = Load | Store | Del;

/** Marks an expression as being read/loaded, e.g. `x` in `print(x)`. */
export interface Load extends ASTNode {
	nodeType: "Load";
}

/** Marks an expression as an assignment target, e.g. `x` in `x = 1`. */
export interface Store extends ASTNode {
	nodeType: "Store";
}

/** Marks an expression as a deletion target, e.g. `x` in `del x`. */
export interface Del extends ASTNode {
	nodeType: "Del";
}

// ==== Boolean operators ====
/** The `boolop` sum type used by {@link BoolOp}. */
export type BoolOpNode = And | Or;

/** The `and` operator. */
export interface And extends ASTNode {
	nodeType: "And";
}

/** The `or` operator. */
export interface Or extends ASTNode {
	nodeType: "Or";
}

// ==== Binary operators ====
/** The `operator` sum type used by {@link BinOp} and {@link AugAssign}. */
export type OperatorNode =
	| Add
	| Sub
	| Mult
	| MatMult
	| Div
	| Mod
	| Pow
	| LShift
	| RShift
	| BitOr
	| BitXor
	| BitAnd
	| FloorDiv;

/** Alias of {@link OperatorNode}, kept for API compatibility. */
export type Operator = OperatorNode;

/** The `+` operator. */
export interface Add extends ASTNode {
	nodeType: "Add";
}

/** The `-` operator. */
export interface Sub extends ASTNode {
	nodeType: "Sub";
}

/** The `*` operator. */
export interface Mult extends ASTNode {
	nodeType: "Mult";
}

/** The `@` matrix multiplication operator. */
export interface MatMult extends ASTNode {
	nodeType: "MatMult";
}

/** The `/` operator. */
export interface Div extends ASTNode {
	nodeType: "Div";
}

/** The `%` operator. */
export interface Mod extends ASTNode {
	nodeType: "Mod";
}

/** The `**` operator. */
export interface Pow extends ASTNode {
	nodeType: "Pow";
}

/** The `<<` operator. */
export interface LShift extends ASTNode {
	nodeType: "LShift";
}

/** The `>>` operator. */
export interface RShift extends ASTNode {
	nodeType: "RShift";
}

/** The `|` operator. */
export interface BitOr extends ASTNode {
	nodeType: "BitOr";
}

/** The `^` operator. */
export interface BitXor extends ASTNode {
	nodeType: "BitXor";
}

/** The `&` operator. */
export interface BitAnd extends ASTNode {
	nodeType: "BitAnd";
}

/** The `//` operator. */
export interface FloorDiv extends ASTNode {
	nodeType: "FloorDiv";
}

// ==== Unary operators ====
/** The `unaryop` sum type used by {@link UnaryOp}. */
export type UnaryOpNode = Invert | Not | UAdd | USub;

/** Alias of {@link UnaryOpNode}, kept for API compatibility. */
export type UnaryOperator = UnaryOpNode;

/** The `~` bitwise inversion operator. */
export interface Invert extends ASTNode {
	nodeType: "Invert";
}

/** The `not` operator. */
export interface Not extends ASTNode {
	nodeType: "Not";
}

/** The unary `+` operator. */
export interface UAdd extends ASTNode {
	nodeType: "UAdd";
}

/** The unary `-` operator. */
export interface USub extends ASTNode {
	nodeType: "USub";
}

// ==== Comparison operators ====
/** The `cmpop` sum type used by {@link Compare}. */
export type CmpOpNode =
	| Eq
	| NotEq
	| Lt
	| LtE
	| Gt
	| GtE
	| Is
	| IsNot
	| In
	| NotIn;

/** Alias of {@link CmpOpNode}, kept for API compatibility. */
export type CompareOperator = CmpOpNode;

/** The `==` operator. */
export interface Eq extends ASTNode {
	nodeType: "Eq";
}

/** The `!=` operator. */
export interface NotEq extends ASTNode {
	nodeType: "NotEq";
}

/** The `<` operator. */
export interface Lt extends ASTNode {
	nodeType: "Lt";
}

/** The `<=` operator. */
export interface LtE extends ASTNode {
	nodeType: "LtE";
}

/** The `>` operator. */
export interface Gt extends ASTNode {
	nodeType: "Gt";
}

/** The `>=` operator. */
export interface GtE extends ASTNode {
	nodeType: "GtE";
}

/** The `is` operator. */
export interface Is extends ASTNode {
	nodeType: "Is";
}

/** The `is not` operator. */
export interface IsNot extends ASTNode {
	nodeType: "IsNot";
}

/** The `in` operator. */
export interface In extends ASTNode {
	nodeType: "In";
}

/** The `not in` operator. */
export interface NotIn extends ASTNode {
	nodeType: "NotIn";
}

// ==== Helper structures ====
/** A single `for ... in ...` clause within a comprehension, including any `if` filters. */
export interface Comprehension extends ASTNode {
	nodeType: "Comprehension";
	target: ExprNode;
	iter: ExprNode;
	ifs: ExprNode[];
	/** 1 if this clause is `async for`, 0 for a plain `for`. */
	is_async: number;
}

/** A single `except`/`except*` clause of a {@link Try}/{@link TryStar}. */
export interface ExceptHandler extends Located {
	nodeType: "ExceptHandler";
	type?: ExprNode;
	name?: string;
	body: StmtNode[];
}

/** The full parameter list of a function or lambda, covering positional-only, regular, `*args`, keyword-only, and `**kwargs` parameters. */
export interface Arguments extends ASTNode {
	nodeType: "Arguments";
	posonlyargs: Arg[];
	args: Arg[];
	vararg?: Arg;
	kwonlyargs: Arg[];
	/** Defaults for `kwonlyargs`, positionally aligned with it; a `null` entry means that keyword-only argument has no default. */
	kw_defaults: (ExprNode | null)[];
	kwarg?: Arg;
	/** Defaults for the trailing portion of `posonlyargs` + `args`, right-aligned (the last default pairs with the last argument). */
	defaults: ExprNode[];
}

/** A single function parameter (name, optional annotation, optional type comment). */
export interface Arg extends Located {
	nodeType: "Arg";
	arg: string;
	annotation?: ExprNode;
	type_comment?: string;
}

/** A keyword argument passed to a call, e.g. `key=value`. */
export interface Keyword extends Located {
	nodeType: "Keyword";
	/** The keyword name; absent/undefined for a `**kwargs` unpacking. */
	arg?: string;
	value: ExprNode;
}

/** An imported name with an optional `as` alias, used by {@link Import} and {@link ImportFrom}. */
export interface Alias extends Located {
	nodeType: "Alias";
	name: string;
	asname?: string;
}

/** A single context manager entry of a {@link With}/{@link AsyncWith}, e.g. `expr as target`. */
export interface WithItem extends ASTNode {
	nodeType: "WithItem";
	context_expr: ExprNode;
	optional_vars?: ExprNode;
}

/** A single `case pattern if guard: body` clause of a {@link Match} statement. */
export interface MatchCase extends ASTNode {
	nodeType: "MatchCase";
	pattern: PatternNode;
	guard?: ExprNode;
	body: StmtNode[];
}

// ==== Pattern nodes (Python 3.10+) ====
/** The `pattern` sum type used by `match`/`case` structural pattern matching (PEP 634). */
export type PatternNode =
	| MatchValue
	| MatchSingleton
	| MatchSequence
	| MatchMapping
	| MatchClass
	| MatchStar
	| MatchAs
	| MatchOr;

/** A value pattern, e.g. `case 1:` or `case SomeEnum.MEMBER:`. */
export interface MatchValue extends Located {
	nodeType: "MatchValue";
	value: ExprNode;
}

/** A singleton pattern, e.g. `case None:`, `case True:`, `case False:`. */
export interface MatchSingleton extends Located {
	nodeType: "MatchSingleton";
	// biome-ignore lint/suspicious/noExplicitAny: could be None, True, False
	value: any;
}

/** A sequence pattern, e.g. `case [a, b, *rest]:`. */
export interface MatchSequence extends Located {
	nodeType: "MatchSequence";
	patterns: PatternNode[];
}

/** A mapping pattern, e.g. `case {"key": value, **rest}:`. */
export interface MatchMapping extends Located {
	nodeType: "MatchMapping";
	keys: ExprNode[];
	patterns: PatternNode[];
	/** Name capturing any remaining mapping keys not otherwise matched (the `**rest` binding), if present. */
	rest?: string;
}

/** A class pattern, e.g. `case Point(x=0, y=0):`. */
export interface MatchClass extends Located {
	nodeType: "MatchClass";
	cls: ExprNode;
	patterns: PatternNode[];
	kwd_attrs: string[];
	kwd_patterns: PatternNode[];
}

/** A `*name` (or bare `*_`) capture within a {@link MatchSequence}. */
export interface MatchStar extends Located {
	nodeType: "MatchStar";
	name?: string;
}

/** An `as` binding pattern, e.g. `case [x] as pair:`; a bare `case _:` wildcard has no `pattern` and no `name`. */
export interface MatchAs extends Located {
	nodeType: "MatchAs";
	pattern?: PatternNode;
	name?: string;
}

/** An `|`-separated alternative pattern, e.g. `case 1 | 2 | 3:`. */
export interface MatchOr extends Located {
	nodeType: "MatchOr";
	patterns: PatternNode[];
}

// ==== Type parameters (Python 3.12+) ====
/** The `type_param` sum type used by PEP 695 generic syntax, e.g. `def f[T](x: T) -> T`. */
export type TypeParamNode = TypeVar | ParamSpec | TypeVarTuple;

/** A single type variable parameter, e.g. the `T` in `class C[T]:`. */
export interface TypeVar extends Located {
	nodeType: "TypeVar";
	name: string;
	bound?: ExprNode;
	default_value?: ExprNode;
}

/** A `ParamSpec` parameter, e.g. the `**P` in `class C[**P]:`. */
export interface ParamSpec extends Located {
	nodeType: "ParamSpec";
	name: string;
	default_value?: ExprNode;
}

/** A `TypeVarTuple` parameter, e.g. the `*Ts` in `class C[*Ts]:`. */
export interface TypeVarTuple extends Located {
	nodeType: "TypeVarTuple";
	name: string;
	default_value?: ExprNode;
}

// ==== Union types for convenience ====
/**
 * The union of every AST node type this library produces or accepts.
 *
 * @remarks
 * Convenience type for consumers (e.g. visitors) that need to accept "any
 * node" without enumerating every sum type individually.
 */
export type ASTNodeUnion =
	| ModuleNode
	| StmtNode
	| ExprNode
	| ExprContextNode
	| BoolOpNode
	| OperatorNode
	| UnaryOpNode
	| CmpOpNode
	| PatternNode
	| TypeParamNode
	| Comprehension
	| ExceptHandler
	| Arguments
	| Arg
	| Keyword
	| Alias
	| WithItem
	| MatchCase
	| Comment;
