#!/usr/bin/env python3
"""给 blueprint JSON 里 position 为 null 的节点算一套力导向布局坐标并写回。

背景: Kumu 导入后如果节点 position 全是 null，会在画布上临时跑一次自动布局，
但这个布局不会写回底层数据，导致画布状态与已保存状态不一致，切换 view 时
一直提示"未保存的更改"。这里预先算好坐标写进 JSON，导入后坐标就是确定的。

用法: python3 assign_positions.py raw/scientists.json raw/computer_scientists.json
"""

import json
import math
import random
import sys
from pathlib import Path

WIDTH, HEIGHT = 1200, 1200
ITERATIONS = 300
SEED = 42


def layout(node_ids, edges):
    """Fruchterman-Reingold 力导向布局，返回 {node_id: (x, y)}。"""
    n = len(node_ids)
    if n == 0:
        return {}
    if n == 1:
        return {node_ids[0]: (0.0, 0.0)}

    rng = random.Random(SEED)
    pos = {nid: [rng.uniform(-WIDTH / 2, WIDTH / 2),
                 rng.uniform(-HEIGHT / 2, HEIGHT / 2)] for nid in node_ids}

    area = WIDTH * HEIGHT
    k = math.sqrt(area / n)
    t = WIDTH / 10  # 初始温度，随迭代衰减

    for i in range(ITERATIONS):
        disp = {nid: [0.0, 0.0] for nid in node_ids}

        # 排斥力：所有节点两两之间
        for a in range(n):
            for b in range(a + 1, n):
                na, nb = node_ids[a], node_ids[b]
                dx = pos[na][0] - pos[nb][0]
                dy = pos[na][1] - pos[nb][1]
                dist = math.hypot(dx, dy) or 0.01
                force = k * k / dist
                fx, fy = dx / dist * force, dy / dist * force
                disp[na][0] += fx
                disp[na][1] += fy
                disp[nb][0] -= fx
                disp[nb][1] -= fy

        # 吸引力：沿边
        for u, v in edges:
            if u not in pos or v not in pos:
                continue
            dx = pos[u][0] - pos[v][0]
            dy = pos[u][1] - pos[v][1]
            dist = math.hypot(dx, dy) or 0.01
            force = dist * dist / k
            fx, fy = dx / dist * force, dy / dist * force
            disp[u][0] -= fx
            disp[u][1] -= fy
            disp[v][0] += fx
            disp[v][1] += fy

        # 位移限幅 + 降温
        temp = t * (1 - i / ITERATIONS)
        for nid in node_ids:
            dx, dy = disp[nid]
            dist = math.hypot(dx, dy) or 0.01
            capped = min(dist, temp)
            pos[nid][0] += dx / dist * capped
            pos[nid][1] += dy / dist * capped

    # 归一化：不连通的子图只受排斥力，坐标会随迭代次数无界发散，
    # 这里把整体缩放到目标范围内，避免个别节点被甩到画布视野之外。
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    scale = WIDTH / span
    for nid in pos:
        pos[nid][0] *= scale
        pos[nid][1] *= scale

    return {nid: (round(x, 2), round(y, 2)) for nid, (x, y) in pos.items()}


def process(path: Path):
    data = json.loads(path.read_text())
    updated = 0

    for m in data.get("maps", []):
        node_ids = [n["element"] for n in m["elements"]]
        node_set = set(node_ids)
        edges = [(c["from"], c["to"]) for c in data.get("connections", [])
                  if c["from"] in node_set and c["to"] in node_set]

        coords = layout(node_ids, edges)
        for n in m["elements"]:
            if n["position"] is None and not n.get("pinned"):
                x, y = coords[n["element"]]
                n["position"] = {"x": x, "y": y}
                updated += 1

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return updated


def main():
    for arg in sys.argv[1:] or ["raw/scientists.json", "raw/computer_scientists.json"]:
        path = Path(arg)
        n = process(path)
        print(f"{path}: {n} 个节点写入坐标")


if __name__ == "__main__":
    main()
