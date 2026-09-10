# 设计：截图正确性、证据标注与报告分页

日期：2026-09-10　状态：设计完成，待实现
关联：`docs/DESIGN-persona-simulation.md`（本设计是其 §6 报告层的细化）

## 1. 问题陈述

用户提出三个问题：
1. 截图的正确性怎么保证？
2. 怎么在截图中画出重要的部分？
3. 真人模拟内容很多，能不能分页做得更好看？

## 2. 审计发现的根因（已核实源码）

### 2.1 标注做不到的根因：finding 没有几何信息

`src/experience/visual.ts` 的 `collectViolations` 只产出文字：
```ts
export interface VisualViolation {
  readonly rule: string
  readonly detail: string
  readonly severity: 'high' | 'medium'
}
```
`image-broken` 这类规则在检测时明明拿到了 `broken[0]` 元素，却只把 `src` 写进 detail 字符串，元素本身被丢弃。

`src/experience/a11y.ts` 同样：axe 每个 violation 自带 `nodes`（含 target 选择器），但代码只取了 `violation.nodes.length` 这个**数字**，节点信息全部丢弃。

`CapturedShot`（`src/experience/types.ts`）只有 `dataUri` 与文案，没有任何坐标字段。

**结论：当前架构里没有任何一处记录「问题在画面的哪个位置」，所以画框在数据上不可能实现。** 这不是渲染问题，是数据模型缺失。

### 2.2 截图正确性没有任何校验

`captureBounded`（`runner.ts`）只做一件事：拍图，超 400KB 就降级 JPEG 质量。
没有：与基线比对、坐标一致性校验、动态区域屏蔽、平台差异处理。

## 3. 调研结论

### 3.1 截图正确性分为两个独立问题，不能混为一谈

| 问题 | 能否自动判定 | 结论 |
|---|---|---|
| 截图是否**忠实反映**浏览器当时渲染的内容 | 可以 | 这是我们该负责的 |
| 界面**本身是否正确** | 不能 | 这是视觉回归基线的职责，且需要人审 |

我们只能承诺第一项，并且必须在措辞上区分。

### 3.2 像素级基线比对不可靠（已核实）

Playwright 视觉回归资料明确：**同一页面在 Linux / macOS / Windows 上渲染不同**（字体渲染、抗锯齿、次像素差异），因此基线必须按平台分文件（`homepage-chromium-linux.png` / `-darwin.png` / `-win32.png`）。

相关参数与经验值：
- `maxDiffPixels`：绝对像素差上限
- `maxDiffPixelRatio`：比例上限
- `threshold`：单像素颜色敏感度（0 精确，1 任意）
- 调参经验：先用严格值跑 10 次，取观测最大差异的 2 倍；`maxDiffPixels > 500` 或 `maxDiffPixelRatio > 0.05` 或 `threshold > 0.3` 说明阈值已松到可能掩盖真实问题

**设计后果：我们不把像素基线比对作为默认能力。** 理由：它需要每个平台各自的基线、需要屏蔽动态内容、误报率高，且与「单文件 HTML 报告」的定位不匹配。默认只做「截图忠实性」校验；基线比对作为可选后续能力。

### 3.3 动态内容会污染截图（需要屏蔽）

必屏蔽：时间戳/时钟、用户头像、实时信息流、广告、随机内容、计数器、通知角标。
可选屏蔽：实时图表、地图、视频缩略图、相对时间。

### 3.4 axe 的覆盖缺口有实证

一篇 2026-07 的实证文章（jangwook.net）在结账页**刻意植入 8 个 WCAG 障碍**，用 axe-core 4.12.1 扫描：

**axe 抓到 4 个**（规则可判定）：无 alt 的图片、无 label 的输入框、空按钮、跳级标题；另抓到作者无意漏掉的 `html` 缺 `lang`。

