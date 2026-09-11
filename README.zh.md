# @cbhdyl/dsh-test-observatory

[English](README.md) | 中文

## 概述

把这一表层装进 profile 后，该 profile 获得两个入口：`/test` 由人来运行声明的测试套件并驱动真实浏览器旅程，`run_tests` 由 agent 自己运行 shell 命令用例。两者写出同一份自包含 HTML 报告——工程下钻之上的管理层摘要——可直接从磁盘打开，不需要服务器，也不引用任何外部资源。报告包含跨 6 个加权维度的规则化体验分、带标注截图的 persona 旅程轨道、确定性视觉检查，以及 axe-core 无障碍扫描。旅程需要一个 Chromium；本表层使用 `playwright-core`，它不会下载浏览器。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

安装本表层即让 profile 获得两个入口，移除它则一并失去。

### 安装到 profile

```text
dsh plugin --profile web add @cbhdyl/dsh-test-observatory
dsh plugin --profile web remove @cbhdyl/dsh-test-observatory
```

重启 `dsh web`，然后在会话中输入 `/test`。reconcile 步骤会激活该表层，因为 `package.json` 声明了 `dsh.bundle.patch`；缺少该声明时，同一条命令只会安装依赖，不会挂载任何内容。

### 你会得到什么

patch 插入两行，均由本包拥有：

| 行 id | 入口 | 呈现面 |
|---|---|---|
| `tool-test-runner` | `@cbhdyl/dsh-test-observatory/tool` | 面向模型的 `run_tests` 工具 |
| `command-test` | `@cbhdyl/dsh-test-observatory/command` | 面向人的 `/test` 命令 |

两者共用同一个报告渲染器与体验运行器：

- 管理层质量分、结论与风险摘要
- 通过率、耗时、覆盖率与失败计数
- 质量轨迹、失败原因、最慢测试、运行时间线
- 新增回归与已恢复的测试
- 跨 6 个加权维度的规则化体验分
- persona 卡片、带每步耗时的旅程轨道、截图画廊
- 确定性视觉检查（图片损坏、缺少 alt、溢出、仅占位符的字段）
- axe-core 无障碍扫描，逐条列出每个违规
- 把浏览器事实与 AI 解读分开呈现的 UX 发现

体验分的权重为：完成度 30、可用性 20、视觉质量 15、反馈与恢复 15、无障碍 10、感知性能 10。违规按规则与观察去重，因此一个页面缺陷被 3 个 persona 看到只计一次代价。

### 配置套件

在会话工作目录中创建 `test-observatory.yml`：

```yaml
report:
  title: Release candidate
  project: Atlas Shop
  outputPath: reports/test-observatory.html
  historyPath: .test-observatory/history.json
cases:
  - name: Unit tests
    command: pnpm run test
    suite: Unit
    owner: Platform
    timeoutMs: 600000
    result:
      format: vitest
      path: reports/vitest.json
  - name: Typecheck
    command: pnpm run typecheck
journeys:
  - persona: First-time visitor
    device: Desktop · Chrome
    name: First-time checkout
    viewport: { width: 1440, height: 900 }
    steps:
      - label: Open storefront
        actions:
          - kind: goto
            url: http://127.0.0.1:3000/
          - kind: expectText
            text: Complete your order
          - kind: screenshot
            caption: Checkout discovered
            category: key
      - label: Submit payment
        actions:
          - kind: fill
            selector: '#email'
            value: buyer@example.com
          - kind: click
            selector: '#submit'
          - kind: expectVisible
            selector: '#done'
```

人输入的命令：

```text
/test                     run ./test-observatory.yml
/test path/to/suite.yml   run the named configuration
/test auto                detect the project and print a declaration to paste
```

#### 结构化结果

当一个用例的命令写出产物文件时，它会展开为真实的测试级行。把 `result.format` 设为 `junit`、`pytest`、`vitest`、`jest`、`playwright`、`api`、`performance` 或 `sarif`，并把 `result.path` 设为相对会话工作目录的路径。历史默认保留 20 轮运行；把 `report.historyPath` 设为 `false` 可关闭。

Playwright 行保留重试次数与截图/视频/trace 路径。API 行保留方法、URL、期望状态与实际状态以及耗时。性能行在产物提供时保留阈值、P50/P95/P99 与吞吐量。

#### 旅程行为

每个旅程可声明一个 `behavior:` 预设——`neutral`、`first-time`、`expert`、`keyboard`、`error-prone`、`mobile` 或 `impatient`——它一并设定输入、时序、模态、环境与恢复策略。预设的任何维度都可以用对象形式覆盖。

### 提供浏览器

