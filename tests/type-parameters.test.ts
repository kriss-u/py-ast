import { describe, expect, test } from "vitest";
import { parse } from "../src/index.js";
import {
	assertNodeType,
	parseStatement,
	testRoundtrip,
	testUnparse,
} from "./test-helpers.js";

describe("Type Parameters", () => {
	describe("TypeVar", () => {
		test("simple type variable", () => {
			// Note: These tests will need actual parser support for type parameters
			// For now, we're testing the unparser with manually created AST nodes
			testUnparse(
				"type SimpleAlias[T] = List[T]",
				"type SimpleAlias[T] = List[T]",
			);
			testRoundtrip("type SimpleAlias[T] = List[T]");
		});

		test("type variable with bound", () => {
			testUnparse(
				"type NumberAlias[T: int] = List[T]",
				"type NumberAlias[T: int] = List[T]",
			);
			testRoundtrip("type NumberAlias[T: int] = List[T]");
		});

		test("type variable with default", () => {
			testUnparse(
				"type DefaultAlias[T = str] = List[T]",
				"type DefaultAlias[T = str] = List[T]",
			);
			testRoundtrip("type DefaultAlias[T = str] = List[T]");
		});

		test("type variable with bound and default", () => {
			testUnparse(
				"type BoundedAlias[T: int = int] = List[T]",
				"type BoundedAlias[T: int = int] = List[T]",
			);
			testRoundtrip("type BoundedAlias[T: int = int] = List[T]");
		});
	});

	describe("ParamSpec", () => {
		test("simple param spec", () => {
			testUnparse(
				"type CallableAlias[**P] = Callable[P, int]",
				"type CallableAlias[**P] = Callable[P, int]",
			);
			testRoundtrip("type CallableAlias[**P] = Callable[P, int]");
		});

		test("param spec with default", () => {
			testUnparse(
				"type CallableWithDefault[**P = []] = Callable[P, int]",
				"type CallableWithDefault[**P = []] = Callable[P, int]",
			);
			testRoundtrip("type CallableWithDefault[**P = []] = Callable[P, int]");
		});
	});

	describe("TypeVarTuple", () => {
		test("simple type var tuple", () => {
			testUnparse(
				"type TupleAlias[*Ts] = Tuple[*Ts]",
				"type TupleAlias[*Ts] = Tuple[*Ts]",
			);
			testRoundtrip("type TupleAlias[*Ts] = Tuple[*Ts]");
		});

		test("type var tuple with default", () => {
			testUnparse(
				"type TupleWithDefault[*Ts = *tuple[str, ...]] = Tuple[*Ts]",
				"type TupleWithDefault[*Ts = *tuple[str, ...]] = Tuple[*Ts]",
			);
			testRoundtrip(
				"type TupleWithDefault[*Ts = *tuple[str, ...]] = Tuple[*Ts]",
			);
		});
	});

	describe("Generic Functions", () => {
		test("simple generic function", () => {
			testUnparse(
				"def identity[T](x: T) -> T:\n    return x",
				"def identity[T](x: T) -> T:\n    return x",
			);
			testRoundtrip("def identity[T](x: T) -> T:\n    return x");
		});

		test("generic function with bound", () => {
			testUnparse(
				"def process[T: int](x: T) -> T:\n    return x",
				"def process[T: int](x: T) -> T:\n    return x",
			);
			testRoundtrip("def process[T: int](x: T) -> T:\n    return x");
		});

		test("generic function with multiple parameters", () => {
			testUnparse(
				"def combine[T, U](x: T, y: U) -> tuple[T, U]:\n    return (x, y)",
				"def combine[T, U](x: T, y: U) -> tuple[T, U]:\n    return (x, y)",
			);
			testRoundtrip(
				"def combine[T, U](x: T, y: U) -> tuple[T, U]:\n    return (x, y)",
			);
		});
	});

	describe("Generic Classes", () => {
		test("simple generic class", () => {
			testUnparse(
				"class Container[T]:\n    def __init__(self, value: T):\n        self.value = value",
				"class Container[T]:\n    def __init__(self, value: T):\n        self.value = value",
			);
			testRoundtrip(
				"class Container[T]:\n    def __init__(self, value: T):\n        self.value = value",
			);
		});

		test("generic class with bound", () => {
			testUnparse(
				"class NumericContainer[T: int]:\n    pass",
				"class NumericContainer[T: int]:\n    pass",
			);
			testRoundtrip("class NumericContainer[T: int]:\n    pass");
		});

		test("generic class with multiple parameters", () => {
			testUnparse(
				"class Pair[T, U]:\n    def __init__(self, first: T, second: U):\n        self.first = first\n        self.second = second",
				"class Pair[T, U]:\n    def __init__(self, first: T, second: U):\n        self.first = first\n        self.second = second",
			);
			testRoundtrip(
				"class Pair[T, U]:\n    def __init__(self, first: T, second: U):\n        self.first = first\n        self.second = second",
			);
		});
	});

	describe("Mixed Type Parameters", () => {
		test("function with all parameter types", () => {
			testUnparse(
				"def complex_func[T: int, **P, *Ts](x: T, *args: *Ts, **kwargs: P.kwargs) -> T:\n    pass",
				"def complex_func[T: int, **P, *Ts](x: T, *args: *Ts, **kwargs: P.kwargs) -> T:\n    pass",
			);
			testRoundtrip(
				"def complex_func[T: int, **P, *Ts](x: T, *args: *Ts, **kwargs: P.kwargs) -> T:\n    pass",
			);
		});

		test("type alias with mixed parameters", () => {
			testUnparse(
				"type ComplexAlias[T: int = str, **P = [], *Ts = *tuple[int, ...]] = Callable[P, tuple[T, *Ts]]",
				"type ComplexAlias[T: int = str, **P = [], *Ts = *tuple[int, ...]] = Callable[P, tuple[T, *Ts]]",
			);
			testRoundtrip(
				"type ComplexAlias[T: int = str, **P = [], *Ts = *tuple[int, ...]] = Callable[P, tuple[T, *Ts]]",
			);
		});
	});

	describe("FunctionType", () => {
		test("simple function type", () => {
			// This test will work once we have proper FunctionType module support
			// For now, it's a placeholder showing what the unparser should support
			// FunctionType nodes are typically used in .pyi stub files
		});
	});
});

