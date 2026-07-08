#!/usr/bin/env python3
"""把 Kumu blueprint JSON 转成可导入 Google Sheets 的 Elements / Connections CSV。

用法: python3 blueprint_to_csv.py scientists.json computer_scientists.json
输出: sheets/<basename>_elements.csv, sheets/<basename>_connections.csv

Kumu 表格导入约定:
- Elements 表必须有 Label 列; Connections 表必须有 From / To 列(用 Label 引用)
- 多值字段(如 Tags)用 "|" 分隔
"""

import csv
import json
import sys
from pathlib import Path

# 常用列放前面，其余字段按字母序跟在后面
ELEMENT_PRIORITY = ["label", "element type", "description", "tags", "influence",
                    "image", "born", "died", "wikipedia", "website", "blog"]


def to_cell(value):
    if isinstance(value, list):
        return "|".join(str(v) for v in value)
    return "" if value is None else str(value)


def convert(path: Path, outdir: Path):
    data = json.loads(path.read_text())
    stem = path.stem

    elements = data.get("elements", [])
    keys = {k for e in elements for k in e.get("attributes", {})}
    columns = [k for k in ELEMENT_PRIORITY if k in keys]
    columns += sorted(keys - set(columns))

    with open(outdir / f"{stem}_elements.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([c.title() for c in columns])
        for e in elements:
            attrs = e.get("attributes", {})
            writer.writerow([to_cell(attrs.get(c)) for c in columns])

    label_by_id = {e["_id"]: e.get("attributes", {}).get("label", e["_id"])
                   for e in elements}
    connections = data.get("connections", [])
    conn_keys = sorted({k for c in connections for k in c.get("attributes", {})})

    with open(outdir / f"{stem}_connections.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["From", "To", "Direction"] + [k.title() for k in conn_keys])
        for c in connections:
            attrs = c.get("attributes", {})
            writer.writerow([
                label_by_id.get(c["from"], c["from"]),
                label_by_id.get(c["to"], c["to"]),
                c.get("direction", "directed"),
            ] + [to_cell(attrs.get(k)) for k in conn_keys])

    return len(elements), len(connections)


def main():
    outdir = Path("sheets")
    outdir.mkdir(exist_ok=True)
    for arg in sys.argv[1:] or ["scientists.json", "computer_scientists.json"]:
        path = Path(arg)
        n_elem, n_conn = convert(path, outdir)
        print(f"{path.name}: {n_elem} elements, {n_conn} connections -> "
              f"sheets/{path.stem}_elements.csv, sheets/{path.stem}_connections.csv")


if __name__ == "__main__":
    main()
