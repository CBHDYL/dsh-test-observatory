# 设计：Test Observatory 真人模拟（Persona Simulation）

日期：2026-09-10　状态：设计完成，待实现
前置调研：`docs/RESEARCH-persona-simulation.md`

## 1. 目标与非目标

### 目标
让六个角色产生**真实的行为差异**，而不是六份手写脚本共用一套执行器。差异必须来自引擎的策略层，可复现、可测试、可解释。

### 非目标（明确不做）
- **不假装能替代真实用户研究**（见 §2）。
- **不默认引入 LLM 决策循环**；默认路径必须确定性、无 API key 可运行。
- 不追求角色拟人化表演，只做可观测行为差异。

## 2. 研究约束（决定设计边界）

### 2.1 合成用户不能替代真人（强约束）
- *What Would GPT Click*（arXiv 2605.18302）：基于 12 个真实 UX 研究、3,431 名被试，让 AI 预测首次点击位置与原因。AI 点击与真人分布显著不同，回答要么重复措辞、要么**编造页面上不存在的内容**；调整推理强度、temperature、persona 配置后改善也很小。
- *Illusion of Intervention*（arXiv 2605.20767）：LLM 模拟实验本质是观察性研究，不是干预实验。
- *Whose Personae?*（arXiv 2512.00461，review 63 篇 2023-2025 论文）：仅 35% 的研究讨论了 persona 代表性。

**设计后果**：报告必须标注模拟局限；LLM 生成的 persona 输出必须结构化校验且不得进入评分；必须用**已知植入缺陷的夹具应用**验证每个 persona 真能发现它该发现的缺陷类别。

### 2.2 自动化无障碍有覆盖上限
axe-core 官方仓库 issue #4415：axe-core 文档称平均自动发现 **57%** 的 WCAG 问题，Deque DevTools 市场页称 80%，两者并存且未统一说明。
**设计后果**：报告不得声称无障碍已通过；axe 结果必须与键盘遍历结果并列。

### 2.3 可用参考实现
- **TakoQA**：Observe→Decide→Act→Check 四拍循环；元素 ref 寻址；known/new/muted baseline；learned store（≥2 次观察计入、会衰减）。
- **ux-swarm**：persona 加权、完成率输出、内置 screen reader persona。
- **impeccable personas**：5 个 archetype，各带 Behaviors / Test Questions / Red Flags。
- **race-condition-finder**：网络延迟是放大器而非成因；并发 bug 藏在成功背后。

## 3. 架构总览
在当前 runJourney 之上插入 **Persona Policy 层**，动作执行器扩展为**能力感知**：

```
JourneySpec（声明任务意图）
   +-- PersonaBehavior（新增策略）
   |      +-- InputPolicy        输入生成与克制
   |      +-- TimingPolicy       等待、节流、节拍
   |      +-- ModalityPolicy     鼠标 / 键盘
   |      +-- EnvironmentPolicy  网络与 CPU 条件
   |      +-- RecoveryPolicy     失败后的重试与替代路径
   v
ActionEngine（能力感知执行器）
   |  +-- pointer  : click / fill
   |  +-- keyboard : tab / shiftTab / press / type
   |  +-- lifecycle: reload / goBack / newTab
   |  +-- observe  : screenshot / wait / expect*
   v
Checks：visual（既有） + axe（既有） + keyboard（新增）
   v
Scoring（规则化扩展） → Report（局限声明、键盘检查、角色元信息）
```

**关键决定：行为差异来自策略对象，不来自 LLM。** 默认路径零成本、完全可复现、可单元测试。

## 4. Persona 行为模型

### 4.1 从标签升级为策略
当前 `JourneySpec.persona` 是 `string`（仅显示名），保留不变；新增可选 `behavior` 引用具名策略。未声明时使用 `neutral`，保证现有配置继续工作。

| 策略 id | 对应 archetype | 核心行为差异 |
|---|---|---|
| `first-time` | Confused First-Timer | 等满整个 settle；点击前检查是否有可见标签/帮助；无文本图标记 finding |
| `expert` | Impatient Power User | 跳过引导步骤；优先 Esc 关弹窗；允许直接 URL 跳转；等待预算最短 |
| `error-prone` | Deliberate Stress Tester | 对每个 fill 追加边界输入变体；中途 reload；后退再前进 |
| `mobile` | Distracted Mobile User | 移动视口；检查触控目标尺寸；中途切走再返回 |
| `keyboard` | Accessibility-Dependent User | **禁用指针动作**，全部改为 Tab/Shift+Tab/Enter/Esc/Space |
| `impatient` | 跨 archetype | 极短等待预算；提交类动作**连续触发两次**；不等 spinner |
| `neutral` | 无 | 当前行为，向后兼容 |

