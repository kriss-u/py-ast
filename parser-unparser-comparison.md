# Parser vs Unparser Comparison Analysis

## Summary of Findings

After comprehensive analysis, I found the following **missing functionality in the unparser**:

## 1. Type Parameters (TypeVar, ParamSpec, TypeVarTuple)

**Status**: ❌ Missing in Unparser

**Parser**: Creates type_params arrays but TODOs indicate incomplete parsing
- Line 448: `// TODO: Parse type parameters properly` 
- Line 590: `// TODO: Actually parse type parameters properly`

**Unparser**: References type_params but has no visitor methods for:
- `visit_TypeVar`
- `visit_ParamSpec` 
- `visit_TypeVarTuple`

**Impact**: Type aliases and generic functions with type parameters cannot be unparsed correctly.

## 2. FunctionType Module Node

**Status**: ❌ Missing in Unparser

**Parser**: Doesn't create FunctionType nodes (not implemented)
**Unparser**: Missing `visit_FunctionType` method
**Impact**: Function type annotations in module context cannot be unparsed.

## 3. Module Type Variants

**Status**: ⚠️ Partially Implemented

- **Module**: ✅ Fully supported
- **Interactive**: ✅ Unparser supports, ❌ Parser doesn't create
- **Expression**: ✅ Unparser supports, ❌ Parser doesn't create  
- **FunctionType**: ❌ Neither parser nor unparser supports

**Impact**: Limited - these are mainly for different parsing contexts.

## Complete Feature Matrix

### Statement Types - All Supported ✅
Both parser and unparser support all statement types:
- Pass, Break, Continue, Return, Delete, Global, Nonlocal
- Import, ImportFrom, Raise, Assert, TypeAlias
- Assign, AugAssign, AnnAssign, Expr
- If, While, For, Try, TryStar, With
- AsyncFor, AsyncWith, AsyncFunctionDef
- FunctionDef, ClassDef, Match

### Expression Types - All Supported ✅  
Both parser and unparser support all expression types:
- BinOp, UnaryOp, BoolOp, Compare, Call
- Constant, Name, Attribute, Subscript
- List, Tuple, Dict, Set, Starred, Slice
- ListComp, SetComp, DictComp, GeneratorExp
- Lambda, IfExp, Await, Yield, YieldFrom
- NamedExpr, JoinedStr, FormattedValue

### Pattern Types - All Supported ✅
Both parser and unparser support all match patterns:
- MatchValue, MatchSingleton, MatchSequence, MatchMapping
- MatchClass, MatchStar, MatchAs, MatchOr

### Helper Types - All Supported ✅
- Arguments, Arg, Keyword, Alias, WithItem
- MatchCase, Comprehension, ExceptHandler

## Recommendations

### Priority 1: Type Parameters
Add visitor methods to unparser:
```typescript
visit_TypeVar(node: TypeVar): void {
    this.write(node.name);
    if (node.bound) {
        this.write(": ");
        this.visit(node.bound);
    }
    if (node.default_value) {
        this.write(" = ");
        this.visit(node.default_value);
    }
}

visit_ParamSpec(node: ParamSpec): void {
    this.write("**", node.name);
    if (node.default_value) {
        this.write(" = ");
        this.visit(node.default_value);
    }
}

visit_TypeVarTuple(node: TypeVarTuple): void {
    this.write("*", node.name);
    if (node.default_value) {
        this.write(" = ");
        this.visit(node.default_value);
    }
}
```

### Priority 2: Complete Type Parameter Parsing
Fix the TODOs in parser to properly parse type parameters in:
- Type aliases (`type X[T] = ...`)
- Generic functions (`def func[T]() -> T: ...`)
- Generic classes (`class C[T]: ...`)

### Priority 3: FunctionType Support (Low Priority)
Only needed if function type module parsing is required for specialized use cases.

## Testing Recommendations

Add unparser tests for:
1. Type aliases with type parameters
2. Generic functions and classes  
3. Round-trip parsing/unparsing for type parameter syntax
