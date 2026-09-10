# 调研：真实人类模拟（Persona Simulation）现状与差距

日期：2026-09-10
状态：调研记录，尚未实现

## 1. 背景

原始需求中的"浏览器模拟"部分要求：

- 真实 Chromium 旅程
- 六个角色：首次访问、熟练、易错、移动、键盘/无障碍、急躁
- 关键步骤、失败、最终状态截图
- 规则化评分；AI 只解释证据、不伪造
- 视觉规则、axe-core、截图压缩、失败步骤重试

## 2. 当前实现事实（读源码确认）

`src/experience/runner.ts`（313 行）、`types.ts`（118 行）、`scoring.ts`（170 行）、`visual.ts`（104 行）、`a11y.ts`（48 行）。

已实现：

- 真实 headless Chromium（`playwright-core`）
- 动作原语：`goto / click / fill / expectText / expectVisible / wait / screenshot`
- 每步失败重试（`retries`），失败自动截图并关联证据 id
- 截图超 400KB 自动降级 JPEG 质量
- 视觉检查 5 条规则、axe-core 扫描，检查失败被容纳为 finding 而不是让整轮崩溃
- 未到达应用页面（浏览器错误页）时跳过页面检查并如实记录

## 3. 核心结论：Persona 目前只是标签，不是行为模型

`JourneySpec` 中 `persona` 字段类型是 `string`（显示名），`device` 也只是描述字符串。`runner.ts` 对每个 journey 使用**同一套** `runJourney` / `runAction` 逻辑，没有分支。

因此六个 Persona 的差异**完全来自 YAML 里手写的 steps 和 viewport**，而不是引擎对不同用户类型的建模。具体缺失：

| Persona | 应有的行为 | 当前实际 |
|---|---|---|
| 首次访问用户 | 阅读引导、犹豫、寻找帮助、术语困惑 | 与其它角色同一套脚本回放 |
| 熟练用户 | 找快捷键、跳过引导、尝试批量操作 | 同上 |
| 易错用户 | 故意触发边界：空值、超长文本、emoji、RTL、刷新中断流程、后退、多标签 | 同上 |
| 移动用户 | 拇指区可达性、44×44 触控目标、中断后返回、慢网 | 只改了 viewport 宽高 |
| 键盘/无障碍用户 | 纯键盘 Tab/Enter/Esc 线性遍历、焦点可见性、焦点顺序 | 仍用 `page.click`（鼠标语义）；只跑了 axe |
| 急躁用户 | 元素出现前就点击、跳过等待、快速重复提交 | 仍用统一的 `settle()` |

## 4. 参考项目调研

### 4.1 ux-swarm（synthetic users swarm）

- 定位：把一群合成用户指向 URL 或截图，给出任务，得到完成率与痛点排行
- 模式：浏览器模式（真实 Playwright 逐步导航）+ 截图模式（LLM 视觉评估）
- 关键特性：可自定义 persona、可按真实用户分布加权、**内置 screen reader persona**
- 输出：完成率（completion rate）+ 反馈 + 排序后的痛点

### 4.2 TakoQA（browser agents swarm）

- 定位：真实 Chromium 中的浏览器 agent 群，用自然语言目标驱动
- 核心循环：**Observe → Decide → Act → Check**
  - Observe：给每个可见交互元素打 ref 编号 + 截图 + 页面文本
  - Decide：LLM 拿到元素列表和截图，**选择一个人类动作**，用 ref 寻址而非 CSS 选择器
  - Act：Playwright 执行，执行前高亮目标元素
  - Check：收集 console 错误、未捕获异常、HTTP 响应，命中 oracle 就报 finding
- 结束时有 LLM judge 判断"用户目标是否真的达成"，并标记 UX/质量问题
- 其他能力：known-bugs baseline（new/known/muted 分类）、learned store（跨运行积累应用事实，需 ≥2 次观察到才算数、会衰减）、`--mute` 抑制误报

### 4.3 impeccable 的 personas 参考（Persona-Based Design Testing）

这是最直接可用的行为规格参考，给出 5 个 archetype，每个都有 Profile / Behaviors / Test Questions / Red Flags：