### 4.2 InputPolicy
```ts
export interface InputPolicy {
  readonly boundaryInputs?: readonly BoundaryInput[]
  readonly doubleSubmit?: boolean
  readonly typeDelayMs?: number
}
export interface BoundaryInput {
  readonly kind: 'empty' | 'whitespace' | 'veryLong' | 'emoji' | 'rtl' | 'html' | 'sqlLike' | 'custom'
  readonly value?: string
}
```
内置值：veryLong = 4096 字符，emoji = 多码点序列，rtl = 阿拉伯文，html/sqlLike 为安全探测串。

**安全边界**：html/sqlLike 只用于验证应用是否正确转义/拒绝；引擎只做输入与观察，绝不断言注入成功。finding 措辞限定为未对特殊字符做可见处理或未报错，不声称存在漏洞。

### 4.3 TimingPolicy
```ts
export interface TimingPolicy {
  readonly settleBudgetMs: number
  readonly waitForIdle: boolean
  readonly hesitateMs?: number
  readonly paceMs?: number
}
```

### 4.4 ModalityPolicy
```ts
export interface ModalityPolicy {
  readonly pointer: boolean
  readonly tabBudget: number
}
```
键盘解析规则：给定 CSS 选择器，引擎从当前焦点按 Tab 前进，直到 `document.activeElement` 匹配该选择器；超过 `tabBudget` 则步骤失败并记录「键盘无法到达」。这直接覆盖 axe 检测不到的问题。

### 4.5 EnvironmentPolicy
```ts
export interface EnvironmentPolicy {
  readonly network?: 'offline' | 'slow3g' | 'fast3g' | 'slow4g' | 'custom'
  readonly custom?: { downloadKbps: number; uploadKbps: number; latencyMs: number }
  readonly cpuThrottle?: number
}
```
实现：`page.context().newCDPSession(page)` + `Network.emulateNetworkConditions`，CPU 走 `Emulation.setCPUThrottlingRate`。

### 4.6 RecoveryPolicy
```ts
export interface RecoveryPolicy {
  readonly retries: number
  readonly alternativePaths?: readonly RecoveryPath[]
}
```
`RecoveryPath` 是有限枚举（`pressEscape` / `reload` / `goBack` / `dismissVisibleDialog`），不是自由探索。

## 5. 新增动作原语
在 `JourneyAction` 联合类型上新增（全部可选，不破坏现有配置）：
```ts
| { readonly kind: 'press'; readonly key: string }
| { readonly kind: 'tab'; readonly count?: number; readonly shift?: boolean }
| { readonly kind: 'reload' }
| { readonly kind: 'goBack' }
| { readonly kind: 'newTab'; readonly url?: string }
| { readonly kind: 'closeTab' }
| { readonly kind: 'throttle'; readonly profile: EnvironmentPolicy['network'] }
| { readonly kind: 'typeUnicode'; readonly selector: string; readonly value: string }
```

## 6. 键盘检查（新增检查族）
在 checks 中新增第三族 `keyboard`，与 visual / axe 并列：

| 规则 id | 检测 |
|---|---|
| `keyboard-focus-not-visible` | 元素获得焦点但计算样式无可见焦点指示 |
| `keyboard-focus-order-suspect` | Tab 顺序与 DOM 顺序显著不符 |
| `keyboard-focus-trap-missing` | 打开 dialog 后 Tab 逃出 dialog |
| `keyboard-unreachable` | 声明的交互目标在 tabBudget 内不可达 |
| `keyboard-escape-ignored` | dialog 打开时按 Esc 无效果 |

## 7. 评分调整
保持「规则化、可复现、AI 不动数字」原则。新增：
- Accessibility（10 分）由 visual 与 keyboard 两族共同扣分；
- 新增**完成率**作为独立展示指标（按角色：完成任务角色数 / 总角色数）；
- 每个 finding 增加 `detectedBy: 'rule' | 'policy'` 与 `persona`，让读者知道是谁发现的；
- **不引入任何 LLM 加权分数**。

## 8. 报告调整
### 8.1 必须新增的诚实声明
报告新增「模拟边界」区块，文案固定、不接受配置覆盖：
- 本报告的旅程由规则化策略驱动，不是真实用户行为测量；
- 合成参与者与真人在决策分布上存在已记录的差异；
- axe-core 平均只能自动发现部分 WCAG 问题，键盘检查互补但同样不等于完整无障碍审计；
- 角色差异来自策略配置，代表**缺陷类别覆盖**，不代表真实人群比例。

### 8.2 角色卡增强
展示策略 id、启用的策略维度（如 keyboard-only、slow3g）、该角色发现的问题数。

### 8.3 完成率视图
按角色的完成率条形视图 + 总计，替代仅有的 PASS/FAIL 汇总。

