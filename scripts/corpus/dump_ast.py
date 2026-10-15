#!/usr/bin/env python3
"""Batch CPython AST dumper for differential testing against py-ast.

Reads absolute file paths, one per line, from stdin. For each path, parses
the file with the stdlib `ast` module and writes one JSON object per line to
stdout, in the same order the paths were received:

    {"file": "<path>", "ok": true, "ast": {...}}
    {"file": "<path>", "ok": false, "error": "<message>"}

The `ast` field mirrors py-ast's node shape (`nodeType` plus each of the
node's CPython `_fields`, plus location attributes) so it can be diffed
directly against py-ast's parser output. Constant values are encoded as
`{"$type": ..., "$value": ...}` since their Python runtime types (bytes,
complex, tuple, frozenset, big int) don't map onto JSON directly.

Run as a single long-lived process (not spawned per file) so a large corpus
(the CPython stdlib plus assorted third-party packages) can be dumped
without per-file interpreter startup cost.
"""

import ast
import io
import json
import sys
import tokenize


def encode_float(value):
    """Encode a float as JSON, spelling non-finite values as "nan"/"inf"/"-inf" (JSON has no literal for them)."""
    if value != value:  # NaN
        return "nan"
    if value == float("inf"):
        return "inf"
    if value == float("-inf"):
        return "-inf"
    return value


def encode_constant(value):
    """Encode a `Constant.value` (any type `ast` allows there) as JSON."""
    if value is None:
        return {"$type": "NoneType", "$value": None}
    if value is Ellipsis:
        return {"$type": "ellipsis", "$value": None}
    if isinstance(value, bool):
        return {"$type": "bool", "$value": value}
    if isinstance(value, int):
        # Stringified: JS numbers lose precision beyond 2**53.
        return {"$type": "int", "$value": str(value)}
    if isinstance(value, float):
        return {"$type": "float", "$value": encode_float(value)}
    if isinstance(value, complex):
        return {"$type": "complex", "$value": {"real": encode_float(value.real), "imag": encode_float(value.imag)}}
    if isinstance(value, str):
        return {"$type": "str", "$value": value}
    if isinstance(value, bytes):
        return {"$type": "bytes", "$value": list(value)}
    if isinstance(value, tuple):
        return {"$type": "tuple", "$value": [encode_constant(v) for v in value]}
    if isinstance(value, frozenset):
        return {"$type": "frozenset", "$value": [encode_constant(v) for v in sorted(value, key=repr)]}
    raise TypeError(f"unhandled Constant value type: {type(value)!r}")


LOCATION_ATTRS = ("lineno", "col_offset", "end_lineno", "end_col_offset")

# py-ast PascalCases every node type for API consistency, whereas CPython's
# `ast` module uses lowercase class names for a handful of "product" (as
# opposed to "sum") ASDL types. Not a bug, so normalize the name here rather
# than reporting a nodeType mismatch for every alias/arg/keyword/etc. node.
NODE_TYPE_RENAMES = {
    "alias": "Alias",
    "arg": "Arg",
    "arguments": "Arguments",
    "comprehension": "Comprehension",
    "keyword": "Keyword",
    "match_case": "MatchCase",
    "withitem": "WithItem",
}


def node_to_dict(node):
    """Recursively convert an `ast` node/list/leaf into a JSON-able tree."""
    if isinstance(node, ast.AST):
        type_name = type(node).__name__
        result = {"nodeType": NODE_TYPE_RENAMES.get(type_name, type_name)}
        fields = node._fields
        if type(node).__name__ == "Constant":
            result["value"] = encode_constant(node.value)
            kind = getattr(node, "kind", None)
            if kind is not None:
                result["kind"] = kind
            fields = tuple(f for f in fields if f not in ("value", "kind"))
        for field in fields:
            if not hasattr(node, field):
                continue
            result[field] = node_to_dict(getattr(node, field))
        for attr in LOCATION_ATTRS:
            if hasattr(node, attr):
                result[attr] = getattr(node, attr)
        return result
    if isinstance(node, list):
        return [node_to_dict(item) for item in node]
    return node


def dump_file(path):
    """Parse `path`, returning `(ast_dict, decoded_source_or_None)`.

    py-ast only accepts already-decoded text, so for a file that isn't plain
    UTF-8 (a BOM, or a PEP 263 coding declaration like latin-1) the text
    CPython decoded is returned too, letting the runner hand py-ast exactly
    what CPython parsed rather than a lossy UTF-8 read of the same bytes.
    Raises SyntaxError/UnicodeDecodeError/OSError on failure.
    """
    with open(path, "rb") as f:
        source = f.read()
    tree = ast.parse(source, filename=path)
    encoding, _ = tokenize.detect_encoding(io.BytesIO(source).readline)
    decoded = None if encoding == "utf-8" else source.decode(encoding)
    return node_to_dict(tree), decoded


def main():
    for line in sys.stdin:
        path = line.rstrip("\n")
        if not path:
            continue
        try:
            ast_dict, decoded = dump_file(path)
            record = {"file": path, "ok": True, "ast": ast_dict}
            if decoded is not None:
                record["source"] = decoded
        except Exception as exc:  # noqa: BLE001 - report any failure, keep the batch alive
            record = {"file": path, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
        sys.stdout.write(json.dumps(record, allow_nan=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
