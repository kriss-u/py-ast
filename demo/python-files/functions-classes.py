# Functions and Classes Demo
# Tests function definitions, classes, decorators, and advanced features

import functools
from typing import List, Dict, Optional, Union

# Simple function
def greet(name: str) -> str:
    """Simple greeting function with type hints"""
    return f"Hello, {name}!"

# Function with default arguments
def create_person(name: str, age: int = 0, city: str = "Unknown") -> dict:
    """Creates a person dictionary with default values"""
    return {
        "name": name,
        "age": age,
        "city": city
    }

# Function with *args and **kwargs
def flexible_function(*args, **kwargs):
    """Function that accepts variable arguments"""
    print(f"Args: {args}")
    print(f"Kwargs: {kwargs}")
    return len(args) + len(kwargs)

# Function with keyword-only arguments
def strict_function(required: str, *, keyword_only: int = 10, another: str = "default"):
    """Function with keyword-only parameters"""
    return f"{required}: {keyword_only}, {another}"

# Async function
async def async_operation(data: List[int]) -> int:
    """Async function example"""
    # Simulate async work
    total = sum(data)
    return total

# Lambda functions
square = lambda x: x ** 2
add_numbers = lambda a, b: a + b

# Higher-order functions
def apply_operation(numbers: List[int], operation):
    """Applies an operation to all numbers"""
    return [operation(num) for num in numbers]

# Decorator function
def timing_decorator(func):
    """Decorator that prints function execution info"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"Finished {func.__name__}")
        return result
    return wrapper

# Parameterized decorator
def repeat(times: int):
    """Decorator that repeats function execution"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            results = []
            for _ in range(times):
                results.append(func(*args, **kwargs))
            return results
        return wrapper
    return decorator

# Decorated functions
@timing_decorator
def slow_operation(n: int) -> int:
    """A function that takes some time"""
    return sum(range(n))

@repeat(3)
def get_random_number() -> int:
    """Gets a 'random' number"""
    return 42

# Simple class
class Animal:
    """Base animal class"""
    
    def __init__(self, name: str, species: str):
        self.name = name
        self.species = species
        self._age = 0  # Protected attribute
        self.__id = id(self)  # Private attribute
    
    def make_sound(self) -> str:
        """Make a generic animal sound"""
        return "Some animal sound"
    
    def get_info(self) -> dict:
        """Get animal information"""
        return {
            "name": self.name,
            "species": self.species,
            "age": self._age
        }
    
    @property
    def age(self) -> int:
        """Age property getter"""
        return self._age
    
    @age.setter
    def age(self, value: int):
        """Age property setter"""
        if value >= 0:
            self._age = value
        else:
            raise ValueError("Age cannot be negative")
    
    @staticmethod
    def get_species_count() -> int:
        """Static method example"""
        return 1000000  # Placeholder
    
    @classmethod
    def create_dog(cls, name: str):
        """Class method to create a dog"""
        return cls(name, "Dog")

# Inheritance
class Dog(Animal):
    """Dog class inheriting from Animal"""
    
    def __init__(self, name: str, breed: str = "Mixed"):
        super().__init__(name, "Dog")
        self.breed = breed
    
    def make_sound(self) -> str:
        """Override parent method"""
        return "Woof!"
    
    def fetch(self, item: str) -> str:
        """Dog-specific method"""
        return f"{self.name} fetches the {item}"

# Multiple inheritance
class Mammal:
    """Mammal mixin class"""
    
    def give_birth(self) -> str:
        return "Giving birth to live young"

class FlyingAnimal:
    """Flying animal mixin"""
    
    def fly(self) -> str:
        return "Flying through the air"

class Bat(Mammal, FlyingAnimal, Animal):
    """Bat with multiple inheritance"""
    
    def __init__(self, name: str):
        Animal.__init__(self, name, "Bat")
    
    def make_sound(self) -> str:
        return "Screech!"

# Abstract-like class (using NotImplementedError)
class Shape:
    """Abstract shape class"""
    
    def area(self) -> float:
        raise NotImplementedError("Subclasses must implement area method")
    
    def perimeter(self) -> float:
        raise NotImplementedError("Subclasses must implement perimeter method")

class Rectangle(Shape):
    """Rectangle implementation"""
    
    def __init__(self, width: float, height: float):
        self.width = width
        self.height = height
    
    def area(self) -> float:
        return self.width * self.height
    
    def perimeter(self) -> float:
        return 2 * (self.width + self.height)

# Class with special methods
class Counter:
    """Counter class with magic methods"""
    
    def __init__(self, start: int = 0):
        self.value = start
    
    def __str__(self) -> str:
        return f"Counter({self.value})"
    
    def __repr__(self) -> str:
        return f"Counter(start={self.value})"
    
    def __add__(self, other):
        if isinstance(other, Counter):
            return Counter(self.value + other.value)
        return Counter(self.value + other)
    
    def __len__(self) -> int:
        return abs(self.value)
    
    def __getitem__(self, key):
        if key == 0:
            return self.value
        raise IndexError("Counter only has one item")

# Dataclass-like class
class Point:
    """Point class with coordinate operations"""
    
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
    
    def distance_from_origin(self) -> float:
        """Calculate distance from origin"""
        return (self.x ** 2 + self.y ** 2) ** 0.5
    
    def __eq__(self, other) -> bool:
        if isinstance(other, Point):
            return self.x == other.x and self.y == other.y
        return False

# Context manager
class FileManager:
    """Simple file manager context"""
    
    def __init__(self, filename: str, mode: str = 'r'):
        self.filename = filename
        self.mode = mode
        self.file = None
    
    def __enter__(self):
        print(f"Opening {self.filename}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        print(f"Closing {self.filename}")
        return False

# Usage examples

# Usage examples
if __name__ == "__main__":
    # Function examples
    print(greet("World"))
    person = create_person("Alice", 30, "New York")
    print(person)
    
    # Class examples
    dog = Dog("Buddy", "Golden Retriever")
    print(dog.make_sound())
    print(dog.fetch("ball"))
    
    bat = Bat("Batty")
    print(bat.make_sound())
    print(bat.fly())
    
    # Special methods
    c1 = Counter(5)
    c2 = Counter(3)
    c3 = c1 + c2
    print(f"{c1} + {c2} = {c3}")
    
    # Context manager
    with FileManager("test.txt") as fm:
        print("Working with file")