describe("Type Parameter Integration", () => {
	test("basic type alias with type parameter", () => {
		const source = "type List[T] = list[T]";
		testRoundtrip(source);

		const ast = parse(source);
		const typeAlias = ast.body[0];
		assertNodeType(typeAlias, "TypeAlias");
		expect(typeAlias.type_params).toHaveLength(1);
		assertNodeType(typeAlias.type_params[0], "TypeVar");
		expect(typeAlias.type_params[0].name).toBe("T");
	});

	test("type alias with multiple type parameters", () => {
		const source = "type Dict[K, V] = dict[K, V]";
		testRoundtrip(source);

		const ast = parse(source);
		const typeAlias = ast.body[0];
		assertNodeType(typeAlias, "TypeAlias");
		expect(typeAlias.type_params).toHaveLength(2);
		assertNodeType(typeAlias.type_params[0], "TypeVar");
		assertNodeType(typeAlias.type_params[1], "TypeVar");
		expect(typeAlias.type_params[0].name).toBe("K");
		expect(typeAlias.type_params[1].name).toBe("V");
	});

	test("type alias with bounded type parameter", () => {
		const source = "type NumList[T: int] = list[T]";
		testRoundtrip(source);

		const ast = parse(source);
		const typeAlias = ast.body[0];
		assertNodeType(typeAlias, "TypeAlias");
		assertNodeType(typeAlias.type_params[0], "TypeVar");
		expect(typeAlias.type_params[0].bound?.nodeType).toBe("Name");
		assertNodeType(typeAlias.type_params[0].bound, "Name");
		expect(typeAlias.type_params[0].bound.id).toBe("int");
	});

	test("type alias with default type parameter", () => {
		const source = "type OptionalList[T = str] = list[T]";
		testRoundtrip(source);

		const ast = parse(source);
		const typeAlias = ast.body[0];
		assertNodeType(typeAlias, "TypeAlias");
		assertNodeType(typeAlias.type_params[0], "TypeVar");
		expect(typeAlias.type_params[0].default_value?.nodeType).toBe("Name");
		assertNodeType(typeAlias.type_params[0].default_value, "Name");
		expect(typeAlias.type_params[0].default_value.id).toBe("str");
	});

	test("function with type parameters", () => {
		const source = "def func[T](x: T) -> T: return x";
		testRoundtrip(source);

		const ast = parse(source);
		const funcDef = ast.body[0];
		assertNodeType(funcDef, "FunctionDef");
		expect(funcDef.type_params).toHaveLength(1);
		assertNodeType(funcDef.type_params[0], "TypeVar");
		expect(funcDef.type_params[0].name).toBe("T");
	});

	test("class with type parameters", () => {
		const source = "class Container[T]: pass";
		testRoundtrip(source);

		const ast = parse(source);
		const classDef = ast.body[0];
		assertNodeType(classDef, "ClassDef");
		expect(classDef.type_params).toHaveLength(1);
		assertNodeType(classDef.type_params[0], "TypeVar");
		expect(classDef.type_params[0].name).toBe("T");
	});
});

describe("PEP 695 type params and type alias with decorator target", () => {
	// Complementary to the "Type Parameter Integration" describe above: these
	// focus on return-type propagation through generic functions/classes and
	// on decorator-target validation for type-parameterized type aliases,
	// rather than on type_params field structure.
	test("generic function", () => {
		const stmt = parseStatement("def f[T](x: T) -> T:\n    return x\n");
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.returns?.nodeType).toBe("Name");
		expect(stmt.type_params).toHaveLength(1);
	});

	test("generic class", () => {
		const stmt = parseStatement("class Box[T]:\n    pass\n");
		assertNodeType(stmt, "ClassDef");
		expect(stmt.type_params).toHaveLength(1);
	});

	test("type alias with type params", () => {
		const stmt = parseStatement("type Alias[T] = list[T]\n");
		assertNodeType(stmt, "TypeAlias");
	});

	test("type alias without type params or a decorator", () => {
		const stmt = parseStatement("type X = int\n");
		assertNodeType(stmt, "TypeAlias");
		expect(stmt.type_params).toHaveLength(0);
		expect(stmt.value.nodeType).toBe("Name");
	});

	test("decorated type alias with type parameters", () => {
		const stmt = parseStatement("@deco\nAlias[T] = list[T]\n");
		assertNodeType(stmt, "TypeAlias");
	});

	test("invalid decorator target throws", () => {
		expect(() => parseStatement("@deco\nx = 1\n")).toThrow(
			/Invalid decorator target/,
		);
	});
});
