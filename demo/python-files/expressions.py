# Expression Types Demo
# Tests all types of Python expressions and operators

# Arithmetic expressions
def arithmetic_operations():
    """Test all arithmetic operators and expressions"""
    
    # Basic arithmetic
    a = 10
    b = 3
    
    addition = a + b           # 13
    subtraction = a - b        # 7
    multiplication = a * b     # 30
    division = a / b           # 3.333...
    floor_division = a // b    # 3
    modulo = a % b            # 1
    exponentiation = a ** b    # 1000
    
    # Unary operators
    positive = +a              # 10
    negative = -a              # -10
    
    # Complex expressions
    complex_expr = (a + b) * 2 - (a - b) / 2
    nested_expr = ((a ** 2) + (b ** 2)) ** 0.5
    
    return {
        "addition": addition,
        "subtraction": subtraction,
        "multiplication": multiplication,
        "division": division,
        "floor_division": floor_division,
        "modulo": modulo,
        "exponentiation": exponentiation,
        "complex": complex_expr,
        "nested": nested_expr
    }

# Comparison expressions
def comparison_operations():
    """Test all comparison operators"""
    
    x, y = 10, 20
    
    equal = x == y             # False
    not_equal = x != y         # True
    less_than = x < y          # True
    less_equal = x <= y        # True
    greater_than = x > y       # False
    greater_equal = x >= y     # False
    
    # Identity comparisons
    a = [1, 2, 3]
    b = [1, 2, 3]
    c = a
    
    is_same = a is c           # True
    is_not_same = a is not b   # True
    
    # Membership tests
    in_list = 2 in a           # True
    not_in_list = 5 not in a   # True
    
    # Chained comparisons
    chained = 1 < x < 50       # True
    complex_chain = 0 <= x <= 100 and x != 50  # True
    
    return {
        "equal": equal,
        "not_equal": not_equal,
        "less_than": less_than,
        "identity": is_same,
        "membership": in_list,
        "chained": chained
    }

# Logical expressions
def logical_operations():
    """Test logical operators and boolean expressions"""
    
    true_val = True
    false_val = False
    
    # Basic logical operators
    and_result = true_val and false_val    # False
    or_result = true_val or false_val      # True
    not_result = not true_val              # False
    
    # Short-circuit evaluation
    short_circuit_and = False and (1/0)    # False (no division error)
    short_circuit_or = True or (1/0)       # True (no division error)
    
    # Complex logical expressions
    x = 15
    complex_logic = (x > 10) and (x < 20) and (x % 5 == 0)
    nested_logic = not (x < 5 or x > 25)
    
    # Truthy/falsy values
    truthy_list = [1, 2, 3] and "non-empty"
    falsy_list = [] or "default"
    
    return {
        "and": and_result,
        "or": or_result,
        "not": not_result,
        "complex": complex_logic,
        "truthy": truthy_list,
        "falsy": falsy_list
    }

# Bitwise expressions
def bitwise_operations():
    """Test bitwise operators"""
    
    a = 0b1010  # 10 in binary
    b = 0b1100  # 12 in binary
    
    bitwise_and = a & b        # 0b1000 = 8
    bitwise_or = a | b         # 0b1110 = 14
    bitwise_xor = a ^ b        # 0b0110 = 6
    bitwise_not = ~a           # Complement
    left_shift = a << 2        # 0b101000 = 40
    right_shift = a >> 1       # 0b101 = 5
    
    return {
        "and": bitwise_and,
        "or": bitwise_or,
        "xor": bitwise_xor,
        "left_shift": left_shift,
        "right_shift": right_shift
    }

# Assignment expressions (walrus operator)
def assignment_expressions():
    """Test assignment expressions and compound assignments"""
    
    # Compound assignment operators
    x = 10
    x += 5    # x = x + 5 = 15
    x -= 3    # x = x - 3 = 12
    x *= 2    # x = x * 2 = 24
    x //= 4   # x = x // 4 = 6
    x %= 5    # x = x % 5 = 1
    x **= 3   # x = x ** 3 = 1
    
    # Walrus operator (assignment expression)
    data = [1, 2, 3, 4, 5]
    filtered = [y for x in data if (y := x * 2) > 4]
    
    # Multiple assignment
    a, b, c = 1, 2, 3
    x = y = z = 42
    
    # Augmented assignment with other operators
    bits = 0b1010
    bits &= 0b1100   # bitwise AND assignment
    bits |= 0b0001   # bitwise OR assignment
    bits ^= 0b1111   # bitwise XOR assignment
    bits <<= 1       # left shift assignment
    bits >>= 2       # right shift assignment
    
    return {
        "final_x": x,
        "filtered": filtered,
        "multiple": (a, b, c),
        "chained": (x, y, z),
        "bits": bits
    }