## 9. 配置 schema（向后兼容）
```yaml
journeys:
  - persona: 急躁用户
    behavior: impatient          # 新增，可选；缺省 neutral
    device: Desktop · Chrome
    name: 快速提交订单
    viewport: { width: 1440, height: 900 }
    steps:
      - label: 快速填写并提交
        actions:
          - kind: goto
            url: http://127.0.0.1:8000/
          - kind: press
            key: Escape
          - kind: screenshot
            caption: 提交后状态
            category: final
```
也支持内联微调：
```yaml
    behavior:
      preset: mobile
      environment:
        network: slow3g
```

## 10. 文件布局
```
src/experience/
  behavior/
    types.ts          策略类型
    presets.ts        七个内置策略
    input.ts          边界输入生成
    keyboard.ts       键盘解析（选择器 → Tab 序列）
    environment.ts    CDP 节流
    index.ts
  runner.ts           扩展：接入策略与能力感知执行器
  keyboard-checks.ts  新检查族
  scoring.ts          扩展：keyboard 扣分 + 完成率
  visual.ts / a11y.ts 不变
```

## 11. 验收门（核心）

### 11.1 单元级
每个策略函数独立测试：输入生成、Tab 解析、等待预算、CDP 参数构造、恢复路径选择。

### 11.2 落地校验（最重要）
参考 TakoQA 的 selfeval 思路，新增 **persona 夹具应用**：本地 HTTP 服务，刻意植入每类缺陷。

| 植入缺陷 | 必须由哪个策略发现 |
|---|---|
| 无标签的图标按钮 | `first-time` |
| 焦点不可见（outline: none） | `keyboard` |
| 触控目标 20×20px | `mobile` |
| 双击提交产生重复订单 | `impatient` |
| 超长输入导致 500 | `error-prone` |
| 引导页无法跳过 | `expert` |
| 3G 下无 loading 反馈 | `impatient`（配 slow3g） |

验收标准：每个策略**必须**发现它对应的植入缺陷，且**不得**发现不存在的缺陷（假阳性同样失败）。夹具应用与夹具测试一并提交，无需外部应用或 API key。

### 11.3 真实应用回归
在 ai-engineer-learning 上重跑，确认六个角色产生**可区分的**结果（发现集不应完全相同），且报告含「模拟边界」声明。

### 11.4 不回归
现有 106 项测试全绿；typecheck 干净；现有 `test-observatory.yml` 不加修改仍能运行。

## 12. 分阶段实施

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P1 | 策略类型 + 7 个 preset + neutral 兼容 | 无 |
| P2 | 能力感知执行器：键盘解析 + 新动作原语 | P1 |
| P3 | 键盘检查族 | P2 |
| P4 | 环境策略（CDP 节流） | P1 |
| P5 | 边界输入生成 + 双重提交 | P1 |
| P6 | persona 夹具应用 + selfeval 测试 | P1-P5 |
| P7 | 评分与报告（完成率、模拟边界声明、角色卡增强） | P1-P6 |
| P8 | 真实应用回归验证 | P7 |
| P9（独立） | 可选 LLM 探索模式（见 §13） | 全部 |

每阶段独立可测、可交付，不要求一次做完。

## 13. 可选 LLM 探索模式（独立决定，默认关闭）
若将来要发现脚本作者没想到的路径：
- 必须走 TakoQA 式 Observe→Decide→Act→Check；
- 元素用 ref 寻址，不用选择器；
- LLM 只能输出受 schema 约束的**单个动作**，解析失败即中止该步而不是猜测；
- **LLM 输出永不进入评分**，只作为探索线索；
- 必须显式开启，默认路径保持零成本、确定性；
- 报告必须标注哪些发现来自 LLM 探索。

**当前决定：暂不实现。** 理由：§2.1 的研究表明其行为与真人分布存在已记录偏差且会编造内容；在确定性策略层尚未完成并验证前引入，只会掩盖策略层的问题。

## 14. 风险

| 风险 | 应对 |
|---|---|
| 策略化后角色仍无实质差异 | §11.2 的植入缺陷夹具是硬门，不通过不算完成 |
| 键盘解析不稳定（动态页面焦点漂移） | tabBudget 上限 + 每步焦点快照 + 失败时记录实际焦点 |
| 边界输入被误读为已证明存在漏洞 | 措辞限定为未做可见处理；报告声明只做输入与观察 |
| 节流导致既有测试变慢/超时 | 节流仅在该策略启用时生效；超时按策略等待预算计算 |
| 报告读者仍误读为真实用户研究 | §8.1 固定声明不可被配置覆盖 |
| 夹具应用自身有缺陷导致假绿 | 夹具应用需自测（植入缺陷的检测本身要有断言） |

## 15. 不做什么
- 不声称合成角色代表真实人群比例；
- 不用 LLM 生成用户体验叙事并当作事实；
- 不用「AI 觉得体验好」驱动任何分数；
- 不在没有落地校验的情况下宣称角色模拟已完成。
