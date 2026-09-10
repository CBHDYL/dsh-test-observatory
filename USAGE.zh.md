# 使用流程 / Usage

本文每一步都在本机实跑验证过。

## 0. 前置条件

| 项 | 说明 |
|---|---|
| DSH | `dsh` 可运行（源码或已安装均可） |
| 浏览器 | 真人模拟需要 Chromium；用 `DSH_BROWSER_EXECUTABLE` 指定路径。不设时纯 shell 用例照常工作，声明了 `journeys` 才报错 |
| 工具在 PATH 里 | 用例命令在会话工作目录执行；工具不在默认 PATH 时，命令里显式导出，例如 `export PATH="$HOME/.local/bin:$PATH" && uv run pytest` |
| Node | 18+（仓库内测试用 22） |

## 1. 安装（已完成，供参考）

```sh
# 从 npm（发布后）
dsh plugin --profile web add @cbhdyl/dsh-test-observatory

# 或直接从 GitHub
dsh plugin --profile web add github:CBHDYL/dsh-test-observatory
```

安装会自动把包加入 profile 的 `dsh.profile.bundles`，并插入两行：

- `tool-test-runner` → `@cbhdyl/dsh-test-observatory/tool`（模型工具 `run_tests`）
- `command-test` → `@cbhdyl/dsh-test-observatory/command`（人类命令 `/test`）

## 2. 重启 GUI

插件在启动时加载，装完必须重启：

```sh
launchctl kickstart -k gui/501/com.dsh.web
```

验证是否加载（在会话里输入）：

```text
/test auto
```

## 3. 写配置

在**项目目录**下建 `test-observatory.yml`。

> ⚠️ **下面的示例是模板，里面的命令、URL、选择器都是占位符，必须改成你自己项目的真实值。**
> 直接复制不改，`/test` 会如实报告失败（不会假装通过），报告里能看到具体哪一步失败。

命令在**会话的工作目录**下执行，所以 `cd backend && ...` 这类相对路径是相对你的项目根，而不是 dsh 进程所在目录。

```yaml
report:
  title: 发布候选报告          # 可选，报告标题
  project: Atlas Shop          # 可选，报告头部项目名
  outputPath: test-report.html # 可选，默认 test-observatory-report.html
  historyPath: .test-observatory/history.json # 可选；false 表示关闭历史

cases:                          # 必填，至少一条
  - name: 单元测试              # 必填
    command: pnpm run test      # 必填，用 bash -c 执行
    expectedExitCode: 0         # 可选，默认 0；命令必须失败时显式声明
    timeoutMs: 600000           # 可选
    suite: Unit                 # 可选，报告分组
    owner: Platform             # 可选，报告显示归属
    result:                      # 可选，读取框架生成的测试级结果
      format: pytest             # junit/pytest/vitest/jest/playwright/api/performance
      path: reports/junit.xml    # 相对项目根

journeys:                       # 可选；有它才有体验评测区块
  - persona: 首次访问用户        # 必填，报告里的角色名
    device: Desktop · Chrome    # 必填
    name: 完成结账              # 必填，任务名
    viewport:                   # 可选，默认 1440x900
      width: 1280
      height: 800
    steps:                      # 必填，至少一步
      - label: 打开首页          # 必填
        actions:                # 必填，至少一个；按顺序执行，第一个失败即该步失败
          - kind: goto
            url: http://127.0.0.1:3000/
          - kind: expectText
            text: 完成结账
          - kind: screenshot
            caption: 首屏
            category: key
      - label: 提交支付
        actions:
          - kind: fill
            selector: '#email'
            value: buyer@example.com
          - kind: click
            selector: '#submit'
          - kind: expectVisible
            selector: '#done'
          - kind: screenshot
            caption: 支付完成
            category: final
```

### 动作类型（六种）

| kind | 必填字段 | 作用 |
|---|---|---|
| `goto` | `url` | 打开页面 |
| `click` | `selector` | 点击 |
| `fill` | `selector`, `value` | 填表单 |
| `expectText` | `text` | 等文本出现 |
| `expectVisible` | `selector` | 等元素可见 |
| `screenshot` | `caption`, `category` | 截图（`key`/`fail`/`mobile`/`final`） |

### 结构化结果

当命令产生 JSON 或 JUnit XML 时，声明 `result` 后报告按真实测试明细展示，而不是只显示一条命令。Playwright 保留重试和附件；API 保留状态码与耗时；性能结果保留阈值、P50/P95/P99 与吞吐。默认保留最近 20 次紧凑历史，用于趋势、回归、恢复和 Flaky 判断。

## 4. 运行

```text
/test                      跑当前目录的 ./test-observatory.yml
/test path/to/suite.yml    跑指定配置
/test auto                 探测项目类型并打印可粘贴的配置
```

实跑输出示例：

```text
1/2 passed. Report: /path/to/test-report.html
Failed: 故意失败的用例
```

配置缺失时的报错：

```text
no configuration file at /path/to/nope.yml

Usage: /test [<config-file>]
  /test                     run ./test-observatory.yml
  /test path/to/suite.yml   run the named configuration
  /test auto                print the detected test commands to declare
```

## 5. 读报告

报告默认写在会话工作目录下，**单文件、无外部资源、双击即开**。包含：

- 管理层摘要：质量分、发布结论、风险摘要
- 指标：通过率、耗时、覆盖、失败数
- 趋势、失败原因、最慢用例、执行时间线
- 新增回归与已恢复用例
- 体验评分（六维加权）
- 角色卡片、旅程步骤轨迹（含每步耗时）、截图画廊
- 视觉规则检查（图片损坏、缺 alt、横向溢出、元素越界、只有 placeholder 无标签）
- axe-core 无障碍扫描明细
- UX 问题清单（浏览器事实 / AI 解释 / 建议 三层）

## 6. 模型侧：`run_tests` 工具

Agent 也可以直接调用，不需要配置文件：

```json
{
  "testCases": [
    { "name": "单元测试", "command": "pnpm test", "expectedExitCode": 0, "timeoutMs": 600000 }
  ],
  "reportPath": "/abs/path/report.html",
  "title": "可选标题"
}
```

## 7. 体验评分怎么算

| 维度 | 权重 | 依据 |
|---|---:|---|
| 功能完成度 | 30 | 全步骤通过的旅程占比 |
| 易用性 | 20 | 步骤通过率 |
| 视觉质量 | 15 | 视觉违规扣分（阻塞 −5，其他 −2） |
| 反馈与容错 | 15 | 步骤通过率 |
| 无障碍 | 10 | axe 违规扣分（阻塞 −3，其他 −1） |
| 感知性能 | 10 | 步骤是否在 5 秒内完成 |

违规按「规则 + 观察事实」去重，同一页面缺陷被多个角色看到只扣一次。

## 8. 已知边界

- 视觉检查是五条客观规则的地板，不评审美（间距、对齐、层次不测）
- 旅程串行执行；`retries` 可配置重试
- 截图以 data URI 内嵌；超过 400 KB 会降级为 JPEG，仍超限才丢弃
- 检查（视觉/无障碍）失败不会让整次运行崩溃：会记为一条 `*-check-failed` 发现，旅程结果照常保留
- 中文角色名 id 已修复（Unicode 感知）
- 用例命令在会话工作目录执行（修复前用的是进程目录，相对路径命令会跑错地方）