**axe 完全没抓到 4 个**（需人类判断）：
| 植入的障碍 | 为什么 axe 抓不到 |
|---|---|
| `alt="image"`（有 alt 但无意义） | 规则只检查 alt **是否存在**，不判断内容是否有意义 |
| 「click here」链接 | 机器能看到链接有文字，不能判断文字**是否描述了目的** |
| 只用颜色表达必填（红色文字） | 语义由颜色承载，无语义标记 |
| `label for="zip"` 但写的是 Card number | 标签关联正确，**内容与字段不符** |

**设计后果（重要）**：这 4 项恰好是 persona 策略层要覆盖的：
| axe 抓不到的障碍 | 应由哪个策略发现 |
|---|---|
| 无意义的 alt | `first-time`（检查图标/图片是否有有意义的可见文本说明） |
| 「click here」式链接 | `first-time` |
| 仅用颜色表达含义 | `first-time` + 键盘策略（肉眼不可见时失去信息） |
| 标签与字段不符 | `error-prone`（按标签填值后检查行为） |

这给了「persona 策略层」一个**可引用的实证依据**：它补的是 axe 结构上够不到的那一层，而不是重复 axe 的工作。

### 3.5 标注的可行技术路径

坐标计算：页面内 `element.getBoundingClientRect()` 得到视口相对坐标；**视口截图**下可直接使用；`fullPage` 截图下需加上 `window.scrollY`。

叠加方式有两条路径：
| 路径 | 做法 | 取舍 |
|---|---|---|
| A. 页面内注入 overlay | 截图前在页面注入绝对定位的 SVG/div 框 + 标签，截图后移除 | 无新依赖；字体清晰；框随页面渲染 |
| B. 截图后位图绘制 | 拿到 PNG buffer 后用图像库画框 | 需引入图像依赖（如 sharp/canvas），增加体积 |

**选择路径 A**，理由：项目已有「截图以 data URI 内嵌、单文件报告」的定位，引入位图库会显著增加依赖与体积；路径 A 复用浏览器自身的渲染能力。

安全边界：overlay 必须在**所有页面检查（视觉/axe/键盘）之后**注入，且注入后立即截图、立即移除；否则会污染检查结果或影响后续步骤。

## 4. 设计

### 4.1 数据模型扩展（根因修复）

`VisualViolation` 增加可选几何字段：
```ts
export interface ElementRef {
  readonly tag: string
  readonly selector: string        // 稳定 CSS 路径，用于报告内跳转
  readonly text?: string           // 可见文本，截断到 80 字符
}
export interface ElementBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly space: 'viewport' | 'fullPage'
}
export interface VisualViolation {
  readonly rule: string
  readonly detail: string
  readonly severity: 'high' | 'medium'
  readonly elements?: readonly ElementRef[]   // 新增
  readonly boxes?: readonly ElementBox[]      // 新增，与 elements 同序
}
```
`collectViolations` 改为在检测时保留元素与 `getBoundingClientRect()`；`checkAccessibility` 保留 axe 的 `nodes[].target` 与节点坐标。

### 4.2 标注生成
新增 `src/experience/annotate.ts`：
- 输入：页面、要标注的 box 列表、配色（按 severity）
- 行为：注入 overlay → 返回一个 `remove()` 句柄
- overlay 规格：`position:absolute`、`pointer-events:none`、`z-index:2147483647`；框 2px 描边；标签为框上方的小胶囊，写规则 id + 序号

`captureBounded` 扩展为可选接收标注列表，产出两张图：
1. `clean`：无标注（作为「忠实性」校验与读者对照的基准）
2. `annotated`：带标注（用于展示）

### 4.3 截图忠实性校验（回答「正确性」）

每次捕获后执行下列断言，任一失败即记录一条 finding，且该截图标记为不可信（报告显示警告而不是静默展示）：

