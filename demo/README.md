# Python AST Parser Demo Suite

This demo suite showcases the capabilities of the TypeScript Python AST parser library. It includes comprehensive test files, analysis tools, and interactive utilities with full JSON output support.

## 📁 Directory Structure

```
demo/
├── python-files/           # Python source files for testing
│   ├── basic-operations.py     # Variables, basic operations, data structures
│   ├── control-flow.py         # If statements, loops, exception handling
│   ├── functions-classes.py    # Function definitions, classes, inheritance
│   ├── advanced-features.py    # Async/await, generators, decorators
│   ├── imports-modules.py      # Import statements, module operations
│   └── expressions.py          # Complex expressions, operators, comprehensions
├── ast-demo.mjs            # Main analysis tool with JSON visualization
├── test-suite.mjs          # Automated test suite
├── interactive.mjs         # Interactive AST explorer with JSON export
├── json-examples.mjs       # JSON format demonstrations
├── py2json.mjs             # Standalone Python to JSON converter
└── README.md              # This documentation
```

## 🚀 Quick Start

### 1. Build and Run All Demos

```bash
npm run build
npm run demo:all
```

### 2. Interactive AST Explorer

```bash
npm run demo:interactive
```

### 3. Convert Python to JSON

```bash
npm run py2json python-files/basic-operations.py
```

## 🎯 Demo Scripts

### 1. Main AST Analysis (`ast-demo.mjs`)

**Command:** `npm run demo` or `node demo/ast-demo.mjs`

**Features:**

- Analyzes all Python test files

**Sample Output:**

```
=== Python AST Parser Demo ===

Analyzing: demo/python-files/basic-operations.py
✓ Parsed successfully (12ms)
  - Total nodes: 147
  - Functions: 2, Classes: 0
  - Variables: 15, Imports: 3

JSON Structure Preview:
{
  "type": "Module",
  "body": [...]
}
```

### 2. Automated Test Suite (`test-suite.mjs`)

**Command:** `npm run demo:test` or `node demo/test-suite.mjs`

**Features:**

- Automated parsing of all test files
- Pass/fail reporting with error details
- Overall success statistics
- Performance benchmarking

**Sample Output:**

```
Running Python AST Parser Test Suite...

✓ basic-operations.py: Passed (147 nodes)
✓ control-flow.py: Passed (89 nodes)
✗ functions-classes.py: Failed - SyntaxError
...

Test Results: 4/6 files passed (66.67% success rate)
```

### 3. Interactive AST Explorer (`interactive.mjs`)

**Command:** `npm run demo:interactive` or `node demo/interactive.mjs`

**Features:**

- Real-time interactive command-line interface
- Live AST exploration and analysis
- Multiple JSON output formats
- File saving capabilities

**Available Commands:**

- `list` - Show available Python files
- `parse <filename>` - Parse a specific file
- `stats` - Show detailed statistics
- `json` - Display AST as JSON (compact/pretty)
- `save [filename]` - Save JSON to file
- `help` - Show all commands
- `exit` - Quit the explorer

**Sample Session:**

```
Python AST Interactive Explorer
Type 'help' for commands, 'exit' to quit.

> list
Available files:
1. basic-operations.py
2. control-flow.py
...

> parse basic-operations.py
✓ Parsed successfully!
  Total nodes: 147
  Functions: 2, Classes: 0

> json
{
  "type": "Module",
  "body": [...]
}

> save output.json
✓ JSON saved to output.json (24304 characters)
```

### 4. JSON Format Examples (`json-examples.mjs`)

**Command:** `npm run demo:json` or `node demo/json-examples.mjs`

**Features:**

- Demonstrates different JSON output formats
- Shows size comparisons between formats
- Explains use cases for each format

**Output Formats:**

- **Compact**: Minified JSON for storage (`2806 chars`)
- **Pretty**: Human-readable with indentation (`7076 chars`)
- **Filtered**: Only specific node types
- **Simplified**: Reduced complexity for overview

### 5. Standalone Python-to-JSON Converter (`py2json.mjs`)

**Command:** `npm run py2json <file>` or `node demo/py2json.mjs <file> [output]`

**Features:**

- Command-line Python to JSON converter
- Optional output file specification
- Error handling and progress reporting
- Supports all Python files in the test suite

**Usage Examples:**

```bash
# Convert to console output
npm run py2json python-files/basic-operations.py

# Convert and save to file
node demo/py2json.mjs python-files/basic-operations.py output.json

# Process different files
npm run py2json python-files/expressions.py
```

## 📄 Python Test Files

### `basic-operations.py`

**Coverage:** Variables, arithmetic, data structures, basic operations

**Key Features:**

- Variable assignments and basic types
- Arithmetic and string operations
- List, dict, tuple, and set operations
- Boolean logic and comparisons

### `control-flow.py`

**Coverage:** If statements, loops, exception handling

**Key Features:**

- If/elif/else conditional statements
- For and while loops with break/continue
- Try/except/finally exception handling
- Nested control structures

### `functions-classes.py`

**Coverage:** Function and class definitions

**Key Features:**

- Functions with various parameter types
- Default arguments, \*args, \*\*kwargs
- Class definitions with inheritance
- Decorators and property methods

### `advanced-features.py`

**Coverage:** Modern Python features

**Key Features:**

- Async/await and coroutines
- Generator functions and expressions
- Context managers and decorators
- Iterator protocol implementations

### `imports-modules.py`

**Coverage:** Import statements and module operations

**Key Features:**

