# 总计划：Test Observatory 剩余工作

日期：2026-09-10　状态：待执行
依据：`docs/AUDIT-2026-09-10.md`（审计）、`docs/DESIGN-persona-simulation.md`、`docs/DESIGN-screenshot-annotation-pagination.md`

## 0. 总工作量

```
工作流 A  工程风险修复（覆盖率与真实入口）      6 项
工作流 B  真人模拟实现（策略层）               17 项
工作流 C  截图正确性 + 标注 + 报告分页          9 项
工作流 D  发布收尾                              3 项（外部阻塞）
工作流 E  其他测试类别扩展                      5 项（Tier 1 调研结论）
工作流 F  诚实性修复（含 1 项严重缺陷）          2 项
──────────────────────────────────────────────
合计                                            42 项
```

## 1. 优先级原则

1. **工程风险优先**：两个真实入口零覆盖率是最大隐患，且它让后续所有工作都缺少安全网。
2. **先修数据模型，再做展示**：截图标注卡在数据模型，不先扩展 `VisualViolation` 就无法实现。
3. **每个工作流独立可交付**，不要求一次全做完。
4. **不做无验收门的工作**：每项都必须有可执行的通过/失败判据。

## 2. 工作流 A：工程风险修复（建议最先做）

| # | 任务 | 验收判据 |
|---|---|---|
| A1 | 为 `/test` 装配路径补测试 | `src/command/index.ts` 覆盖；断言命令注册、参数解析、成功/错误返回 |
| A2 | 为 `/test` 全流程补集成测试 | 用临时项目 + 真实命令跑一次，断言报告文件生成且模型正确 |
| A3 | 为 `run_tests` 装配路径补测试 | `src/tool/index.ts` 覆盖；断言工具注册、schema、取消语义 |
| A4 | 补齐 `a11y.ts` 未覆盖分支 | axe 注入失败、无 violations、blocking/非 blocking 映射 |
| A5 | 补齐 `structured.ts`/`experience.ts`/`render.ts` 未覆盖分支 | 达到每文件 100% |
| A6 | 把 `--coverage` 纳入本地验收命令 | 命令输出无 ERROR 行 |

**为什么最先做 A**：真人模拟与截图标注会大量改动 `runner.ts` 与 `index.ts`。没有这层安全网，后续每一步都无法确认没有破坏既有行为。

## 3. 工作流 B：真人模拟实现（主体工作）

详见 `docs/DESIGN-persona-simulation.md`。9 个阶段拆为 17 项：

| 阶段 | 任务数 | 内容 |
|---|---:|---|
| B1 | 3 | 策略类型定义、7 个内置 preset、neutral 向后兼容 |
| B2 | 3 | 键盘解析引擎、8 个新动作原语、能力感知执行器 |
| B3 | 1 | 5 条键盘检查规则 |
| B4 | 2 | CDP 网络节流、CPU 节流 |
| B5 | 2 | 边界输入生成、双重提交 |
| B6 | 2 | **植入缺陷夹具应用 + selfeval**（硬验收门） |
| B7 | 3 | 完成率视图、模拟边界声明、角色卡增强 |
| B8 | 1 | 真实应用回归验证 |

**B6 是整个工作流的关键**：没有夹具自证，「角色能发现缺陷」就只是一句声明。

## 4. 工作流 C：截图正确性 + 标注 + 分页

详见 `docs/DESIGN-screenshot-annotation-pagination.md`。

| # | 任务 | 依赖 | 验收判据 |
|---|---|---|---|
| C1 | 扩展 `VisualViolation` 与 axe 映射，保留元素与坐标 | 无 | 单测断言元素与 box 被保留 |
| C2 | 新增 `annotate.ts`：页面内 overlay 注入/移除 | C1 | 注入后存在、移除后无残留 |
| C3 | `captureBounded` 产出 clean + annotated 两张图 | C2 | 两图字节不同 |
| C4 | **截图忠实性校验**（非空/坐标一致/标注入图/未污染） | C3 | 人为制造场景必须被检出 |
| C5 | 动态内容屏蔽（按选择器） | C3 | 屏蔽元素在捕获时不可见 |
| C6 | 报告数据模型增加标注与校验结果字段 | C3, C4 | 类型 + 测试 |
| C7 | 证据弹窗展示标注图并可切换 clean 图 | C6 | jsdom 测试 + 浏览器验收 |
| C8 | 客户端路由分页（6 页 + 深链接 + 打印展开） | C6 | 深链接直达；`@media print` 含全部页 |
| C9 | 分页后回归（体积、既有交互） | C8 | 108 项测试全绿；体积增幅可解释 |

