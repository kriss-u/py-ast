import { describe, test } from "@jest/globals";
import { testRoundtrip, testUnparse } from "./test-helpers.js";

describe("Type Parameters", () => {
	describe("TypeVar", () => {
		test("simple type variable", () => {
			// Note: These tests will need actual parser support for type parameters
			// For now, we're testing the unparser with manually created AST nodes
			testUnparse("type SimpleAlias[T] = List[T]", "type SimpleAlias[T] = List[T]");
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
			testRoundtrip("type TupleWithDefault[*Ts = *tuple[str, ...]] = Tuple[*Ts]");
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
