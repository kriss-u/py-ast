# Edge-case syntax stress test, part 2 — constructs not covered by edge-cases.py.
# Covers: except*, parenthesized with-items, extended slicing, numeric literal
# forms, del/global/nonlocal, PEP 695 bounds/TypeVarTuple/ParamSpec, augmented
# assignment operators, yield forms, string prefix combinations, and more.

# --- except* (PEP 654 exception groups) ---

def handle_group():
    try:
        raise ExceptionGroup("eg", [ValueError("v"), TypeError("t")])
    except* ValueError as eg:  # comment on except* line
        print("value", eg.exceptions)
    except* (TypeError, KeyError):
        pass


# --- parenthesized context managers (PEP 617) ---

def multi_with():
    with (
        open("a") as f,
        open("b") as g,  # trailing comma allowed here
    ):
        return f, g


def multi_with_no_as():
    with (open("a"), open("b")):
        pass


# --- extended slicing ---


class AnyIndex:
    """Accepts any subscript (tuples of slices, Ellipsis, ...), like a numpy array."""

    def __getitem__(self, index):
        return index


data = list(range(20))
step_slice = data[::2]
neg_step = data[::-1]
open_start = data[:5:2]
open_stop = data[5::2]
full_slice = data[1:10:2]

array_like = AnyIndex()
multi_dim = array_like[1:2, 3:4]  # tuple-of-slices subscript (numpy-style)
ellipsis_index = array_like[...]
mixed_index = array_like[1, ..., ::-1]


# --- numeric literal forms ---

hex_lit = 0xFF_FF
oct_lit = 0o17_7
bin_lit = 0b1010_1010
underscored_int = 1_000_000
float_underscored = 1_000.000_1
sci_notation = 6.02e23
sci_notation_neg = 1.5e-10
complex_lit = 3 + 4j
complex_bare = 5j
leading_dot_float = .5
trailing_dot_float = 5.


# --- del / global / nonlocal ---

counter = 0


def increment():
    global counter
    counter += 1


def make_counter():
    n = 0

    def inc():
        nonlocal n
        n += 1
        return n

    return inc


some_dict = {"a": 1, "b": 2}
some_list = [1, 2, 3]
del some_dict["a"], some_list[0]


# --- PEP 695 bounds, constraints, defaults; TypeVarTuple; ParamSpec ---

def bound_generic[T: int](x: T) -> T:  # bound type param
    return x


def constrained_generic[T: (int, str)](x: T) -> T:  # constrained type param
    return x


def default_generic[T = int](x: T | None = None) -> T:  # PEP 696 default
    return x  # type: ignore


class VariadicBox[*Ts]:  # TypeVarTuple
    def __init__(self, *values: *Ts) -> None:
        self.values = values


def with_paramspec[**P](f):  # ParamSpec
    def wrapper(*args: P.args, **kwargs: P.kwargs):
        return f(*args, **kwargs)

    return wrapper


type Pair[T] = tuple[T, T]  # generic type alias
type BoundAlias[T: int] = list[T]  # bound type alias


# --- augmented assignment, every operator ---

n = 10
n += 1
n -= 1
n *= 2
n /= 2  # true division makes n a float
n //= 2
n %= 3
n **= 2
n = int(n)  # back to int for the bitwise operators below
n &= 0b1
n |= 0b10
n ^= 0b11
n >>= 1
n <<= 1


class Matrix:
    def __matmul__(self, other):
        return self

    def __imatmul__(self, other):
        return self


m = Matrix()
m @= Matrix()  # matrix-multiply augmented assignment


# --- yield forms ---

def generator_forms():
    x = yield  # bare yield
    y = yield 1  # yield with value
    z = yield 1, 2  # yield with implicit tuple
    w = yield from range(3)  # yield from
    return x, y, z, w


# --- string prefix combinations ---

raw = r"raw\nstring"
byte_str = b"bytes"
raw_byte = rb"raw\bytes"
byte_raw = br"byte\raw"
raw_upper = R"upper-R raw"
f_upper = F"upper-F fstring {1 + 1}"
concatenated_mixed = "a" "b" r"c\d"  # implicit concat of plain + raw


# --- assert, with message ---

positive_value = 5
assert positive_value > 0
assert positive_value > 0, "positive_value must stay positive"


# --- starred expressions in call/return/yield ---


def take_many(*args):
    return args


def star_return():
    items = [1, 2, 3]
    return (*items, 4)


starred_call = take_many(*[1, 2], 3, *[4, 5])


# --- comprehensions with multiple for/if clauses ---

pairs = [(x, y) for x in range(3) for y in range(3) if x != y if (x + y) % 2 == 0]
nested_comp = [[y for y in range(x)] for x in range(4)]
set_comp = {x * x for x in range(5) if x % 2}
dict_comp = {str(x): x for x in range(3)}
gen_expr = (x for x in range(5))
sum(x for x in range(5))  # generator expr as sole call argument


# --- conditional import / try-except at module scope ---

try:
    import tomllib
except ImportError:
    import tomli as tomllib


# --- nested/complex class patterns in match ---

class Coord3:
    __match_args__ = ("x", "y", "z")

    def __init__(self, x, y, z):
        self.x, self.y, self.z = x, y, z


def classify(point):
    match point:
        case Coord3(0, 0, 0):
            return "origin"
        case Coord3(x, y, z) if x == y == z:
            return "diagonal"
        case Coord3(x=0, y=y, z=_) | Coord3(x=y, y=0, z=_):  # both alts bind `y`
            return "on-plane"
        case [Coord3(), *rest] if rest:
            return "list-of-coords"
        case {"nested": {"deep": value}}:
            return value
        case (1, 2) | [1, 2]:
            return "pair"
        case object(real=r) if isinstance(r, int):
            return "has-real"
        case _:
            return None
