/**
 * Python AST Types based on the ASDL grammar
 * This provides TypeScript interfaces for all Python AST nodes
 */

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
	readonly nodeType: string;
	lineno?: number;
	col_offset?: number;
	end_lineno?: number;
	end_col_offset?: number;
	// Optional inline comment attached to this node
	inlineComment?: Comment;
}

/**
 * Base interface for nodes that can have location attributes
 */
export interface Located extends ASTNode {
	lineno: number;
	col_offset: number;
	end_lineno?: number;
	end_col_offset?: number;
}

/**
 * Comment node interface
 */
export interface Comment extends Located {
	nodeType: "Comment";
	value: string;
	// Indicates if this comment appears on the same line as other content
	inline?: boolean;
}

// ==== Module nodes ====
export type ModuleNode = Module | Interactive | Expression | FunctionType;

export interface Module extends Located {
	nodeType: "Module";
	body: StmtNode[];
	// All comments found in the module when comments: true is enabled
	comments?: Comment[];
}

export interface Interactive extends Located {
	nodeType: "Interactive";
	body: StmtNode[];
}

export interface Expression extends Located {
	nodeType: "Expression";
	body: ExprNode;
}

export interface FunctionType extends Located {
	nodeType: "FunctionType";
	argtypes: ExprNode[];
	returns: ExprNode;
}

// ==== Statement nodes ====
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

export interface ClassDef extends Located {
	nodeType: "ClassDef";
	name: string;
	bases: ExprNode[];
	keywords: Keyword[];
	body: StmtNode[];
	decorator_list: ExprNode[];
	type_params: TypeParamNode[];
}

export interface Return extends Located {
	nodeType: "Return";
	value?: ExprNode;
}

export interface Delete extends Located {
	nodeType: "Delete";
	targets: ExprNode[];
}

export interface Assign extends Located {
	nodeType: "Assign";
	targets: ExprNode[];
	value: ExprNode;
	type_comment?: string;
}

export interface TypeAlias extends Located {
	nodeType: "TypeAlias";
	name: ExprNode;
	type_params: TypeParamNode[];
	value: ExprNode;
}

export interface AugAssign extends Located {
	nodeType: "AugAssign";
	target: ExprNode;
	op: OperatorNode;
	value: ExprNode;
}

export interface AnnAssign extends Located {
	nodeType: "AnnAssign";
	target: ExprNode;
	annotation: ExprNode;
	value?: ExprNode;
	simple: number; // 0 or 1
}

export interface For extends Located {
	nodeType: "For";
	target: ExprNode;
	iter: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
	type_comment?: string;
}

export interface AsyncFor extends Located {
	nodeType: "AsyncFor";
	target: ExprNode;
	iter: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
	type_comment?: string;
}

export interface While extends Located {
	nodeType: "While";
	test: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
}

export interface If extends Located {
	nodeType: "If";
	test: ExprNode;
	body: StmtNode[];
	orelse: StmtNode[];
}

export interface With extends Located {
	nodeType: "With";
	items: WithItem[];
	body: StmtNode[];
	type_comment?: string;
}

export interface AsyncWith extends Located {
	nodeType: "AsyncWith";
	items: WithItem[];
	body: StmtNode[];
	type_comment?: string;
}

export interface Match extends Located {
	nodeType: "Match";
	subject: ExprNode;
	cases: MatchCase[];
}

export interface Raise extends Located {
	nodeType: "Raise";
	exc?: ExprNode;
	cause?: ExprNode;
}

export interface Try extends Located {
	nodeType: "Try";
	body: StmtNode[];
	handlers: ExceptHandler[];
	orelse: StmtNode[];
	finalbody: StmtNode[];
}

export interface TryStar extends Located {
	nodeType: "TryStar";
	body: StmtNode[];
	handlers: ExceptHandler[];
	orelse: StmtNode[];
	finalbody: StmtNode[];
}

export interface Assert extends Located {
	nodeType: "Assert";
	test: ExprNode;
	msg?: ExprNode;
}

export interface Import extends Located {
	nodeType: "Import";
	names: Alias[];
}

export interface ImportFrom extends Located {
	nodeType: "ImportFrom";
	module?: string;
	names: Alias[];
	level?: number;
}

export interface Global extends Located {
	nodeType: "Global";
	names: string[];
}

export interface Nonlocal extends Located {
	nodeType: "Nonlocal";
	names: string[];
}

export interface Expr extends Located {
	nodeType: "Expr";
	value: ExprNode;
}

export interface Pass extends Located {
	nodeType: "Pass";
}

export interface Break extends Located {
	nodeType: "Break";
}

export interface Continue extends Located {
	nodeType: "Continue";
}

// ==== Expression nodes ====
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
	| JoinedStr
	| Constant
	| Attribute
	| Subscript
	| Starred
	| Name
	| List
	| Tuple
	| Slice;

export interface BoolOp extends Located {
	nodeType: "BoolOp";
	op: BoolOpNode;
	values: ExprNode[];
}