- **Impatient Power User**：跳过引导、先找快捷键、尝试批量操作、被不必要步骤激怒、觉得慢就离开
- **Confused First-Timer**：仔细读说明、对不熟悉的东西犹豫、不断找帮助、误解术语、按字面理解标签
- **Accessibility-Dependent User**：线性 Tab 遍历、依赖 ARIA 与标题结构、看不到 hover 态、需要 4.5:1 对比度、可能 200% 缩放
- **Deliberate Stress Tester**：故意测边界（空状态、超长字符串、特殊字符）、提交异常数据（emoji/RTL/超长值）、后退/刷新/多标签打断流程、找 UI 承诺与实际行为的差异
- **Distracted Mobile User**：单手拇指操作、偏好屏幕底部动作、中途被打断后返回、注意力短、尽量少打字

### 4.4 自动化无障碍的覆盖上限

多份资料一致指出：自动化扫描器（含 axe-core）只能覆盖无障碍问题的一部分，无法替代真实屏幕阅读器与键盘遍历验证。这类"只测了一部分"的事实必须在报告中如实表达，不能让读者以为 axe 通过就等于无障碍通过。

## 5. 差距清单（按影响排序）

### P0：Persona 无行为模型
- 症状：六个角色跑同一套逻辑，差异只来自 YAML
- 影响：报告声称"6 个真实 Persona"，实际是"6 份手写脚本"，措辞与事实不符
- 需要：显式的 persona policy 层，驱动动作生成、等待策略、重试策略、输入生成

### P0：没有 LLM 在决策循环中
- 症状：纯声明式脚本回放，没有任何一步是"观察后决定"
- 影响：无法发现脚本作者没想到的路径，这与"探索性测试"的能力差距是本质性的
- 参考：TakoQA 的 Observe→Decide→Act→Check

### P1：键盘/无障碍用户不是真的键盘用户
- 症状：该 persona 仍用 `page.click`；只依赖 axe
- 需要：真的 Tab/Shift+Tab/Enter/Esc 驱动，检查焦点可见性、焦点顺序、焦点陷阱、键盘可达性

### P1：急躁/移动用户缺少环境模拟
- 症状：无网络限速、无 CPU 限速、无中断-返回、无慢网等待
- 需要：Playwright CDP 网络节流、离线切换、页面重载后状态保持检查

### P1：易错用户缺少边界输入
- 症状：没有任何异常输入生成
- 需要：空值、超长、emoji、RTL、特殊字符、双提交、刷新中断

### P2：没有中断与恢复验证
- 症状：不支持刷新页面、后退、多标签、离开再返回
- 需要：新增 `reload` / `goBack` / `newTab` 动作原语，并检查状态是否保持

### P2：完成率类统计缺失
- 症状：只有 PASS/FAIL，没有"多少比例的角色完成了任务"这类聚合
- 参考：ux-swarm 的 completion rate

### P2：跨运行的 finding 分类缺失
- 症状：每次运行都把同样的问题当新发现
- 参考：TakoQA 的 new/known/muted baseline

## 6. 建议的实现顺序

1. **Persona policy 层**（P0）：把 persona 从 string 升级为带行为的策略对象，驱动等待策略、动作生成、输入生成
2. **键盘驱动引擎**（P1）：为键盘 persona 实现真实的 Tab 遍历与焦点检查
3. **环境模拟**（P1）：CDP 网络/CPU 节流 + 中断恢复动作原语
4. **边界输入生成**（P1）：易错 persona 的异常输入数据集
5. **LLM 决策循环**（P0，但成本最高）：Observe→Decide→Act→Check，需先定义模型调用与成本边界
6. **完成率与 finding 基线**（P2）

## 7. 诚实声明

本调研确认：当前实现**不具备** persona 级行为建模、无 LLM 决策循环、无键盘真实驱动、无环境限速、无中断恢复、无边界输入生成。现有实现是"真实浏览器 + 固定脚本回放 + 真实检查工具"，这部分本身是可信且有价值的，但与"真实人类模拟"存在本质差距，不应以现有措辞对外表述。
