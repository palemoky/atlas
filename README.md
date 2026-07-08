# Atlas

用 [Kumu](https://kumu.io) 绘制对计算机与人类发展有巨大贡献的人物/作品关系图。影响力（`influence`，0–10）越大，头像越大。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `scientists.json` | 「Great Scientists」项目的 Kumu blueprint（元素、连接、地图、视图） |
| `cs.json` | 「Computer Scientist」项目的 Kumu blueprint |
| `blueprint_to_csv.py` | 把 blueprint JSON 转成可导入 Google Sheets 的 CSV |
| `sheets/` | 脚本输出目录（`*_elements.csv` / `*_connections.csv`） |

## 头像随影响力缩放

两个 blueprint 的所有 perspective 已内置：

```scss
element {
  size: scale("influence", 20, 100);  /* influence 最低 → 20px，最高 → 100px，线性插值 */
  min-size: 20;
}
```

导入 Kumu 后无需任何调整即可看到效果。想调整对比度，改 `scale()` 的第二、三个参数即可（等价写法：`@settings { element-size: scale("influence", 20, 100); }`）。

打分约定：`influence` 在图内使用 **4.0–9.9** 的大跨度（两个项目一致），`scale()` 按图内最小/最大值做线性映射，分数拉开差距头像大小才有区分度。新增条目时参照图内已有条目相对打分即可，不追求跨图可比。

## 数据同步方式调查结论（2026-07）

来源：[Kumu 官方文档](https://docs.kumu.io/guides/import.md)。

- **JSON blueprint 导入：单向**（JSON → Kumu）。每次数据变更需重新导入；按 `_id` 匹配，可原地更新。
- **Google Sheets 集成：同样单向**（Sheet → Kumu），且挂载后 Kumu 里的数据变为**只读**——官方原话："Data in Kumu is read-only. Any changes to underlying data must be made in the Google Sheet."。优点是改完 Sheet 刷新 Kumu 页面即生效，无需手动导入。
- **Kumu 没有任何写回数据源的机制**（双向同步不存在），只能手动导出 xlsx。
- blueprint JSON 比 Sheet 承载得多：attributes 定义、maps、perspectives（视图样式）只存在于 JSON/项目中；Sheet 只承载元素与连接数据。

### 推荐工作流

以 JSON 为唯一数据源（git 管理、好 diff），数据单向流动：

```
JSON (git) → blueprint_to_csv.py → Google Sheet (Elements/Connections 两个 tab) → Kumu
```

1. 首次用 JSON blueprint 导入 Kumu，建好项目、attributes 和 perspectives；
2. 日常数据更新改 JSON，跑脚本生成 CSV，更新 Google Sheet，刷新 Kumu 页面；
3. 不要在 Kumu 或 Sheet 里直接改数据，所有修改回到 JSON。

全自动方案：把 CSV push 到 GitHub 后，在 Sheet 里用
`=IMPORTDATA("https://raw.githubusercontent.com/<user>/<repo>/main/sheets/scientists_elements.csv")`
指向 raw 文件，push 即自动更新 Sheet，Kumu 刷新即同步。

## 脚本用法

```bash
# 转换默认的两个文件（scientists.json、cs.json）
python3 blueprint_to_csv.py

# 或指定文件
python3 blueprint_to_csv.py scientists.json
```

输出到 `sheets/<名称>_elements.csv` 与 `sheets/<名称>_connections.csv`。导入 Google Sheets 时分别放到名为 **Elements** 和 **Connections** 的两个 tab。

格式约定（Kumu 表格导入要求）：

- Elements 表必须有 `Label` 列；Connections 表必须有 `From` / `To` 列（用元素的 Label 引用，脚本已把内部 `elem-xxx` ID 映射回 Label）；
- 多值字段（如 Tags）用 `|` 分隔。