export interface NamedExpr extends Located {
	nodeType: "NamedExpr";
	target: ExprNode;
	value: ExprNode;
}

export interface BinOp extends Located {
	nodeType: "BinOp";
	left: ExprNode;
	op: OperatorNode;
	right: ExprNode;
}

export interface UnaryOp extends Located {
	nodeType: "UnaryOp";
	op: UnaryOpNode;
	operand: ExprNode;
}

export interface Lambda extends Located {
	nodeType: "Lambda";
	args: Arguments;
	body: ExprNode;
}

export interface IfExp extends Located {
	nodeType: "IfExp";
	test: ExprNode;
	body: ExprNode;
	orelse: ExprNode;
}

export interface Dict extends Located {
	nodeType: "Dict";
	keys: (ExprNode | null)[]; // null for **dict unpacking
	values: ExprNode[];
}

export interface Set extends Located {
	nodeType: "Set";
	elts: ExprNode[];
}

export interface ListComp extends Located {
	nodeType: "ListComp";
	elt: ExprNode;
	generators: Comprehension[];
}

export interface SetComp extends Located {
	nodeType: "SetComp";
	elt: ExprNode;
	generators: Comprehension[];
}

export interface DictComp extends Located {
	nodeType: "DictComp";
	key: ExprNode;
	value: ExprNode;
	generators: Comprehension[];
}

export interface GeneratorExp extends Located {
	nodeType: "GeneratorExp";
	elt: ExprNode;
	generators: Comprehension[];
}

export interface Await extends Located {
	nodeType: "Await";
	value: ExprNode;
}

export interface Yield extends Located {
	nodeType: "Yield";
	value?: ExprNode;
}

export interface YieldFrom extends Located {
	nodeType: "YieldFrom";
	value: ExprNode;
}

export interface Compare extends Located {
	nodeType: "Compare";
	left: ExprNode;
	ops: CmpOpNode[];
	comparators: ExprNode[];
}

export interface Call extends Located {
	nodeType: "Call";
	func: ExprNode;
	args: ExprNode[];
	keywords: Keyword[];
}

export interface FormattedValue extends Located {
	nodeType: "FormattedValue";
	value: ExprNode;
	conversion: number; // -1 = no formatting, 115 = !s, 114 = !r, 97 = !a
	format_spec?: ExprNode;
}

export interface JoinedStr extends Located {
	nodeType: "JoinedStr";
	values: ExprNode[];
	kind?: string; // Store original quote style (f", f', etc.)
}

export interface Constant extends Located {
	nodeType: "Constant";
	// biome-ignore lint/suspicious/noExplicitAny: could be any type
	value: any; // string, number, boolean, null, etc.
	kind?: string;
}

export interface Attribute extends Located {
	nodeType: "Attribute";
	value: ExprNode;
	attr: string;
	ctx: ExprContextNode;
}

export interface Subscript extends Located {
	nodeType: "Subscript";
	value: ExprNode;
	slice: ExprNode;
	ctx: ExprContextNode;
}

export interface Starred extends Located {
	nodeType: "Starred";
	value: ExprNode;
	ctx: ExprContextNode;
}

export interface Name extends Located {
	nodeType: "Name";
	id: string;
	ctx: ExprContextNode;
}

export interface List extends Located {
	nodeType: "List";
	elts: ExprNode[];
	ctx: ExprContextNode;
}

export interface Tuple extends Located {
	nodeType: "Tuple";
	elts: ExprNode[];
	ctx: ExprContextNode;
}

export interface Slice extends Located {
	nodeType: "Slice";
	lower?: ExprNode;
	upper?: ExprNode;
	step?: ExprNode;
}

// ==== Expression context ====
export type ExprContextNode = Load | Store | Del;

export interface Load extends ASTNode {
	nodeType: "Load";
}

export interface Store extends ASTNode {
	nodeType: "Store";
}

export interface Del extends ASTNode {
	nodeType: "Del";
}

// ==== Boolean operators ====
export type BoolOpNode = And | Or;

export interface And extends ASTNode {
	nodeType: "And";
}

export interface Or extends ASTNode {
	nodeType: "Or";
}

// ==== Binary operators ====
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

// Type alias for compatibility
export type Operator = OperatorNode;

export interface Add extends ASTNode {
	nodeType: "Add";
}

export interface Sub extends ASTNode {
	nodeType: "Sub";
}

export interface Mult extends ASTNode {
	nodeType: "Mult";
}

export interface MatMult extends ASTNode {
	nodeType: "MatMult";
}

export interface Div extends ASTNode {
	nodeType: "Div";
}

export interface Mod extends ASTNode {
	nodeType: "Mod";
}

export interface Pow extends ASTNode {
	nodeType: "Pow";
}

export interface LShift extends ASTNode {
	nodeType: "LShift";
}

export interface RShift extends ASTNode {
	nodeType: "RShift";
}

export interface BitOr extends ASTNode {
	nodeType: "BitOr";
}

