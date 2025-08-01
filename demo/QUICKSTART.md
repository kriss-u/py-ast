# Quick Start Guide

## 🚀 Running the Demos

### 1. Build the project first

```bash
npm run build
```

### 2. Run demos

```bash
# Run comprehensive AST analysis demo
npm run demo

# Run test suite
npm run demo:test

# Run interactive explorer
npm run demo:interactive

# Run all demos
npm run demo:all
```

### 3. Or run directly

```bash
# Comprehensive demo
node demo/ast-demo.mjs

# Test suite
node demo/test-suite.mjs

# Interactive explorer
node demo/interactive.mjs
```

## 📁 What's Included

### Python Test Files (`demo/python-files/`)

- **basic-operations.py** - Variables, arithmetic, strings, collections
- **control-flow.py** - If/for/while/try statements, comprehensions
- **functions-classes.py** - Functions, classes, decorators, inheritance
- **advanced-features.py** - Async/await, generators, context managers
- **imports-modules.py** - All types of import statements
- **expressions.py** - Every type of Python expression

### Demo Scripts

- **ast-demo.mjs** - Comprehensive analysis of all Python files
- **test-suite.mjs** - Automated testing of parser functionality
- **interactive.mjs** - Interactive AST exploration tool

## 🎯 Expected Results

When everything works correctly, you should see:

1. **Successful parsing** of all Python files
2. **Detailed statistics** about AST nodes
3. **Performance metrics** (parse times)
4. **All tests passing** in the test suite
5. **Interactive commands** working in the explorer

## 🔧 Quick Test

Try this simple test to verify everything works:

```bash
# Build first
npm run build

# Quick test
node -e "
import { parse } from './dist/index.esm.js';
const ast = parse('x = 42');
console.log('✅ Parser works! Root node:', ast.nodeType);
"
```

If this prints `✅ Parser works! Root node: Module`, then everything is set up correctly!

## 📊 What You'll See

The demo will show detailed analysis like:

```
🐍 Python AST Parser Demo
============================================================
Found 6 Python files to analyze:
  📄 basic-operations.py
  📄 control-flow.py
  📄 functions-classes.py
  📄 advanced-features.py
  📄 imports-modules.py
  📄 expressions.py

📁 Analyzing: basic-operations.py
============================================================
⏱️  Parsing time: 15ms
📊 Root node type: Module
📈 AST Statistics:
  Total nodes: 157
  Functions: 0
  Classes: 0
  Imports: 0

🔢 Most common node types:
  Name: 45
  Constant: 28
  Assign: 15
  ...
```

Happy exploring! 🐍✨
