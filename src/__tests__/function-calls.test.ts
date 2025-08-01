import { parseExpression, assertNodeType } from "./test-helpers.js";

describe("Function Calls", () => {
  test("simple function call", () => {
    const expr = parseExpression("func()");
    assertNodeType(expr, "Call");
    expect(expr.func.nodeType).toBe("Name");
    expect(expr.args).toHaveLength(0);
    expect(expr.keywords).toHaveLength(0);
  });

  test("function call with positional arguments", () => {
    const expr = parseExpression("func(1, 2, 3)");
    assertNodeType(expr, "Call");
    expect(expr.args).toHaveLength(3);
    expect(expr.args[0].nodeType).toBe("Constant");
  });

  test("function call with keyword arguments", () => {
    const expr = parseExpression("func(a=1, b=2)");
    assertNodeType(expr, "Call");
    expect(expr.keywords).toHaveLength(2);
    expect(expr.keywords[0].arg).toBe("a");
    expect(expr.keywords[0].value.nodeType).toBe("Constant");
  });

  test("function call with mixed arguments", () => {
    const expr = parseExpression("func(1, 2, a=3, b=4)");
    assertNodeType(expr, "Call");
    expect(expr.args).toHaveLength(2);
    expect(expr.keywords).toHaveLength(2);
  });

  test("function call with *args", () => {
    const expr = parseExpression("func(*args)");
    assertNodeType(expr, "Call");
    expect(expr.args).toHaveLength(1);
    expect(expr.args[0].nodeType).toBe("Starred");
  });

  test("function call with **kwargs", () => {
    const expr = parseExpression("func(**kwargs)");
    assertNodeType(expr, "Call");
    expect(expr.keywords).toHaveLength(1);
    expect(expr.keywords[0].arg).toBeUndefined(); // **kwargs has no arg name
  });

  test("method call", () => {
    const expr = parseExpression("obj.method()");
    assertNodeType(expr, "Call");
    expect(expr.func.nodeType).toBe("Attribute");
  });

  test("chained method calls", () => {
    const expr = parseExpression("obj.method1().method2()");
    assertNodeType(expr, "Call");
    assertNodeType(expr.func, "Attribute");
    assertNodeType(expr.func.value, "Call");
  });
});

describe("Comprehensions", () => {
  test("list comprehension", () => {
    const expr = parseExpression("[x for x in items]");
    assertNodeType(expr, "ListComp");
    expect(expr.elt.nodeType).toBe("Name");
    expect(expr.generators).toHaveLength(1);
    expect(expr.generators[0].target.nodeType).toBe("Name");
    expect(expr.generators[0].iter.nodeType).toBe("Name");
    expect(expr.generators[0].ifs).toHaveLength(0);
  });

  test("list comprehension with condition", () => {
    const expr = parseExpression("[x for x in items if x > 0]");
    assertNodeType(expr, "ListComp");
    expect(expr.generators[0].ifs).toHaveLength(1);
    expect(expr.generators[0].ifs[0].nodeType).toBe("Compare");
  });

  test("nested list comprehension", () => {
    const expr = parseExpression("[x for row in matrix for x in row]");
    assertNodeType(expr, "ListComp");
    expect(expr.generators).toHaveLength(2);
  });

  test("set comprehension", () => {
    const expr = parseExpression("{x for x in items}");
    assertNodeType(expr, "SetComp");
    expect(expr.elt.nodeType).toBe("Name");
    expect(expr.generators).toHaveLength(1);
  });

  test("dict comprehension", () => {
    const expr = parseExpression("{k: v for k, v in items.items()}");
    assertNodeType(expr, "DictComp");
    expect(expr.key.nodeType).toBe("Name");
    expect(expr.value.nodeType).toBe("Name");
    expect(expr.generators).toHaveLength(1);
  });

  test("generator expression", () => {
    const expr = parseExpression("(x for x in items)");
    assertNodeType(expr, "GeneratorExp");
    expect(expr.elt.nodeType).toBe("Name");
    expect(expr.generators).toHaveLength(1);
  });

  test("async comprehension", () => {
    const expr = parseExpression("[x async for x in async_items]");
    assertNodeType(expr, "ListComp");
    expect(expr.generators[0].is_async).toBe(1);
  });
});

describe("F-strings", () => {
  test("simple f-string", () => {
    const expr = parseExpression('f"Hello {name}"');
    assertNodeType(expr, "JoinedStr");
    expect(expr.values).toHaveLength(2);
    expect(expr.values[0].nodeType).toBe("Constant");
    expect(expr.values[1].nodeType).toBe("FormattedValue");
  });

  test("f-string with expression", () => {
    const expr = parseExpression('f"Result: {x + y}"');
    assertNodeType(expr, "JoinedStr");
    const formatted = expr.values[1];
    assertNodeType(formatted, "FormattedValue");
    expect(formatted.value.nodeType).toBe("BinOp");
  });

  test("f-string with format spec", () => {
    const expr = parseExpression('f"Number: {value:.2f}"');
    assertNodeType(expr, "JoinedStr");
    const formatted = expr.values[1];
    assertNodeType(formatted, "FormattedValue");
    expect(formatted.format_spec).toBeDefined();
  });

  test("f-string with conversion", () => {
    const expr = parseExpression('f"Debug: {value!r}"');
    assertNodeType(expr, "JoinedStr");
    const formatted = expr.values[1];
    assertNodeType(formatted, "FormattedValue");
    expect(formatted.conversion).toBe(114); // 'r'
  });
});

describe("Await and Yield", () => {
  test("await expression", () => {
    const expr = parseExpression("await coro()");
    assertNodeType(expr, "Await");
    expect(expr.value.nodeType).toBe("Call");
  });

  test("yield expression", () => {
    const expr = parseExpression("yield value");
    assertNodeType(expr, "Yield");
    expect(expr.value?.nodeType).toBe("Name");
  });

  test("yield without value", () => {
    const expr = parseExpression("yield");
    assertNodeType(expr, "Yield");
    expect(expr.value).toBeUndefined();
  });

  test("yield from", () => {
    const expr = parseExpression("yield from generator()");
    assertNodeType(expr, "YieldFrom");
    expect(expr.value.nodeType).toBe("Call");
  });
});

describe("Starred Expressions", () => {
  test("starred in function call", () => {
    const expr = parseExpression("func(*args)");
    assertNodeType(expr, "Call");
    expect(expr.args[0].nodeType).toBe("Starred");
  });

  test("starred in list literal", () => {
    const expr = parseExpression("[1, *items, 2]");
    assertNodeType(expr, "List");
    expect(expr.elts[1].nodeType).toBe("Starred");
  });

  test("starred in tuple literal", () => {
    const expr = parseExpression("(1, *items, 2)");
    assertNodeType(expr, "Tuple");
    expect(expr.elts[1].nodeType).toBe("Starred");
  });
});