- Various import statement types
- Aliased imports (import x as y)
- From imports (from x import y)
- Module-level code organization

### `expressions.py`

**Coverage:** All expression types and operators

**Key Features:**

- Arithmetic expressions (+, -, \*, /, //, %, \*\*)
- Comparison and logical expressions
- Bitwise operations and assignments
- Complex nested expressions

## 🌟 JSON Output Guide

### Method 1: Interactive Explorer

```bash
npm run demo:interactive
> parse basic-operations.py
> json
> save my-ast.json
```

### Method 2: Standalone Converter

```bash
npm run py2json python-files/basic-operations.py output.json
```

### Method 3: Programmatic Usage

```javascript
import { parseModule } from "../dist/index.esm.js";

const code = 'print("Hello, World!")';
const ast = parseModule(code);
const json = JSON.stringify(ast, null, 2);
console.log(json);
```

### JSON Format Options

**Compact Format:**

```json
{"type":"Module","body":[{"type":"Expr","value":{"type":"Call"...}}]}
```

**Pretty Format:**

```json
{
  "type": "Module",
  "body": [
    {
      "type": "Expr",
      "value": {
        "type": "Call",
        ...
      }
    }
  ]
}
```

## 📊 Performance Insights

The demo suite provides comprehensive performance analysis:

- **Parsing Speed**: 10-50ms per file (depending on complexity)
- **Memory Usage**: Efficient AST representation
- **JSON Output**: 15-25KB for typical Python files
- **Success Rate**: 66-100% (varies by Python version compatibility)

**Benchmarking Results:**

```
File                    | Nodes | Parse Time | JSON Size
------------------------|-------|------------|----------
basic-operations.py     | 147   | 12ms       | 24KB
control-flow.py         | 89    | 8ms        | 15KB
expressions.py          | 203   | 18ms       | 32KB
```

## 🔧 Advanced Usage

### Custom AST Analysis

```javascript
import { parseModule } from "../dist/index.esm.js";

function analyzeAST(code) {
  const ast = parseModule(code);
  const stats = {
    totalNodes: 0,
    nodeTypes: new Map(),
    maxDepth: 0,
  };

  function traverse(node, depth = 0) {
    stats.totalNodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    const type = node.type;
    stats.nodeTypes.set(type, (stats.nodeTypes.get(type) || 0) + 1);

    // Traverse child nodes
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (child && typeof child === "object" && child.type) {
            traverse(child, depth + 1);
          }
        });
      } else if (value && typeof value === "object" && value.type) {
        traverse(value, depth + 1);
      }
    }
  }

  traverse(ast);
  return stats;
}
```

### Error Handling and Recovery

```javascript
import { parseModule } from "../dist/index.esm.js";

function safeParse(code, filename = "unknown") {
  try {
    const ast = parseModule(code);
    return { success: true, ast, errors: [] };
  } catch (error) {
    return {
      success: false,
      ast: null,
      errors: [
        {
          message: error.message,
          line: error.line || "unknown",
          file: filename,
        },
      ],
    };
  }
}
```

## 🐛 Troubleshooting

### Common Issues and Solutions

**1. Import Path Errors**

```bash
Error: Cannot resolve module '../src/index.js'
```

**Solution:** Build the project first

```bash
npm run build
```

**2. Python Syntax Compatibility**

```bash
SyntaxError: Unexpected token at line 15
```

**Solution:** Check Python version compatibility - some modern features may not be supported

**3. File Not Found**

```bash
Error: ENOENT: no such file or directory
```

**Solution:** Ensure you're running commands from the correct directory and file paths are correct

**4. JSON Output Too Large**

```bash
Output truncated due to size
```

**Solution:** Use filtered output or save to file instead of console display

### Debug Mode

Enable verbose logging for debugging:

```bash
DEBUG=1 node demo/ast-demo.mjs
DEBUG=1 npm run demo:interactive
```

### Validation

Verify your setup:

```bash
# Check Node.js version (requires 16+)
node --version

# Verify build output
ls -la dist/

# Test basic functionality
echo 'print("test")' | node -e 'console.log("Parser ready")'
```

## 🚀 Extending the Demo Suite

### Adding New Python Test Files

1. Create a new `.py` file in `python-files/`
2. Add comprehensive test cases for specific features
3. Update the file lists in demo scripts
4. Run the test suite to verify parsing

### Creating New Demo Scripts

1. Create a new `.mjs` file in the demo directory
2. Import the parser: `import { parseModule } from '../dist/index.esm.js'`
3. Add error handling and user-friendly output
4. Add the script to `package.json` scripts section
5. Update this README with usage instructions

### Contributing Guidelines

- Follow existing code style and patterns
- Include comprehensive error handling
- Add clear documentation and examples
- Test with various Python code samples
- Consider performance implications
- Update README documentation

## 📈 Success Metrics

When running the demo suite, expect to see:

✅ **Successful Parsing**: Most Python files should parse without errors
✅ **Detailed Analysis**: Comprehensive AST statistics and node information
✅ **JSON Output**: Clean, valid JSON representation of AST structures
✅ **Interactive Mode**: Responsive command-line interface
✅ **Error Handling**: Graceful handling of syntax errors and edge cases
✅ **Performance**: Reasonable parsing times for all test files

The demo suite demonstrates the robustness and capabilities of the TypeScript Python AST parser, providing both automated testing and interactive exploration tools for comprehensive validation.

This comprehensive demo suite helps ensure the Python AST parser is working correctly across all major Python language features.
