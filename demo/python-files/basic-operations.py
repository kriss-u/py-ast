# Basic Operations Demo
# Tests fundamental Python constructs

# Variables and assignments
x = 42
y = "hello world"
z = [1, 2, 3, 4, 5]
d = {"key": "value", "number": 123}

# Arithmetic operations
result = x + 10
product = x * 2
division = x / 2
power = x ** 2
modulo = x % 5

# String operations
greeting = "Hello, " + y
formatted = f"Value is {x}"
multiline = """
This is a
multiline string
"""

# Boolean operations
flag = True
condition = x > 30 and y != ""
negation = not flag

# List operations
first_item = z[0]
slice_result = z[1:3]
z.append(6)
length = len(z)

# Dictionary operations
value = d["key"]
d["new_key"] = "new_value"
keys = list(d.keys())

# Tuple operations
coordinates = (10, 20)
x_coord, y_coord = coordinates

# Set operations
unique_nums = {1, 2, 3, 3, 4}
intersection = {1, 2, 3} & {3, 4, 5}

print(f"Final result: {result}")