## 5. 工作流 D：发布收尾（外部阻塞）

| # | 任务 | 阻塞 |
|---|---|---|
| D1 | npm publish 0.2.x | 需你的 OTP |
| D2 | GitHub 加 `dsh-plugin` topic | 需网页操作或带 repo 权限 token |
| D3 | awesome-dsh-plugin 提交 PR | 依赖 D1、D2 及仓库满 24h |

## 6. 工作流 F：诚实性修复（调研发现，最高优先级）

以下两条来自「其他测试类别」调研，它们不是新功能，而是**现有代码里的缺陷**。

### F1 历史 flaky 判定会掩盖真实回归（已核实，严重）

**调研事实**：Google 的实测数据——**1.5% 的测试运行**是 flaky，**约 16% 的测试**存在某种 flakiness（这两个数字经常被互换且不可比）。关键在于：**pass→fail 转变中 84% 涉及 flaky 测试，剩下 16% 是真实回归**。

**对现有代码的核实**（`src/command/history.ts:21-25`）：
```ts
if (old?.status === 'passed' && test.status === 'failed') regressions.push(...)   // 21
if (old?.status === 'failed' && test.status === 'passed') recovered.push(...)     // 22
const flaky = test.status === 'passed' && statuses.includes('passed') && statuses.includes('failed')  // 24
return flaky ? { ...test, status: 'flaky' as const } : test                        // 25
}
```
第 27 行把**改写后的**状态写进历史快照。后果链：
1. 一个测试一旦被存为 `flaky`，第 21、22 行的 `old?.status === 'passed'`/`'failed'` 永远不再成立；
2. 于是该测试**此后的真实回归与恢复永远无法被检出**；
3. 我的模拟验证：`stored='flaky'` + `current='failed'` → regression 与 recovered **都不触发**。

这与调研的警告完全一致：朴素的「先通过后失败＝flaky」启发式会**压制真实回归**。

**修复方案**：
- 从 `projectHistory` 中**删除 flaky 改写**；
- 历史快照只存**原始状态**，绝不存派生状态；
- 单次运行内唯一可辩护的不稳定性信号是 **`attempts` /「重试后通过」**，且**不得称为 flaky**；
- 跨运行趋势保留，但**不做 flaky 判定**；真正的 flaky 检测需要多次运行与统计方法，属 Large 工作量，明确不做。

**验收判据**：
- `stored=flaky` 的场景不再可能出现（不再写入派生状态）；
- 测试覆盖「先通过 → 再失败」仍必须触发 regression（即使中间有多次通过）；
- 报告不出现未经统计支持的 flaky 结论。

### F2 选择性运行与完整运行看起来完全一样（调研评为最高风险的诚实性缺口）

**调研结论**：一个只跑了 3412 个测试中 128 个的绿色报告，与全量绿色报告是**实质性不同的结论**，而当前数据模型无法表达这个区别。

**修复方案**：
- 新增第三种行状态 `not run (deselected)`；
- `deselected` **不得**并入 `passed`，也**不得**并入 `skipped`——skipped 表示 runner 到达了但选择跳过，deselected 表示从未被考虑；
- 报告头部展示**已知总数分母**（如 `128 of 3412 known tests`）；
- 选择性运行**禁止**出现「100% 通过」类徽标。

**说明**：我们当前不实现测试影响分析（TIA），因此 `deselected` 状态暂无产出者。此项**降级为「当引入选择性运行时的前置条件」**，记录于计划而不立即实现。

## 7. 工作流 E：其他测试类别扩展（调研完成）

完整调研：`/tmp/test-categories-research.md`（802 行，66 个引用 URL，20 条明确标注未核实）。

### 7.1 调研的五个关键发现

