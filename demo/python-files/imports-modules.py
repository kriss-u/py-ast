# Import and Module Demo
# Tests various import styles and module structures

# Standard library imports
import os
import sys
import json
import datetime
from pathlib import Path

# Multiple imports from same module
from typing import List, Dict, Optional, Union, Tuple, Any
from collections import defaultdict, Counter, OrderedDict

# Aliased imports
import numpy as np
import pandas as pd
from datetime import datetime as dt

# Relative imports (would work in a package)
# from .submodule import function
# from ..parent import ParentClass
# from ...grandparent import util_function

# Import with star (generally discouraged but valid)
# from math import *

# Conditional imports
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Platform-specific imports
if sys.platform == "win32":
    import winsound
elif sys.platform.startswith("linux"):
    # Linux-specific imports would go here
    pass

# Version-specific imports
if sys.version_info >= (3, 8):
    from typing import TypedDict, Literal
else:
    try:
        from typing_extensions import TypedDict, Literal
    except ImportError:
        TypedDict = dict
        Literal = str

# Global variables and constants
VERSION = "1.0.0"
DEBUG = True
DEFAULT_CONFIG = {
    "timeout": 30,
    "retries": 3,
    "batch_size": 100
}

# Module-level constants
PI = 3.14159265359
E = 2.71828182846

# Type aliases
UserID = int
UserData = Dict[str, Any]
ConfigDict = Dict[str, Union[str, int, bool]]

# Module functions
def get_system_info() -> Dict[str, Any]:
    """Get system information using imported modules"""
    info = {
        "platform": sys.platform,
        "python_version": sys.version,
        "current_time": dt.now().isoformat(),
        "current_dir": str(Path.cwd()),
    }
    
    if HAS_PSUTIL:
        info["memory_usage"] = "psutil available"
    else:
        info["memory_usage"] = "psutil not available"
    
    return info

def process_json_data(json_string: str) -> Dict:
    """Process JSON data using imported json module"""
    try:
        data = json.loads(json_string)
        return {
            "status": "success",
            "data": data,
            "processed_at": datetime.datetime.now().isoformat()
        }
    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "error": str(e),
            "processed_at": datetime.datetime.now().isoformat()
        }

def use_collections_modules():
    """Demonstrate various collections module features"""
    
    # defaultdict
    word_count = defaultdict(int)
    text = "hello world hello python world"
    for word in text.split():
        word_count[word] += 1
    
    # Counter
    letter_count = Counter("hello world")
    
    # OrderedDict
    ordered = OrderedDict([("first", 1), ("second", 2), ("third", 3)])
    
    return dict(word_count), dict(letter_count), dict(ordered)

def path_operations():
    """Demonstrate pathlib operations"""
    
    current_path = Path.cwd()
    parent_path = current_path.parent
    
    # Path manipulation
    config_file = current_path / "config.json"
    backup_dir = current_path / "backups" / "2023"
    
    operations = {
        "current": str(current_path),
        "parent": str(parent_path),
        "config_exists": config_file.exists(),
        "backup_dir": str(backup_dir),
        "is_absolute": current_path.is_absolute()
    }
    
    return operations

# Class using imported types
class DataProcessor:
    """Data processor using various imported modules and types"""
    
    def __init__(self, config: Optional[ConfigDict] = None):
        self.config = config or DEFAULT_CONFIG.copy()
        self.created_at = dt.now()
        self.processed_count = 0
    
    def process_batch(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process a batch of data"""
        results = []
        
        for item in data:
            try:
                processed_item = self._process_item(item)
                results.append({
                    "status": "success",
                    "data": processed_item,
                    "timestamp": dt.now().isoformat()
                })
                self.processed_count += 1
            except Exception as e:
                results.append({
                    "status": "error",
                    "error": str(e),
                    "timestamp": dt.now().isoformat()
                })
        
        return results
    
    def _process_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single item"""
        # Simulate processing
        processed = item.copy()
        processed["processed"] = True
        processed["processed_at"] = self.created_at.isoformat()
        return processed
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            "processed_count": self.processed_count,
            "created_at": self.created_at.isoformat(),
            "uptime_seconds": (dt.now() - self.created_at).total_seconds(),
            "config": self.config
        }

# Module with nested imports and complex logic
class ConfigManager:
    """Configuration manager demonstrating module usage"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = Path(config_path) if config_path else Path("config.json")
        self.config = {}
        self.load_config()
    
    def load_config(self):
        """Load configuration from file"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    self.config = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Error loading config: {e}")
                self.config = DEFAULT_CONFIG.copy()
        else:
            self.config = DEFAULT_CONFIG.copy()
    
    def save_config(self):
        """Save configuration to file"""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
        except IOError as e:
            print(f"Error saving config: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any):
        """Set configuration value"""
        self.config[key] = value
    
    def update(self, new_config: Dict[str, Any]):
        """Update configuration with new values"""
        self.config.update(new_config)

# Function using multiple imported modules
def generate_report() -> Dict[str, Any]:
    """Generate a comprehensive system report"""
    
    # Get system info
    system_info = get_system_info()
    
    # Process some data
    processor = DataProcessor()
    sample_data = [
        {"id": 1, "name": "Alice", "value": 100},
        {"id": 2, "name": "Bob", "value": 200},
        {"id": 3, "name": "Charlie", "value": 300}
    ]
    
    processed_results = processor.process_batch(sample_data)
    
    # Use collections
    word_count, letter_count, ordered = use_collections_modules()
    
    # Path operations
    path_info = path_operations()
    
    # Generate report
    report = {
        "report_generated_at": dt.now().isoformat(),
        "system_info": system_info,
        "processing_stats": processor.get_stats(),
        "processed_results": processed_results,
        "collections_demo": {
            "word_count": word_count,
            "letter_count": letter_count,
            "ordered_dict": ordered
        },
        "path_info": path_info,
        "module_info": {
            "version": VERSION,
            "debug": DEBUG,
            "has_psutil": HAS_PSUTIL,
            "python_version": sys.version_info[:3]
        }
    }
    
    return report

# Conditional execution and __name__ check
def main():
    """Main function for module execution"""
    print(f"Running {__name__} module")
    print(f"Version: {VERSION}")
    
    # Generate and display report
    report = generate_report()
    
    # Pretty print with json
    print("\n" + "="*50)
    print("SYSTEM REPORT")
    print("="*50)
    print(json.dumps(report, indent=2))
    
    # Demonstrate config manager
    config_mgr = ConfigManager()
    print(f"\nDefault timeout: {config_mgr.get('timeout')}")
    
    config_mgr.set('new_setting', 'test_value')
    print(f"New setting: {config_mgr.get('new_setting')}")

# Module-level execution
if __name__ == "__main__":
    main()
else:
    print(f"Module {__name__} imported")

# Module docstring at the end (unusual but valid)
"""
This module demonstrates various import patterns and module usage in Python.
It includes:
- Standard library imports
- Third-party imports (with error handling)
- Aliased imports
- Conditional imports
- Module-level variables and functions
- Classes using imported modules
- Complex data processing examples
"""
