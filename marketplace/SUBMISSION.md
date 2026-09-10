# 上架 dsh 插件市场：提交清单

市场 = [dsh-market](https://github.com/dsh-market/dsh-market)（Settings → Plugin Market），
目录数据来自精选仓库 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

## 一、提交内容：一个 YAML 文件

在 `awesome-dsh-plugin` 仓库新增 **一个文件**（不要手改 README，那两个 README 由脚本生成）：

```text
data/plugins/CBHDYL__dsh-test-observatory.yml
```

内容就是本目录下的 [`CBHDYL__dsh-test-observatory.yml`](CBHDYL__dsh-test-observatory.yml)。

## 二、提交前必须满足的条件（官方评审会逐条核对）

| # | 要求 | 我们的状态 |
|---|---|---|
| 1 | `package.json` 声明 `dsh.bundle` | ✅ 已声明 `dsh.bundle.patch` |
| 2 | 仓库根有 `cordis.patch.yml` | ✅ 有 |
| 3 | 能用 `dsh plugin add` 安装 | ✅ 已用 tarball 验证 |
| 4 | 仓库有真实可用代码 | ✅ 82 项测试通过 |
| 5 | 仓库**创建满 1 天**（CI 自动查） | ⬜ 仓库创建于 2026-09-09T23:18 UTC，当前（2026-09-10T20:19 UTC）未满 24h，需再等待 |
| 6 | 仓库加 `dsh-plugin` topic | ⬜ 待办（需 GitHub 网页或 API 令牌操作，当前会话无 GitHub 写权限令牌） |
| 7 | 描述属实、无营销词 | ✅ 描述只陈述功能，可逐项核对 |

## 三、您需要做的步骤

1. 在 GitHub 创建仓库 `CBHDYL/dsh-test-observatory`（public）。
2. 把 `packages/test-runner/test-observatory/` 的内容作为仓库根（见下方「导出」）。
3. 给仓库加 topic：`dsh-plugin`。
4. 等满 1 天。
5. Fork `awesome-dsh-plugin`，把上面的 YAML 放到 `data/plugins/`，提 PR。

## 四、导出为独立仓库

一条命令完成导出（已实测）：

```sh
cd packages/test-runner/test-observatory
node scripts/export-repo.mjs /path/to/dsh-test-observatory
```

脚本会复制源码、测试、构建产物、市场条目、LICENSE，并重写 `package.json`（去掉 workspace 协议、补上独立仓库的 devDependencies 与脚本），同时生成独立的 `tsconfig.json` 与 `tsconfig.build.json`。

导出后自检：

```sh
cd /path/to/dsh-test-observatory
pnpm install
pnpm build     # 应输出 10 个文件
pnpm test      # 应为 82 项通过
pnpm pack      # 产出 tarball
```

再把 tarball 装进一个隔离 profile 验证：

```sh
DSH_HOME=/tmp/check dsh plugin --profile web add ./cbhdyl-dsh-test-observatory-0.1.0.tgz
DSH_HOME=/tmp/check dsh --profile web --dump-config | grep -A3 test-observatory
```

## 五、PR 标题与正文（可直接复制）

标题：

```text
Add CBHDYL/dsh-test-observatory (tools)
```

正文：

```markdown
**Plugin:** https://github.com/CBHDYL/dsh-test-observatory
**npm:** @cbhdyl/dsh-test-observatory
**Category:** tools

What it does: `/test` reads a `test-observatory.yml` suite, runs the declared shell-command
cases, and optionally drives declared browser journeys through a real headless Chromium —
one journey per persona — then writes one self-contained HTML report. The report contains
pass/fail per case, a rule-based experience score across six weighted dimensions, persona
journey rails with per-step timings, captured screenshots embedded as data URIs,
deterministic visual checks (broken images, missing alt text, horizontal overflow,
elements past the viewport, placeholder-only fields), and an axe-core accessibility scan.
A `run_tests` tool exposes the same execution and report to the agent.

Installability: the repo declares `dsh.bundle` with a `cordis.patch.yml` that inserts two
rows (`tool-test-runner`, `command-test`) referencing the package's own subpath entries.
Verified locally with `dsh plugin --profile web add <tarball>` followed by `--dump-config`.

Requirements: browser journeys need a Chromium; `DSH_BROWSER_EXECUTABLE` points at one and
the journey pass fails loudly when none is found.

Tests: 105 passing, 2 skipped (unit, jsdom component, real-browser specs; structured-result parsers for JUnit/Pytest/Vitest/Jest/Playwright/API/performance; bounded run history with trend/regression/recovery/flaky detection).
```

## 六、描述里的每一项都能被核对

评审会逐条核对描述是否属实，以下是对应位置：

| 描述中的声明 | 代码位置 |
|---|---|
| `/test` 读配置并跑用例 | `src/command/index.ts`、`src/command/config.ts` |
| 按角色跑浏览器旅程 | `src/experience/runner.ts` |
| 真实 headless Chromium | `src/experience/runner.ts` 的 `launchChromium` |
| 自包含 HTML 报告 | `src/report/render.ts` |
| 六维规则评分 | `src/experience/scoring.ts` |
| 截图以 data URI 嵌入 | `src/experience/runner.ts` 的 `captureBounded` |
| 视觉规则检查 | `src/experience/visual.ts` |
| axe-core 无障碍扫描 | `src/experience/a11y.ts` |
| `run_tests` 工具 | `src/tool/index.ts` |

## 七、与已有条目的差异

目录里最接近的两条：

- `dsh-a11y-scan`（tools）：只做 axe-core 无障碍扫描，不跑测试、不出综合报告。
- `qa-skills`（skill）：提供 QA 流程的 agent 技能，不含测试执行器。

本插件是「用例执行 + 结构化框架结果解析 + 有界运行历史 + 浏览器旅程 + 截图 + 规则评分 + 单文件报告」的组合，与两者不重叠。