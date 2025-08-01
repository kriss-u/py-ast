# Python AST Parser Test Suite

This directory contains comprehensive unit tests for the Python AST parser, covering all major Python syntax features supported by the parser.

## Test Structure

The test suite is organized into several focused test files:

### Core Tests

- **`expressions.test.ts`** - Basic Python expressions

  - Literals (numbers, strings, booleans, None)
  - Collections (lists, tuples, sets, dicts)
  - Names and identifiers
  - Attribute access and subscripting
  - Slice operations

- **`operators.test.ts`** - Operator expressions

  - Binary operators (arithmetic, bitwise, comparison)
  - Unary operators
  - Boolean operations (and, or, not)
  - Comparison operations and chaining
  - Conditional expressions (ternary)
  - Lambda expressions
  - Walrus operator (:=)

- **`statements.test.ts`** - Basic statements
  - Assignment statements (simple, multiple, unpacking)
  - Annotated assignments
  - Augmented assignments (+=, -=, etc.)
  - Delete statements
  - Control flow (pass, break, continue, return)
  - Global and nonlocal declarations
  - Raise and assert statements
  - Expression statements

### Advanced Tests

- **`control-flow.test.ts`** - Control flow constructs

  - If/elif/else statements
  - While loops with else clauses
  - For loops (including async for)
  - With statements (including async with)
  - Try/except/else/finally blocks
  - Function definitions (sync and async)
  - Class definitions with inheritance

- **`function-calls.test.ts`** - Function calls and advanced expressions

  - Function calls with various argument types
  - Method calls and chaining
  - Comprehensions (list, set, dict, generator)
  - F-string expressions
  - Await and yield expressions
  - Starred expressions (\*args, \*\*kwargs)

- **`imports-and-advanced.test.ts`** - Import statements and modern features
  - Import statements (simple, aliased, multiple)
  - From-import statements (including relative imports)
  - Match statements (Python 3.10+)
  - Type alias statements (Python 3.12+)
  - Complex nested control structures

### Quality Assurance Tests

- **`integration.test.ts`** - Large-scale integration tests

  - Comprehensive syntax coverage
  - Real-world Python file patterns
  - Edge cases and error recovery
  - Roundtrip compatibility testing
  - Python version-specific features
  - Stress tests with deeply nested structures

- **`edge-cases.test.ts`** - Edge cases and error handling

  - Empty input and whitespace handling
  - Syntax error cases
  - Complex nested structures
  - Unicode and special characters
  - Number edge cases
  - Operator precedence edge cases
  - Function parameter edge cases
  - Collection edge cases
  - Statement boundary cases

- **`api-and-performance.test.ts`** - API and performance tests
  - Public API functionality
  - Performance benchmarks
  - Memory usage tests
  - Compatibility with Python standard library patterns
  - AST node coverage analysis

### Test Utilities

- **`test-helpers.ts`** - Shared test utilities

  - `parseCode()` - Parse Python code into AST
  - `parseStatement()` - Parse and extract first statement
  - `parseExpression()` - Parse and extract first expression
  - `testRoundtrip()` - Test parse/unparse roundtrip
  - `assertNodeType()` - Type-safe node type assertions
  - `countNodeTypes()` - Count AST node types

- **`smoke-test.ts`** - Quick smoke test runner
  - Basic functionality verification
  - Can be run independently for quick checks

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npm test expressions.test.ts
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## Test Categories

### Syntax Coverage

The tests aim to cover all Python syntax constructs:

**Statements:**

- Module, Import, ImportFrom
- FunctionDef, AsyncFunctionDef, ClassDef
- If, While, For, AsyncFor
- Try, TryStar, With, AsyncWith
- Match (Python 3.10+)
- Assign, AnnAssign, AugAssign, Delete
- Pass, Break, Continue, Return, Raise, Assert
- Global, Nonlocal, Expr
- TypeAlias (Python 3.12+)

**Expressions:**

- Name, Constant, BinOp, UnaryOp, BoolOp
- Compare, Call, Attribute, Subscript
- List, Tuple, Set, Dict
- ListComp, SetComp, DictComp, GeneratorExp
- Lambda, IfExp, NamedExpr (walrus operator)
- JoinedStr, FormattedValue (f-strings)
- Await, Yield, YieldFrom
- Starred

### Python Version Features

- **Python 3.8+**: Walrus operator (:=)
- **Python 3.10+**: Match statements, union types (|)
- **Python 3.11+**: Exception groups (except\*)
- **Python 3.12+**: Type parameters, type aliases

### Real-World Patterns

Tests include patterns commonly found in Python codebases:

- Data classes with decorators
- Async generators and context managers
- Complex type annotations
- List comprehensions with multiple conditions
- Exception handling patterns

## Test Philosophy

1. **Comprehensive Coverage**: Test all major Python syntax features
2. **Real-World Relevance**: Include patterns from actual Python code
3. **Edge Case Handling**: Test boundary conditions and error cases
4. **Performance Awareness**: Ensure the parser handles large files efficiently
5. **API Stability**: Test the public API for consistency
6. **Maintainability**: Clear test structure and good documentation

## Adding New Tests

When adding new tests:

1. Choose the appropriate test file based on the feature category
2. Use the test helpers from `test-helpers.ts`
3. Include both positive tests (valid syntax) and negative tests (error cases)
4. Add integration tests for complex features
5. Update this README if adding new test categories

## Known Limitations

The test suite aims to be comprehensive, but some areas may have limited coverage:

- Complex error recovery scenarios
- All possible combinations of nested constructs
- Platform-specific behaviors
- Memory and performance limits

For issues or improvements to the test suite, please check the project's issue tracker.
