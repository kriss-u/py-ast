import { parseExpression, assertNodeType } from "./test-helpers.js";

describe("Binary Operations", () => {
  test("arithmetic operators", () => {
    const addExpr = parseExpression("a + b");
    assertNodeType(addExpr, "BinOp");
    expect(addExpr.op.nodeType).toBe("Add");

    const subExpr = parseExpression("a - b");
    assertNodeType(subExpr, "BinOp");
    expect(subExpr.op.nodeType).toBe("Sub");

    const mulExpr = parseExpression("a * b");
    assertNodeType(mulExpr, "BinOp");
    expect(mulExpr.op.nodeType).toBe("Mult");

    const divExpr = parseExpression("a / b");
    assertNodeType(divExpr, "BinOp");
    expect(divExpr.op.nodeType).toBe("Div");

    const modExpr = parseExpression("a % b");
    assertNodeType(modExpr, "BinOp");
    expect(modExpr.op.nodeType).toBe("Mod");

    const powExpr = parseExpression("a ** b");
    assertNodeType(powExpr, "BinOp");
    expect(powExpr.op.nodeType).toBe("Pow");

    const floorDivExpr = parseExpression("a // b");
    assertNodeType(floorDivExpr, "BinOp");
    expect(floorDivExpr.op.nodeType).toBe("FloorDiv");
  });

  test("bitwise operators", () => {
    const orExpr = parseExpression("a | b");
    assertNodeType(orExpr, "BinOp");
    expect(orExpr.op.nodeType).toBe("BitOr");

    const xorExpr = parseExpression("a ^ b");
    assertNodeType(xorExpr, "BinOp");
    expect(xorExpr.op.nodeType).toBe("BitXor");

    const andExpr = parseExpression("a & b");
    assertNodeType(andExpr, "BinOp");
    expect(andExpr.op.nodeType).toBe("BitAnd");

    const lshiftExpr = parseExpression("a << b");
    assertNodeType(lshiftExpr, "BinOp");
    expect(lshiftExpr.op.nodeType).toBe("LShift");

    const rshiftExpr = parseExpression("a >> b");
    assertNodeType(rshiftExpr, "BinOp");
    expect(rshiftExpr.op.nodeType).toBe("RShift");
  });

  test("matrix multiplication", () => {
    const matmulExpr = parseExpression("a @ b");
    assertNodeType(matmulExpr, "BinOp");
    expect(matmulExpr.op.nodeType).toBe("MatMult");
  });

  test("operator precedence", () => {
    const expr = parseExpression("a + b * c");
    assertNodeType(expr, "BinOp");
    expect(expr.op.nodeType).toBe("Add");
    expect(expr.left.nodeType).toBe("Name");
    assertNodeType(expr.right, "BinOp");
    expect(expr.right.op.nodeType).toBe("Mult");
  });
});

describe("Unary Operations", () => {
  test("unary arithmetic", () => {
    const plusExpr = parseExpression("+x");
    assertNodeType(plusExpr, "UnaryOp");
    expect(plusExpr.op.nodeType).toBe("UAdd");

    const minusExpr = parseExpression("-x");
    assertNodeType(minusExpr, "UnaryOp");
    expect(minusExpr.op.nodeType).toBe("USub");
  });

  test("unary logical", () => {
    const notExpr = parseExpression("not x");
    assertNodeType(notExpr, "UnaryOp");
    expect(notExpr.op.nodeType).toBe("Not");
  });

  test("unary bitwise", () => {
    const invertExpr = parseExpression("~x");
    assertNodeType(invertExpr, "UnaryOp");
    expect(invertExpr.op.nodeType).toBe("Invert");
  });
});

describe("Boolean Operations", () => {
  test("and operation", () => {
    const expr = parseExpression("a and b");
    assertNodeType(expr, "BoolOp");
    expect(expr.op.nodeType).toBe("And");
    expect(expr.values).toHaveLength(2);
  });

  test("or operation", () => {
    const expr = parseExpression("a or b");
    assertNodeType(expr, "BoolOp");
    expect(expr.op.nodeType).toBe("Or");
    expect(expr.values).toHaveLength(2);
  });

  test("chained boolean operations", () => {
    const expr = parseExpression("a and b and c");
    assertNodeType(expr, "BoolOp");
    expect(expr.op.nodeType).toBe("And");
    expect(expr.values).toHaveLength(3);
  });

  test("mixed boolean operations", () => {
    const expr = parseExpression("a and b or c");
    assertNodeType(expr, "BoolOp");
    expect(expr.op.nodeType).toBe("Or");
    expect(expr.values).toHaveLength(2);
    assertNodeType(expr.values[0], "BoolOp");
    expect(expr.values[0].op.nodeType).toBe("And");
  });
});