# Collection expressions
def collection_expressions():
    """Test various collection and indexing expressions"""
    
    # List expressions
    simple_list = [1, 2, 3, 4, 5]
    nested_list = [[1, 2], [3, 4], [5, 6]]
    mixed_list = [1, "hello", [2, 3], {"key": "value"}]
    
    # Tuple expressions
    simple_tuple = (1, 2, 3)
    single_tuple = (42,)  # Note the comma
    nested_tuple = ((1, 2), (3, 4))
    
    # Dictionary expressions
    simple_dict = {"a": 1, "b": 2, "c": 3}
    nested_dict = {
        "user": {"name": "Alice", "age": 30},
        "settings": {"theme": "dark", "lang": "en"}
    }
    dict_with_expressions = {x: x**2 for x in range(5)}
    
    # Set expressions
    simple_set = {1, 2, 3, 4, 5}
    set_from_list = set([1, 2, 2, 3, 3, 4])
    
    # Indexing and slicing
    first_item = simple_list[0]
    last_item = simple_list[-1]
    slice_result = simple_list[1:4]
    step_slice = simple_list[::2]
    negative_slice = simple_list[::-1]
    
    # Nested indexing
    nested_access = nested_list[1][0]
    dict_access = nested_dict["user"]["name"]
    
    # Multiple indexing
    matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    diagonal = [matrix[i][i] for i in range(len(matrix))]
    
    return {
        "lists": {
            "simple": simple_list,
            "nested": nested_list,
            "mixed": mixed_list
        },
        "tuples": {
            "simple": simple_tuple,
            "single": single_tuple,
            "nested": nested_tuple
        },
        "dicts": {
            "simple": simple_dict,
            "nested": nested_dict,
            "comprehension": dict_with_expressions
        },
        "sets": {
            "simple": simple_set,
            "from_list": set_from_list
        },
        "indexing": {
            "first": first_item,
            "last": last_item,
            "slice": slice_result,
            "negative": negative_slice,
            "nested": nested_access,
            "diagonal": diagonal
        }
    }

# Function call expressions
def function_call_expressions():
    """Test various function call patterns"""
    
    # Simple function calls
    def simple_func(x, y):
        return x + y
    
    def default_args(a, b=10, c=20):
        return a + b + c
    
    def var_args(*args, **kwargs):
        return len(args) + len(kwargs)
    
    # Different call patterns
    simple_call = simple_func(5, 10)
    default_call = default_args(5)
    keyword_call = default_args(a=5, c=30)
    mixed_call = default_args(5, c=30)
    
    # Variable arguments
    args_call = var_args(1, 2, 3, 4, 5)
    kwargs_call = var_args(a=1, b=2, c=3)
    mixed_var_call = var_args(1, 2, a=3, b=4)
    
    # Unpacking in calls
    numbers = [1, 2, 3]
    params = {"b": 15, "c": 25}
    unpacked_call = default_args(5, *numbers[:2])
    kwargs_unpacked = default_args(**{"a": 5, "b": 15})
    
    # Method calls
    text = "hello world"
    upper_text = text.upper()
    split_text = text.split(" ")
    replaced_text = text.replace("world", "Python")
    
    # Chained method calls
    text = "  Hello World  "
    result = text.strip().lower()
    result = result.replace(" ", "_")
    
    # Lambda calls
    square = lambda x: x ** 2
    lambda_result = square(5)
    
    # Nested function calls
    nested = len(str(abs(-42)))
    
    return {
        "simple": simple_call,
        "default": default_call,
        "keyword": keyword_call,
        "var_args": args_call,
        "unpacked": unpacked_call,
        "methods": {
            "upper": upper_text,
            "split": split_text,
            "chained": result
        },
        "lambda": lambda_result,
        "nested": nested
    }

