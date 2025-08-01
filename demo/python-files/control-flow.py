# Control Flow Demo
# Tests if statements, loops, and exception handling

def control_flow_examples():
    """Demonstrates various control flow constructs"""
    
    # If statements
    x = 10
    if x > 5:
        print("x is greater than 5")
    elif x == 5:
        print("x equals 5")
    else:
        print("x is less than 5")
    
    # Ternary operator
    result = "positive" if x > 0 else "negative"
    
    # For loops
    numbers = [1, 2, 3, 4, 5]
    for num in numbers:
        print(f"Number: {num}")
        if num == 3:
            continue
        if num == 5:
            break
    
    # For loop with else
    for i in range(3):
        print(f"Loop iteration: {i}")
    else:
        print("Loop completed normally")
    
    # While loops
    count = 0
    while count < 3:
        print(f"Count: {count}")
        count += 1
    
    # While with else
    i = 0
    while i < 2:
        print(f"While iteration: {i}")
        i += 1
    else:
        print("While loop completed")
    
    # List comprehension
    squares = [x**2 for x in range(5)]
    filtered = [x for x in numbers if x % 2 == 0]
    
    # Dictionary comprehension
    word_lengths = {word: len(word) for word in ["hello", "world", "python"]}
    
    # Set comprehension
    unique_squares = {x**2 for x in range(-3, 4)}
    
    # Generator expression
    even_squares = (x**2 for x in range(10) if x % 2 == 0)
    
    return squares, filtered, word_lengths

def exception_handling():
    """Demonstrates exception handling"""
    
    try:
        value = 10 / 0
    except ZeroDivisionError as e:
        print(f"Division by zero: {e}")
    except ValueError:
        print("Value error occurred")
    except (TypeError, AttributeError) as e:
        print(f"Type or attribute error: {e}")
    else:
        print("No exception occurred")
    finally:
        print("This always executes")
    
    # Multiple exception types
    try:
        result = int("not_a_number")
    except (ValueError, TypeError) as error:
        print(f"Conversion error: {error}")
    
    # Raising exceptions
    try:
        raise ValueError("This is a custom error")
    except ValueError as e:
        print(f"Caught custom error: {e}")

def nested_structures():
    """Demonstrates nested control structures"""
    
    matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    
    for i, row in enumerate(matrix):
        for j, value in enumerate(row):
            if value % 2 == 0:
                print(f"Even value {value} at ({i}, {j})")
            else:
                print(f"Odd value {value} at ({i}, {j})")

if __name__ == "__main__":
    control_flow_examples()
    exception_handling()
    nested_structures()
