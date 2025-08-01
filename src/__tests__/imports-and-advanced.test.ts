import { parseStatement, assertNodeType } from "./test-helpers.js";

describe("Import Statements", () => {
  test("simple import", () => {
    const stmt = parseStatement("import os");
    assertNodeType(stmt, "Import");
    expect(stmt.names).toHaveLength(1);
    expect(stmt.names[0].name).toBe("os");
    expect(stmt.names[0].asname).toBeUndefined();
  });

  test("import with alias", () => {
    const stmt = parseStatement("import os as operating_system");
    assertNodeType(stmt, "Import");
    expect(stmt.names[0].name).toBe("os");
    expect(stmt.names[0].asname).toBe("operating_system");
  });

  test("multiple imports", () => {
    const stmt = parseStatement("import os, sys, json");
    assertNodeType(stmt, "Import");
    expect(stmt.names).toHaveLength(3);
    expect(stmt.names[0].name).toBe("os");
    expect(stmt.names[1].name).toBe("sys");
    expect(stmt.names[2].name).toBe("json");
  });

  test("dotted import", () => {
    const stmt = parseStatement("import xml.etree.ElementTree");
    assertNodeType(stmt, "Import");
    expect(stmt.names[0].name).toBe("xml.etree.ElementTree");
  });

  test("mixed imports with aliases", () => {
    const stmt = parseStatement("import os, sys as system, json as js");
    assertNodeType(stmt, "Import");
    expect(stmt.names).toHaveLength(3);
    expect(stmt.names[0].asname).toBeUndefined();
    expect(stmt.names[1].asname).toBe("system");
    expect(stmt.names[2].asname).toBe("js");
  });
});

describe("From Import Statements", () => {
  test("simple from import", () => {
    const stmt = parseStatement("from os import path");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.module).toBe("os");
    expect(stmt.level).toBe(0);
    expect(stmt.names).toHaveLength(1);
    expect(stmt.names[0].name).toBe("path");
  });

  test("from import with alias", () => {
    const stmt = parseStatement("from os import path as p");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.names[0].name).toBe("path");
    expect(stmt.names[0].asname).toBe("p");
  });

  test("multiple from imports", () => {
    const stmt = parseStatement("from os import path, environ, getcwd");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.names).toHaveLength(3);
  });

  test("star import", () => {
    const stmt = parseStatement("from os import *");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.names).toHaveLength(1);
    expect(stmt.names[0].name).toBe("*");
  });

  test("relative import - single dot", () => {
    const stmt = parseStatement("from . import module");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.level).toBe(1);
    expect(stmt.module).toBeUndefined();
    expect(stmt.names[0].name).toBe("module");
  });

  test("relative import - multiple dots", () => {
    const stmt = parseStatement("from ... import module");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.level).toBe(3);
  });

  test("relative import with module", () => {
    const stmt = parseStatement("from ..parent import module");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.level).toBe(2);
    expect(stmt.module).toBe("parent");
  });

  test("dotted module from import", () => {
    const stmt = parseStatement("from xml.etree import ElementTree");
    assertNodeType(stmt, "ImportFrom");
    expect(stmt.module).toBe("xml.etree");
    expect(stmt.names[0].name).toBe("ElementTree");
  });
});

describe("Match Statements (Python 3.10+)", () => {
  test("simple match statement", () => {
    const stmt = parseStatement(`match value:
    case 1:
        pass
    case 2:
        pass`);
    assertNodeType(stmt, "Match");
    expect(stmt.subject.nodeType).toBe("Name");
    expect(stmt.cases).toHaveLength(2);
  });

  test("match with pattern and guard", () => {
    const stmt = parseStatement(`match value:
    case x if x > 0:
        pass`);
    assertNodeType(stmt, "Match");
    expect(stmt.cases[0].guard?.nodeType).toBe("Compare");
  });

  test("match with wildcard", () => {
    const stmt = parseStatement(`match value:
    case 1:
        pass
    case _:
        pass`);
    assertNodeType(stmt, "Match");
    expect(stmt.cases).toHaveLength(2);
  });
});

describe("Type Alias Statements (Python 3.12+)", () => {
  test("simple type alias", () => {
    const stmt = parseStatement("type Vector = list[float]");
    assertNodeType(stmt, "TypeAlias");
    expect(stmt.name.nodeType).toBe("Name");
    expect(stmt.value.nodeType).toBe("Subscript");
  });
});

describe("Complex Statement Combinations", () => {
  test("nested control structures", () => {
    const stmt = parseStatement(`if condition:
    for item in items:
        if item > 0:
            try:
                process(item)
            except Exception:
                pass`);
    assertNodeType(stmt, "If");
    assertNodeType(stmt.body[0], "For");
    assertNodeType(stmt.body[0].body[0], "If");
    assertNodeType(stmt.body[0].body[0].body[0], "Try");
  });

  test("decorated async function with complex signature", () => {
    const stmt = parseStatement(`@decorator1
@decorator2
async def complex_func(
    pos_only: int, /,
    regular: str = "default",
    *args: Any,
    kw_only: float = 1.0,
    **kwargs: Dict[str, Any]
) -> AsyncIterator[str]:
    pass`);
    assertNodeType(stmt, "AsyncFunctionDef");
    expect(stmt.decorator_list).toHaveLength(2);
    expect(stmt.returns?.nodeType).toBe("Subscript");
  });
});
