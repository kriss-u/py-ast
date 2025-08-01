# Advanced Python Features Demo
"""
This file demonstrates advanced Python language features
including async/await, generators, decorators, and context managers.
"""

import asyncio
from typing import Iterator

# Async/await examples
async def simple_async_function():
    """Simple async function example."""
    await asyncio.sleep(0.1)
    return "async result"

async def async_generator() -> Iterator[int]:
    """Async generator function."""
    for i in range(5):
        await asyncio.sleep(0.01)
        yield i * 2

# Generator functions
def fibonacci_generator(n: int) -> Iterator[int]:
    """Generate fibonacci numbers up to n."""
    a, b = 0, 1
    count = 0
    while count < n:
        yield a
        a, b = b, a + b
        count += 1

def comprehension_examples():
    """Examples of various comprehensions."""
    # List comprehensions
    squares = [x**2 for x in range(10) if x % 2 == 0]
    
    # Dictionary comprehensions  
    word_lengths = {word: len(word) for word in ["hello", "world", "python"]}
    
    # Set comprehensions
    unique_lengths = {len(word) for word in ["hello", "world", "python", "hi"]}
    
    # Generator expressions
    squares_gen = (x**2 for x in range(10))
    sum_of_squares = sum(squares_gen)
    
    return squares, word_lengths, unique_lengths, sum_of_squares

# Decorators
def simple_decorator(func):
    """Simple decorator example."""
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"Finished {func.__name__}")
        return result
    return wrapper

def decorator_with_params(message):
    """Decorator factory with parameters."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            print(f"{message}: {func.__name__}")
            return func(*args, **kwargs)
        return wrapper
    return decorator

@simple_decorator
def decorated_function():
    """Function with simple decorator."""
    return "decorated result"

@decorator_with_params("Custom message")
def parameterized_decorated_function():
    """Function with parameterized decorator."""
    return "param decorated result"

# Context managers
class SimpleContextManager:
    """Simple context manager example."""
    
    def __init__(self, name):
        self.name = name
    
    def __enter__(self):
        print(f"Entering context: {self.name}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        print(f"Exiting context: {self.name}")
        return False

# Class examples with inheritance
class Animal:
    """Base animal class."""
    
    def __init__(self, name):
        self.name = name
    
    def speak(self):
        pass

class Dog(Animal):
    """Dog class inheriting from Animal."""
    
    def speak(self):
        return f"{self.name} says Woof!"

class Cat(Animal):
    """Cat class inheriting from Animal."""
    
    def speak(self):
        return f"{self.name} says Meow!"

# Property examples
class Circle:
    """Circle class with property decorators."""
    
    def __init__(self, radius):
        self._radius = radius
    
    @property
    def radius(self):
        return self._radius
    
    @radius.setter
    def radius(self, value):
        if value < 0:
            raise ValueError("Radius cannot be negative")
        self._radius = value
    
    @property
    def area(self):
        return 3.14159 * self._radius ** 2

# Exception handling
class CustomError(Exception):
    """Custom exception class."""
    pass

def risky_function(should_fail=False):
    """Function that might raise an exception."""
    if should_fail:
        raise CustomError("Something went wrong!")
    return "Success!"

# Usage examples
if __name__ == "__main__":
    print("=== Advanced Python Features Demo ===")
    
    # Generator examples
    print("\n1. Generator Examples:")
    fib_gen = fibonacci_generator(8)
    print(f"Fibonacci: {list(fib_gen)}")
    
    # Comprehension examples
    print("\n2. Comprehension Examples:")
    squares, word_lengths, unique_lengths, sum_squares = comprehension_examples()
    print(f"Squares: {squares}")
    print(f"Word lengths: {word_lengths}")
    print(f"Sum of squares: {sum_squares}")
    
    # Decorator examples
    print("\n3. Decorator Examples:")
    result1 = decorated_function()
    result2 = parameterized_decorated_function()
    
    # Context manager examples
    print("\n4. Context Manager Examples:")
    with SimpleContextManager("demo") as cm:
        print(f"Inside context with: {cm.name}")
    
    # Class examples
    print("\n5. Class Examples:")
    dog = Dog("Buddy")
    cat = Cat("Whiskers")
    print(dog.speak())
    print(cat.speak())
    
    # Property examples
    print("\n6. Property Examples:")
    circle = Circle(5)
    print(f"Circle area: {circle.area}")
    circle.radius = 10
    print(f"New circle area: {circle.area}")
    
    # Exception handling
    print("\n7. Exception Handling:")
    try:
        risky_function(False)
        print("Function succeeded")
    except CustomError as e:
        print(f"Caught exception: {e}")
    
    try:
        risky_function(True)
    except CustomError as e:
        print(f"Caught exception: {e}")
    
    print("\n=== Demo completed ===")