| 校验 | 方法 |
|---|---|
| 非空图 | 解码后字节数 > 阈值；尺寸与 viewport 一致 |
| 坐标一致 | 若做了标注，overlay 的 `getBoundingClientRect()` 与目标元素 `rect` 在 1px 内一致 |
| 标注确实入图 | `clean` 与 `annotated` 的字节不同；且在同一坐标采样 overlay 描边色 |
| 未被污染 | `clean` 图在 overlay 位置**不含**标注色 |
| 页面未变 | 捕获前后 `document.readyState` 与主文档 URL 未变 |

这是本设计里「截图正确」的可执行定义：**不是判断界面好看，而是证明这张图确实是那一刻的画面、标注确实落在它声称的位置。**

### 4.4 动态内容屏蔽（可选，按选择器声明）
配置层新增 `mask` 选择器列表；标注与捕获前对这些元素加 `visibility:hidden`，捕获后恢复。默认空。

### 4.5 报告分页

**关键决定：仍然是一个 HTML 文件。** 理由：当前定位是「自包含单文件报告」，截图以 data URI 内嵌；拆成多个物理文件会让体积翻倍且破坏可分享性。

改为**客户端路由的单文件多页**（`#/summary`、`#/tests`、`#/experience`、`#/evidence`、`#/limits`）：
- 导航为顶部 tab + 左侧目录；
- 各页独立滚动；
- 深链接可分享（`report.html#/experience`）；
- 打印时仍然整体导出（`@media print` 下展开全部页）。

| 页 | 内容 |
|---|---|
| Summary | verdict、KPI、趋势、失败原因、最慢测试 |
| Tests | 测试明细表 + 筛选 + 详情抽屉 |
| Experience | 六个角色卡、旅程轨迹、完成率 |
| Evidence | 带标注的截图库 + 筛选 + 证据弹窗 |
| Checks | 视觉/axe/键盘三族检查明细 |
| Limits | **模拟边界声明**（固定文案） |

分页的直接收益：解决当前「空区块占版面」与「长页面难定位」两个问题，并给 Limits 页一个固定位置而不是塞在页脚。

## 5. 验收门

### 5.1 标注正确性（硬门）
用一个 fixture 页面声明已知位置的元素，然后断言：
- overlay 的 rect 与目标元素 rect 在 1px 内一致（标注画在正确位置）；
- 标注图中该坐标的像素是标注色；
- 未标注图中该坐标**不是**标注色（证明标注确实是我们加的，不是页面原色）；
- overlay 移除后 `document.querySelectorAll('[data-observatory-overlay]').length === 0`（无残留）。

### 5.2 截图忠实性
- 人为制造场景（页面在捕获前立即改变内容）必须被检出并标记不可信——**这条用来证明校验不是摆设**；
- 正常情况下校验全过。

### 5.3 分页
- 每个页签可深链接直达；
- 打印输出包含全部页内容；
- 无 JS 时至少能看到 Summary（渐进增强）。

### 5.4 不回归
- 现有 108 项测试全绿；
- 报告体积不因分页显著增长（分页不复制内嵌图片）。

## 6. 风险

| 风险 | 应对 |
|---|---|
| overlay 污染 axe/视觉检查 | 强制在全部检查之后注入，注入即截即删；§5.1 断言无残留 |
| 坐标随滚动漂移 | box 记录 `space` 字段；视口截图只用 viewport 坐标；fullPage 显式加 scrollY |
| 标注框遮挡真实内容 | 框只描边不填充；标签放在元素上方，越界时翻到下方 |
| 分页破坏单文件可分享性 | 仍是单文件；打印展开全部页 |
| 忠实性校验产生噪声 finding | 校验失败记为独立 family（`evidence-integrity`），不进入体验评分 |

## 7. 诚实声明

- 本设计**不承诺**判断界面是否正确，只承诺证明截图忠实、标注落在声称的位置；
- 像素级视觉基线比对已调研但**不纳入默认能力**，理由是平台渲染差异与误报成本；
- axe 抓不到的 4 类障碍已有实证来源，persona 策略层的价值定位据此确定；
- 分页是单文件内的客户端路由，不是多个物理文件。