describe("Comparison Operations", () => {
  test("equality operators", () => {
    const eqExpr = parseExpression("a == b");
    assertNodeType(eqExpr, "Compare");
    expect(eqExpr.ops[0].nodeType).toBe("Eq");

    const neExpr = parseExpression("a != b");
    assertNodeType(neExpr, "Compare");
    expect(neExpr.ops[0].nodeType).toBe("NotEq");
  });

  test("ordering operators", () => {
    const ltExpr = parseExpression("a < b");
    assertNodeType(ltExpr, "Compare");
    expect(ltExpr.ops[0].nodeType).toBe("Lt");

    const gtExpr = parseExpression("a > b");
    assertNodeType(gtExpr, "Compare");
    expect(gtExpr.ops[0].nodeType).toBe("Gt");

    const leExpr = parseExpression("a <= b");
    assertNodeType(leExpr, "Compare");
    expect(leExpr.ops[0].nodeType).toBe("LtE");

    const geExpr = parseExpression("a >= b");
    assertNodeType(geExpr, "Compare");
    expect(geExpr.ops[0].nodeType).toBe("GtE");
  });

  test("identity operators", () => {
    const isExpr = parseExpression("a is b");
    assertNodeType(isExpr, "Compare");
    expect(isExpr.ops[0].nodeType).toBe("Is");

    const isNotExpr = parseExpression("a is not b");
    assertNodeType(isNotExpr, "Compare");
    expect(isNotExpr.ops[0].nodeType).toBe("IsNot");
  });

  test("membership operators", () => {
    const inExpr = parseExpression("a in b");
    assertNodeType(inExpr, "Compare");
    expect(inExpr.ops[0].nodeType).toBe("In");

    const notInExpr = parseExpression("a not in b");
    assertNodeType(notInExpr, "Compare");
    expect(notInExpr.ops[0].nodeType).toBe("NotIn");
  });

  test("chained comparisons", () => {
    const expr = parseExpression("a < b < c");
    assertNodeType(expr, "Compare");
    expect(expr.ops).toHaveLength(2);
    expect(expr.ops[0].nodeType).toBe("Lt");
    expect(expr.ops[1].nodeType).toBe("Lt");
    expect(expr.comparators).toHaveLength(2);
  });
});

describe("Conditional Expressions", () => {
  test("ternary conditional", () => {
    const expr = parseExpression("a if condition else b");
    assertNodeType(expr, "IfExp");
    expect(expr.test.nodeType).toBe("Name");
    expect(expr.body.nodeType).toBe("Name");
    expect(expr.orelse.nodeType).toBe("Name");
  });

  test("nested conditionals", () => {
    const expr = parseExpression("a if x else b if y else c");
    assertNodeType(expr, "IfExp");
    expect(expr.test.nodeType).toBe("Name");
    expect(expr.body.nodeType).toBe("Name");
    assertNodeType(expr.orelse, "IfExp");
  });
});

describe("Lambda Expressions", () => {
  test("simple lambda", () => {
    const expr = parseExpression("lambda x: x + 1");
    assertNodeType(expr, "Lambda");
    expect(expr.args.args).toHaveLength(1);
    expect(expr.args.args[0].arg).toBe("x");
    assertNodeType(expr.body, "BinOp");
  });

  test("lambda with multiple parameters", () => {
    const expr = parseExpression("lambda x, y: x + y");
    assertNodeType(expr, "Lambda");
    expect(expr.args.args).toHaveLength(2);
  });

  test("lambda with default parameters", () => {
    const expr = parseExpression("lambda x=1: x * 2");
    assertNodeType(expr, "Lambda");
    expect(expr.args.args).toHaveLength(1);
    expect(expr.args.defaults).toHaveLength(1);
  });

  test("lambda with no parameters", () => {
    const expr = parseExpression("lambda: 42");
    assertNodeType(expr, "Lambda");
    expect(expr.args.args).toHaveLength(0);
  });
});

describe("Walrus Operator", () => {
  test("named expressions", () => {
    const expr = parseExpression("(x := 42)");
    assertNodeType(expr, "NamedExpr");
    expect(expr.target.nodeType).toBe("Name");
    expect(expr.value.nodeType).toBe("Constant");
  });
});
