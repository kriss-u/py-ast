import { parse, unparse } from "../src/index.js";

describe("Type Parameter Integration Test", () => {
	test("basic type alias with type parameter", () => {
		const source = "type List[T] = list[T]";
		const ast = parse(source);
		const unparsed = unparse(ast);
		console.log("AST:", JSON.stringify(ast, null, 2));
		console.log("Unparsed:", unparsed);
		
		// Check that type_params is populated
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.nodeType).toBe("TypeAlias");
		expect(typeAlias.type_params).toHaveLength(1);
		expect(typeAlias.type_params[0].nodeType).toBe("TypeVar");
		expect(typeAlias.type_params[0].name).toBe("T");
		
		// Check round-trip works
		expect(unparsed).toContain("type List[T] = list[T]");
	});

	test("type alias with multiple type parameters", () => {
		const source = "type Dict[K, V] = dict[K, V]";
		const ast = parse(source);
		const unparsed = unparse(ast);
		
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.type_params).toHaveLength(2);
		expect(typeAlias.type_params[0].name).toBe("K");
		expect(typeAlias.type_params[1].name).toBe("V");
		expect(unparsed).toContain("type Dict[K, V] = dict[K, V]");
	});

	test("type alias with bounded type parameter", () => {
		const source = "type NumList[T: int] = list[T]";
		const ast = parse(source);
		
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.type_params[0].bound?.nodeType).toBe("Name");
		expect(typeAlias.type_params[0].bound?.id).toBe("int");
	});

	test("type alias with default type parameter", () => {
		const source = "type OptionalList[T = str] = list[T]";
		const ast = parse(source);
		
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.type_params[0].default_value?.nodeType).toBe("Name");
		expect(typeAlias.type_params[0].default_value?.id).toBe("str");
	});

	test("ParamSpec type parameter", () => {
		const source = "type Func[**P] = callable[P, int]";
		const ast = parse(source);
		
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.type_params[0].nodeType).toBe("ParamSpec");
		expect(typeAlias.type_params[0].name).toBe("P");
	});

	test("TypeVarTuple type parameter", () => {
		const source = "type Tuple[*Ts] = tuple";
		const ast = parse(source);
		
		const typeAlias = ast.body[0] as any;
		expect(typeAlias.type_params[0].nodeType).toBe("TypeVarTuple");
		expect(typeAlias.type_params[0].name).toBe("Ts");
	});

	test("generic function", () => {
		const source = "def identity[T](x: T) -> T:\n    return x";
		const ast = parse(source);
		
		const funcDef = ast.body[0] as any;
		expect(funcDef.nodeType).toBe("FunctionDef");
		expect(funcDef.type_params).toHaveLength(1);
		expect(funcDef.type_params[0].nodeType).toBe("TypeVar");
		expect(funcDef.type_params[0].name).toBe("T");
	});

	test("generic class", () => {
		const source = "class Container[T]:\n    pass";
		const ast = parse(source);
		
		const classDef = ast.body[0] as any;
		expect(classDef.nodeType).toBe("ClassDef");
		expect(classDef.type_params).toHaveLength(1);
		expect(classDef.type_params[0].nodeType).toBe("TypeVar");
		expect(classDef.type_params[0].name).toBe("T");
	});
});