旅程需要一个 Chromium。本表层使用 `playwright-core`，它不下载浏览器；未找到时设置 `DSH_BROWSER_EXECUTABLE`：

```sh
export DSH_BROWSER_EXECUTABLE=/path/to/chrome
```

没有浏览器时旅程会明确失败，而不是报告为虚假的通过。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

`cordis.patch.yml` 就是整个表层：两行按 id 定位的 `insert`，因此 profile 可以覆盖或禁用任意一行，而插件代码全部通过这一个已安装的包解析。配置加载、用例执行与报告写入位于 `src/command/`；面向 JUnit、Vitest、Jest、Playwright、Pytest、API、性能与 SARIF 产物的结构化结果解析器与它们相邻，且绝不会因产物缺失而推断为通过。`src/experience/` 中的浏览器运行顺序驱动一个 Chromium，应用每个旅程的行为预设，捕获遮罩与标注后的证据，检查键盘可达性，并按规则为观测打分。`src/report/` 拥有文档本身：一个内联 CSS 的 HTML 字符串及其生成的资源包。

| 路径 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 两行插入内容 |
| [`src/command/`](src/command/) | 套件配置、执行、结构化结果、历史 |
| [`src/experience/`](src/experience/) | 旅程、行为预设、捕获、标注、检查、打分 |
| [`src/report/`](src/report/) | 自包含 HTML 文档及其资源 |
| [`src/tool/`](src/tool/) | `run_tests` 工具及其报告适配 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Test Runner 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/test-runner.zh.md)——测试用例与整轮汇总类型、执行模型与报告契约。
- [生成的工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.zh.md#cbhdyldsh-test-observatory)——模型接收的 `run_tests` schema。
- [test-runner 组](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/test-runner/README.zh.md)——本包所在的组。
- [USAGE.zh.md](USAGE.zh.md)——面向真实项目编写套件文件的完整走查。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型看到生成的 [`run_tests` schema](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.zh.md#cbhdyldsh-test-observatory)。可选的 `expectedExitCode` 与 `timeoutMs`、允许空的 `testCases` 数组，以及 `reportPath` 必须为绝对路径，都写在 schema 本身里。

#### Token 影响

插件加载期间每次请求固定。注册 `run_tests` 是本包增加模型上下文的唯一途径；它不添加系统提示词段落。

#### KV Cache 影响

只要 schema 及其在已注册工具中的位置不变，就保持前缀稳定。加载或卸载插件，或隐藏 `run_tests` 的工具范围限制，都可能从第一个变化的 schema token 起使复用失效。

### 工具结果

#### 模型看到的内容

一个文本块。没有失败时只渲染一行：`Ran <total> tests: <passed> passed, <failed> failed. Report written to <reportPath>.` 前 5 个失败用例各追加一个空行、`Test case "<name>" exited <code>, expected <expected>.`、`Command: <command>`，以及在用例捕获到输出时其 stdout 与 stderr 合并后的尾部；没有观察到退出码的用例改为显示 `did not exit normally`。失败用例超过 5 个时，末尾追加 `<count> further failing case(s) are in the report.`。校验后的输出值携带每个用例的 `stdout` 与 `stderr`，但模型只能通过这段证据看到它们。

#### Token 影响

每次调用 1 行，外加最多 5 段证据，与用例数量无关。每段证据最多保留该用例输出的最后 1,000 个字符；捕获的 `stdout` 与 `stderr` 各自在构造取值前截断到 20,000 个字符并附加尾随标记。

#### KV Cache 影响

仅追加；结果追加在复用的前缀之后，不会使更早的缓存 token 失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制告诉你 observatory 何时不完整或需要部署配合。它们是当前包约束，不是任务积压。

- **视觉质量覆盖 5 条客观规则，不评估美观**——间距、对齐与层级不被测量，因此干净的分数并不代表设计质量。
- **旅程在一个浏览器中顺序执行**——每个旅程都要等待前一个，支持可选的逐步重试；没有并行扇出。
- **截图以 data URI 内嵌**——超过 400 KB 的截图会被重新编码，仍然过大时最终丢弃；被丢弃的截图会作为捕获缺陷报告，而不是被悄悄省略。
- **历史把最近 20 份紧凑运行快照**保存在 `.test-observatory/history.json`；删除该文件即可重置比较。
- **结构化结果只报告产物中实际包含的行**——产物未记录的被取消选择或被跳过的用例无法出现，且没有任何受支持的格式提供已知总数分母。
- **`/test auto` 依据项目与脚本探测打印一份起始声明**——它既不推断 `result.format` 产物，也不推断旅程。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