1. **JUnit XML 没有官方规范**（testmoapp/junitxml 原文：「There is no official specification for the JUnit XML file format and various tools generate and support different flavors」）。因此**加固这一个解析器**可同时支持 Go(gotestsum)、Rust(nextest)、Java(Surefire/Gradle)、PHP、Swift、Cypress、WebdriverIO、Selenium。需处理：根节点 `<testsuite>` vs `<testsuites>`、counts 声明为字符串而非整数、一文件一类的 glob、以及 `<rerunFailure>`/`<flakyFailure>` 族。
2. **SARIF 2.1.0 是杠杆率最高的新解析器**：OASIS 标准化的 findings 格式，一个解析器可接入 Ruff、Trivy、Semgrep、Grype、osv-scanner、CodeQL。**SARIF 2.2 尚未发布**。
3. **CTRF 不值得作为内部模型**：GitHub API 核实 93 stars / 4 forks，README 自述 pre-1.0，生态内 reporter 均出自同一组织。但**借鉴两个字段设计**：`rawStatus`（保留源格式自己的状态词）与 `retryAttempts[]`。
4. **Flakiness 无法从单次运行判定**——这是定义问题而非工具缺口。见 F1。
5. **当前最危险的缺口不是缺类别，而是选择性运行与完整运行无法区分**——见 F2。

### 7.2 axe 的 57% vs 80% 已被精确解决（修正我此前的说法）

我此前说「两个数字并存且未统一说明」——**这个说法不准确**。调研已查明两者测的不是同一件事：
- **57%**：axe-core README 原文「on average 57% of WCAG issues automatically」；底层 Deque 研究为 **57.38% 的 issue 实例**。
- **80%**：来自 axe **DevTools 扩展**，含**人在回路**的 Intelligent Guided Tests，**不是**纯自动化数字。
- **真正的陷阱是分母**：Deque 自己承认自动化只覆盖 **50 条 WCAG 2.1 AA 成功准则中的 16 条**，这与「20–30% 自动化覆盖」的说法一致。**即 57% 指的是实例，折合约 32% 的准则。**

**设计后果**：报告**不得**单独引用 57% 作为「覆盖率」，必须带分母说明；Lighthouse 满分也不等于无障碍（人工审计不计入分数）。

### 7.3 Tier 1 建议（调研推荐，工作量小到中）

| # | 变更 | 工作量 | 说明 |
|---|---|---|---|
| 1 | `not run (deselected)` 行状态 + 已知总数分母 | 小 | 见 F2，当前无产出者，记录待用 |
| 2 | JUnit 方言加固 + 多文件合并 | 小 | 一次改动解锁约 8 个生态 |
| 3 | `attempts`/「重试后通过」列 + 单次运行诚实说明 | 小 | 见 F1，是唯一可辩护的指标 |
| 4 | SARIF 2.1.0 解析器 | 中 | 一个解析器覆盖多类安全/静态分析工具 |
| 5 | 快照计数（含 obsolete/`unchecked`） | 小 | 字段**已存在于我们今天就解析的 Jest/Vitest JSON 里** |

### 7.4 明确不做（附理由，避免范围蔓延）

| 不做 | 理由 |
|---|---|
| CTRF 作为内部模型 | pre-1.0、单一组织、93 stars |
| TAP | 无耗时、无文件/行号、无层级 |
| SBOM（CycloneDX/SPDX） | **品类错误**：那是清单不是发现，会产生一个自信的空安全区块 |
| 「Selenium 支持」/「Puppeteer 支持」 | **这两个结果格式不存在**：W3C WebDriver 是线协议，Puppeteer 是库 |
| Flakiness 评分 | 单次运行无法判定 |
| 任何 a11y 百分比/分数 | 见 7.2，分母不可辩护 |
| 绝对墙钟性能门禁 | Grafana 自己的指南称异构基础设施「不适用」，门禁「可能造成虚假保证」 |
| 逐行覆盖源码标注 | 破坏单文件定位 |
| 跨工具 WCAG 去重 | axe 规则 slug 与 Pa11y 的 WCAG 技术路径不是等价标识符，合并即虚构等价 |
| Patch coverage / SARIF baselineState / 趋势 | 均需基线引用或持久历史，与自包含定位冲突 |

### 7.5 调研中标记的解析陷阱（实现前必读）