# Attribute access expressions
def attribute_expressions():
    """Test attribute access patterns"""
    
    class Person:
        def __init__(self, name, age):
            self.name = name
            self.age = age
            self.metadata = {"created": "2023", "version": 1}
        
        def greet(self):
            return f"Hello, I'm {self.name}"
        
        @property
        def description(self):
            return f"{self.name} ({self.age} years old)"
    
    person = Person("Alice", 30)
    
    # Simple attribute access
    name = person.name
    age = person.age
    
    # Method access (but not called)
    greet_method = person.greet
    
    # Method call
    greeting = person.greet()
    
    # Property access
    description = person.description
    
    # Nested attribute access
    metadata_version = person.metadata.get("version", 0)
    
    # Chained attribute access
    import datetime
    current_year = datetime.datetime.now().year
    
    # Dynamic attribute access
    attr_name = "name"
    dynamic_name = getattr(person, attr_name, "Unknown")
    
    return {
        "simple": {"name": name, "age": age},
        "method_call": greeting,
        "property": description,
        "nested": metadata_version,
        "dynamic": dynamic_name,
        "current_year": current_year
    }

# Conditional expressions (ternary operator)
def conditional_expressions():
    """Test conditional (ternary) expressions"""
    
    x = 15
    
    # Simple conditional
    result = "positive" if x > 0 else "negative"
    
    # Nested conditionals
    size = "small" if x < 10 else "medium" if x < 20 else "large"
    
    # Conditional with function calls
    def expensive_operation():
        return "expensive result"
    
    def cheap_operation():
        return "cheap result"
    
    operation_result = expensive_operation() if x > 100 else cheap_operation()
    
    # Conditional in list comprehension
    numbers = list(range(-5, 6))
    abs_values = [n if n >= 0 else -n for n in numbers]
    
    # Multiple conditions
    status = "high" if x > 50 else "medium" if x > 20 else "low"
    
    return {
        "simple": result,
        "nested": size,
        "function_call": operation_result,
        "in_comprehension": abs_values,
        "multiple": status
    }

# Generator expressions
def generator_expressions():
    """Test generator expressions and yield"""
    
    # Simple generator expression
    squares_gen = (x**2 for x in range(10))
    squares_list = list(squares_gen)
    
    # Filtered generator
    even_squares = (x**2 for x in range(20) if x % 2 == 0)
    
    # Nested generator
    matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    flattened = (item for row in matrix for item in row)
    
    # Generator function
    def fibonacci_gen(n):
        a, b = 0, 1
        for _ in range(n):
            yield a
            a, b = b, a + b
    
    fib_numbers = list(fibonacci_gen(10))
    
    # Generator with send
    def echo_generator():
        while True:
            received = yield
            if received is not None:
                yield f"Echo: {received}"
    
    return {
        "squares": squares_list,
        "even_squares": list(even_squares),
        "flattened": list(flattened),
        "fibonacci": fib_numbers
    }

# Main demonstration function
def demonstrate_expressions():
    """Demonstrate all expression types"""
    
    results = {
        "arithmetic": arithmetic_operations(),
        "comparison": comparison_operations(),
        "logical": logical_operations(),
        "bitwise": bitwise_operations(),
        "assignment": assignment_expressions(),
        "collections": collection_expressions(),
        "function_calls": function_call_expressions(),
        "attributes": attribute_expressions(),
        "conditional": conditional_expressions(),
        "generators": generator_expressions()
    }
    
    return results

if __name__ == "__main__":
    import json
    
    print("Python Expression Types Demo")
    print("=" * 40)
    
    results = demonstrate_expressions()
    
    for category, data in results.items():
        print(f"\n{category.upper()}:")
        print("-" * 20)
        print(json.dumps(data, indent=2, default=str))
    
    # Additional complex expressions
    print("\nCOMPLEX EXPRESSIONS:")
    print("-" * 20)
    
    # Complex nested expression
    data = [{"values": [1, 2, 3]}, {"values": [4, 5, 6]}]
    total = sum(sum(item["values"]) for item in data if "values" in item)
    print(f"Complex sum: {total}")
    
    # Expression with multiple operators
    x, y, z = 10, 20, 30
    complex_result = (x + y) * z // (x - 5) ** 2 if x > 5 else 0
    print(f"Complex calculation: {complex_result}")
    
    # String formatting expressions
    name, age = "Alice", 30
    formatted = f"User {name} is {age} years old and born in {2023 - age}"
    print(f"Formatted string: {formatted}")
