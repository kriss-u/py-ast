# Edge-case syntax stress test.
# Covers: oddly-indented comments/strings, decorator forms, lambda forms,
# comments interleaved with expressions, walrus, match, f-strings, unpacking,
# PEP 695 generics, positional-only/keyword-only params, and more.

    # This comment sits at a deeper indent than the code around it, which is
    # legal because comments don't participate in Python's indentation rules.
import os
        # Another over-indented comment, still fine before top-level code.
import sys as _sys, json  # trailing comment after multi-import

    # Over-indented module docstring-like string statement (not the real
    # docstring since it isn't first, but still a valid standalone string).
"module note, weirdly indented above"


# --- decorators: bare, called, attribute-access, subscripted, stacked, walrus-in-call ---

def plain_decorator(f):
    return f


def parametrized(*args, **kwargs):
    def wrap(f):
        return f
    return wrap


class Registry:
    items = []

    @staticmethod
    def register(f):
        Registry.items.append(f)
        return f


@plain_decorator
@parametrized(1, 2, key="value")  # decorator call with mixed args
@Registry.register  # attribute-access decorator
@(lambda f: f)  # PEP 614: arbitrary expression as decorator (parenthesized)
def decorated(
    a,
    # comment between parameters
    b,
    *,
    c=1,
    **rest,
):
    # comment as the first statement in a function body
    return a, b, c, rest


@parametrized(*[1, 2], **{"key": "val"})  # starred/double-starred decorator args
class Widget:
    """Docstring immediately followed by a comment on the next line."""
    # comment right after docstring, before any real statement
    kind = "widget"


# --- lambdas: every parameter flavor, nested, immediately invoked, in default args ---

no_args = lambda: 42
one_default = lambda x=(1 + 2): x  # parenthesized expression as default
star_args = lambda *args, **kwargs: (args, kwargs)
mixed = lambda a, b=2, *args, c, d=4, **kwargs: (a, b, args, c, d, kwargs)
pos_only_like = lambda a, b, /, c, *, d: (a, b, c, d)  # slash in lambda params
nested_lambda = lambda f: (lambda x: f(f(x)))
immediately_invoked = (lambda x, y: x * y)(3, 4)


def default_uses_lambda(callback=lambda: None, transform=lambda v: v * 2):
    return callback(), transform(5)


sorted_pairs = sorted(
    [(1, "b"), (2, "a")],
    key=lambda pair: (  # comment right after the opening paren of a lambda body
        pair[1],
        pair[0],
    ),
)


# --- comments intertwined with every kind of statement/expression ---

x = (
    1  # first operand
    + 2  # second operand
    # comment on its own line inside the parens
    + 3
)

values = [
    1,  # one
    2,  # two
    # comment before the closing bracket
]

config = {
    "a": 1,  # a comment
    # standalone comment between entries
    "b": 2,
}

if (
    x > 0  # positive check
    # comment before and
    and x < 100  # upper bound
):
    pass  # comment after pass
elif x == 0:  # comment on elif line
    pass
else:
    # comment as sole content of else body
    pass

for i in range(3):  # loop comment
    # comment before continue
    if i == 1:
        continue
    # comment before break
    if i == 2:
        break
else:
    # for-else comment
    pass

while (n := x) > 0:  # walrus in while condition, comment after
    x -= 1
    # comment at end of while body

try:
    # comment as first statement in try
    1 / 0
except ZeroDivisionError as e:  # comment on except line
    # comment in except body
    pass
except (ValueError, TypeError):
    pass
else:
    # try-else comment
    pass
finally:
    # finally comment
    pass


# --- match statement with varied patterns and inline comments ---

def handle(command):
    match command:  # comment after match subject
        case [
            "go",
            direction,
        ] if direction in ("n", "s", "e", "w"):  # guard with comment
            return direction
        case {"action": "move", "steps": int(steps), **rest}:  # mapping pattern
            return steps, rest
        case Point(x=0, y=0):  # class pattern
            return "origin"
        case Point(x=px, y=py):  # class pattern with keyword bindings
            return px, py
        case [first, *middle, last]:  # sequence unpack pattern
            return first, middle, last
        case 1 | 2 | 3:  # or-pattern
            return "small"
        case str() | bytes():  # type-only or-pattern
            return "text-like"
        case _:
            return None


class Point:
    __match_args__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y


# --- unpacking, starred assignment, f-strings, and string edge cases ---

first, *middle, last = [1, 2, 3, 4, 5]
a, (b, c), *d = (1, (2, 3), 4, 5)
combined = [*range(3), *range(3, 6)]
merged = {**{"a": 1}, "b": 2, **{"c": 3}}  # dict unpacking

name = "world"
greeting = f"hello, {name!r:>{10}}"  # nested format spec with conversion
multi = f"{name} has {len(name)} chars" f" and more"  # implicit concat of f-strings
raw_bytes = rb"raw\bytes"
triple = """line one
    # this looks like a comment but is actually string content
line three"""
adjacent = (
    "part one "
    # comment between adjacent string literals
    "part two"
)


# --- PEP 695 generics / type params, positional-only params, complex defaults ---

def first_of[T](items: list[T]) -> T:  # generic function
    return items[0]


class Box[T]:  # generic class
    def __init__(self, value: T) -> None:
        self.value = value


type Alias[T] = list[T]  # PEP 695 type alias


def positional_only(a, b, /, c, d, *, e, f):
    return a, b, c, d, e, f


def everything(
    a,
    b=1,
    /,
    c=2,
    *args,
    d,
    e=5,
    **kwargs,
):  # comment right after the closing paren, before colon-adjacent body
    return a, b, c, args, d, e, kwargs


# --- async edge cases ---

async def async_generator_stuff():
    async with open("x") as f, open("y") as g:  # multiple async context managers
        pass
    async for item in aiter_thing():  # comment on async for line
        yield item


async def async_stuff():
    result = [x async for x in aiter_thing() if x]  # async comprehension
    return result


async def aiter_thing():
    yield 1


# --- chained comparisons, ternary, walrus in comprehension, nested f-strings ---

between = 0 < x < 10 <= 100  # chained comparison
ternary = "yes" if (flag := True) else "no"  # walrus inside ternary
filtered = [y for x in range(10) if (y := x * 2) > 5]  # walrus in comprehension
deep_fstring = f"{f'{f"{name}"}'}"  # nested f-strings (PEP 701)

print(deep_fstring)