export interface BitXor extends ASTNode {
	nodeType: "BitXor";
}

export interface BitAnd extends ASTNode {
	nodeType: "BitAnd";
}

export interface FloorDiv extends ASTNode {
	nodeType: "FloorDiv";
}

// ==== Unary operators ====
export type UnaryOpNode = Invert | Not | UAdd | USub;

// Type alias for compatibility
export type UnaryOperator = UnaryOpNode;

export interface Invert extends ASTNode {
	nodeType: "Invert";
}

export interface Not extends ASTNode {
	nodeType: "Not";
}

export interface UAdd extends ASTNode {
	nodeType: "UAdd";
}

export interface USub extends ASTNode {
	nodeType: "USub";
}

// ==== Comparison operators ====
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

// Type alias for compatibility
export type CompareOperator = CmpOpNode;

export interface Eq extends ASTNode {
	nodeType: "Eq";
}

export interface NotEq extends ASTNode {
	nodeType: "NotEq";
}

export interface Lt extends ASTNode {
	nodeType: "Lt";
}

export interface LtE extends ASTNode {
	nodeType: "LtE";
}

export interface Gt extends ASTNode {
	nodeType: "Gt";
}

export interface GtE extends ASTNode {
	nodeType: "GtE";
}

export interface Is extends ASTNode {
	nodeType: "Is";
}

export interface IsNot extends ASTNode {
	nodeType: "IsNot";
}

export interface In extends ASTNode {
	nodeType: "In";
}

export interface NotIn extends ASTNode {
	nodeType: "NotIn";
}

// ==== Helper structures ====
export interface Comprehension extends ASTNode {
	nodeType: "Comprehension";
	target: ExprNode;
	iter: ExprNode;
	ifs: ExprNode[];
	is_async: number; // 0 or 1
}

export interface ExceptHandler extends Located {
	nodeType: "ExceptHandler";
	type?: ExprNode;
	name?: string;
	body: StmtNode[];
}

export interface Arguments extends ASTNode {
	nodeType: "Arguments";
	posonlyargs: Arg[];
	args: Arg[];
	vararg?: Arg;
	kwonlyargs: Arg[];
	kw_defaults: (ExprNode | null)[];
	kwarg?: Arg;
	defaults: ExprNode[];
}

export interface Arg extends Located {
	nodeType: "Arg";
	arg: string;
	annotation?: ExprNode;
	type_comment?: string;
}

export interface Keyword extends Located {
	nodeType: "Keyword";
	arg?: string; // null for **kwargs
	value: ExprNode;
}

export interface Alias extends Located {
	nodeType: "Alias";
	name: string;
	asname?: string;
}

export interface WithItem extends ASTNode {
	nodeType: "WithItem";
	context_expr: ExprNode;
	optional_vars?: ExprNode;
}

export interface MatchCase extends ASTNode {
	nodeType: "MatchCase";
	pattern: PatternNode;
	guard?: ExprNode;
	body: StmtNode[];
}

// ==== Pattern nodes (Python 3.10+) ====
export type PatternNode =
	| MatchValue
	| MatchSingleton
	| MatchSequence
	| MatchMapping
	| MatchClass
	| MatchStar
	| MatchAs
	| MatchOr;

export interface MatchValue extends Located {
	nodeType: "MatchValue";
	value: ExprNode;
}

export interface MatchSingleton extends Located {
	nodeType: "MatchSingleton";
	// biome-ignore lint/suspicious/noExplicitAny: could be None, True, False
	value: any; // None, True, False
}

export interface MatchSequence extends Located {
	nodeType: "MatchSequence";
	patterns: PatternNode[];
}

export interface MatchMapping extends Located {
	nodeType: "MatchMapping";
	keys: ExprNode[];
	patterns: PatternNode[];
	rest?: string;
}

export interface MatchClass extends Located {
	nodeType: "MatchClass";
	cls: ExprNode;
	patterns: PatternNode[];
	kwd_attrs: string[];
	kwd_patterns: PatternNode[];
}

export interface MatchStar extends Located {
	nodeType: "MatchStar";
	name?: string;
}

export interface MatchAs extends Located {
	nodeType: "MatchAs";
	pattern?: PatternNode;
	name?: string;
}

export interface MatchOr extends Located {
	nodeType: "MatchOr";
	patterns: PatternNode[];
}

// ==== Type parameters (Python 3.12+) ====
export type TypeParamNode = TypeVar | ParamSpec | TypeVarTuple;

export interface TypeVar extends Located {
	nodeType: "TypeVar";
	name: string;
	bound?: ExprNode;
	default_value?: ExprNode;
}

export interface ParamSpec extends Located {
	nodeType: "ParamSpec";
	name: string;
	default_value?: ExprNode;
}

export interface TypeVarTuple extends Located {
	nodeType: "TypeVarTuple";
	name: string;
	default_value?: ExprNode;
}

// ==== Union types for convenience ====
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