| 生态 | 陷阱 |
|---|---|
| Go | 构建失败可能**零测试事件**——朴素解析器会报「0 个测试，全部通过」 |
| Rust | `cargo test -- --format json` 在 stable **硬报错**（仅 nightly）；nextest 的 JUnit 是配置驱动；`flaky-fail-status="success"` 会让测试**在 XML 里通过而 runner 退出码非零** |
| .NET TRX | `duration` 是 `HH:mm:ss.fffffff`，`parseFloat("00:00:01.234")` 返回 **0** |
| RSpec | JSON 在 `close` 时写出，被杀死的运行留下**截断的不可解析 JSON**——必须保留退出码回退 |
| JUnit XML | 通过由**子元素缺失**编码，截断的文件会被读成**全部通过**——必须把截断当错误 |
| coverage | `LH`=命中、`LF`=总数；**LCOV 没有语句记录**；Go 无分支/函数数据。不得只显示一个数字 |
| k6 | 默认 `summaryTrendStats` **不含 p99**；`http_req_duration` **不含 DNS/连接时间**；jslib 的 `jUnit()` 转换只保留阈值，丢失全部分布 |
| Swift | `.xcresult` 无 Xcode 基本不可解析（Codecov 将其列为不支持）；`Expected Failure` 是**类通过**，映射为 failed 会产生假红 |
| Go golden | `-update` 是**各项目自建的 `flag.Bool`，不是 `go test` 标准 flag** |

### 7.6 调研的诚实性

66 个 URL 全部为实际抓取；**20 条无法从一手来源确认的声明被明确标记为未核实**（包括 JUnit XML 是否有规范化 `flaky` 属性、IBM accessibility-checker 的字段名、Percy/Chromatic 格式等），而非猜测。调研者还独立复核了最高风险项（CTRF 状态、SARIF 版本、axe 57%、Google flaky 数字、LCOV 记录、Go TestEvent、WebAIM 2026）。
## 8. 建议执行顺序

```
第一批（安全网）      A1-A6          6 项   不依赖外部条件
第二批（根本能力）    C1-C7          7 项   先数据模型后展示
第三批（角色行为）    B1-B3, B6      7 项   策略层 + 键盘 + 夹具自证
第四批（补齐）        B4, B5, B7, B8 6 项
第五批（报告美化）    C8, C9         2 项
第六批（诚实性）      F1            1 项
第七批（扩展）        E Tier1       最多 5 项
发布                  D1-D3          3 项   等外部条件解除
```

**第一批与第二批都是零外部依赖**，可以立即开始。

## 8.1 执行进度（2026-09-10 夜）

| 工作流 | 状态 | 证据 |
|---|---|---|
| **A 工程风险修复** | ✅ 完成 | 测试 108 → **223**；语句覆盖 79.45% → **95.5%**；`/test` 入口 0% → **96.9%**；`run_tests` 入口 0% → **100%**；6/15 文件达每文件 100% |
| **F1 flaky 掩盖回归** | ✅ 完成 | 移除派生状态改写；新增 9 项历史契约测试，含「pass→fail→pass→fail 仍必须报回归」；真实项目验证 40/40，历史仅存真实状态 |
| C 截图标注与分页 | ⬜ 未开始 | 设计已就绪 |
| B 真人模拟策略层 | ⬜ 未开始 | 设计已就绪 |
| E Tier 1 扩展 | ⬜ 未开始 | 调研已完成 |
| D 发布收尾 | ⬜ 阻塞 | 需 OTP 与 GitHub topic |

提交：`f9380e3`（入口与分支测试）、`984d07d`（flaky 修复）。

**A 与 F1 过程中额外发现并修复的真实缺陷**：`optionalPositiveInt` 的名称与 JSDoc 声明「正数」，实现却接受 0，错误文案为「non-negative」。零值超时、等待与视口尺寸都是配置错误，已拆分校验。

## 9. 与原始目标的对照

| 原始要求 | 当前 | 计划中 |
|---|---|---|
| 真实 Chromium 旅程 | ✅ | — |
| 六个角色行为差异 | ❌ 仅标签 | B1-B8 |
| 关键/失败/最终截图 | ✅ | — |
| **截图正确性** | ❌ 无校验 | C4 |
| **标注重要部分** | ❌ 无数据模型 | C1-C3, C7 |
| 规则化评分 | ✅ | B7 扩展 |
| 视觉规则 + axe | ✅ | C1 增强 |
| 截图压缩 | ✅ | — |
| 失败重试 | ✅ | B2 扩展恢复路径 |
| 结构化结果（7 格式） | ✅ | E Tier1（JUnit 加固、SARIF） |
| 历史/趋势/回归/Flaky | ⚠️ flaky 判定有缺陷（F1 必修） | F1、G3 |
| 六种调用入口 | `/test`、`/test <cfg>`、`/test auto`、`run_tests` ✅ | — |
| 社区包 + `dsh plugin add` | ✅（tarball 验证） | D1 |
| dsh-market 上架 | ❌ | D2, D3 |
| 报告分页美观 | ❌ | C8 |