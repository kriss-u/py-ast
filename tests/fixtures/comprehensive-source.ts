/**
 * A single Python source string exercising a broad cross-section of the
 * grammar in one module: imports, type aliases, decorated/async functions,
 * a decorated class with a property, nested control flow (if/for/try/while
 * with `else` clauses), a guarded `match` statement with an or-pattern,
 * comprehensions of every kind, complex expressions (walrus, chained
 * comparison, unary/boolean ops), collection literals, f-strings with
 * conversion and format specs, multiple/async context managers, unpacking
 * assignment, and an exception group (`except*`).
 *
 * Used by both the "comprehensive syntax coverage" test (which asserts
 * presence of essential node types) and, previously, a near-duplicate "AST
 * node coverage" test that this fixture's consumer superseded — see
 * `tests/integration.test.ts`.
 */
export const COMPREHENSIVE_SOURCE = `
# Module docstring
"""This is a comprehensive test of Python syntax"""

# Imports
import os
import sys as system
from typing import List, Dict, Optional
from .relative import something

# Type aliases (Python 3.12+)
type StringList = List[str]

# Global variables
global_var: int = 42
CONSTANT = "hello"

# Function definitions
def simple_func():
    pass

@decorator
def decorated_func(x: int, y: str = "default") -> bool:
    return x > 0

async def async_func(*args, **kwargs):
    await some_async_call()
    yield from async_generator()

# Class definition
@dataclass
class MyClass(BaseClass):
    attr: int = 1

    def method(self, param):
        self.attr = param

    @property
    def prop(self):
        return self.attr

# Control flow
if condition:
    for item in iterable:
        if item % 2 == 0:
            continue
        try:
            result = process(item)
        except ValueError as e:
            print(f"Error: {e}")
        except:
            raise
        else:
            results.append(result)
        finally:
            cleanup()
    else:
        print("Loop completed")
elif other_condition:
    while True:
        break
else:
    pass

# Match statement (Python 3.10+)
match value:
    case 1 | 2 | 3:
        print("small")
    case x if x > 100:
        print("large")
    case _:
        print("other")

# Comprehensions
list_comp = [x**2 for x in range(10) if x % 2 == 0]
dict_comp = {k: v for k, v in items.items()}
set_comp = {item.lower() for item in strings}
gen_exp = (x for x in range(1000000))

# Complex expressions
result = (lambda x: x**2 if x > 0 else -x**2)(value)
walrus = (n := len(data)) > 0
chained = 0 < x < 10 < y < 100
negated = -value
bitwise_not = ~flags
boolean = a and b or c

# Collections
lst = [1, 2, 3]
tpl = (1, 2, 3)
st = {1, 2, 3}
dct = {"a": 1, "b": 2}

# F-strings
message = f"Hello {name}, you have {count:,} items"
debug = f"Value is {value!r} with type {type(value).__name__}"

# Context managers
with open("file.txt") as f, suppress(ValueError):
    data = f.read()

async with async_context() as ctx:
    await ctx.process()

# Assignments
a, b = 1, 2
*rest, last = [1, 2, 3, 4, 5]
x += 1
obj.attr[key] = value

# Advanced features
assert condition, "This should be true"
del unwanted_var
global global_ref
nonlocal nonlocal_ref

# Exception handling
try:
    risky_operation()
except* ExceptionGroup as eg:
    for error in eg.exceptions:
        handle_error(error)
`;
