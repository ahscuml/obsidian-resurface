# Changelog

Resurface 版本变更记录。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

## [0.1.0] - 2026-04-21

### 🎉 MVP · 首个可用版本

实现从 0 到 1 的完整闭环：笔记写完 → 自动入池 → 按 FSRS 调度 → 用户复习 → 影响下次时间。

### Added · 新增

**核心功能**
- **FSRS-6 间隔重复调度**（基于 ts-fsrs 4.7.1）
- **笔记自动入池**：新建的 markdown 笔记 3 天 ± 1 天后首次复习
- **按 R 值智能排序**：最快要忘的笔记优先展示
- **每日上限**（默认 15，可调 5-50）：超出的笔记次日自动消化
- **白名单路径过滤**：只有指定目录（及其子目录）下的笔记进入复习池
  - UI：Obsidian 原生模糊搜索选择目录 + 可删 tag 列表
- **短笔记过滤**：字符数 < 50（可调）的笔记不进入复习池
- **复习现场排除**：「不再复习」按钮永久移除单条笔记，不污染笔记文件

**UI**
- 右侧栏复习面板（5 态状态机：initial / cue / rating / waitNext / completed）
- 主工作区「复习专用 tab」：所有复习笔记在此 tab 内流转，不污染用户原 tab
- 侧栏 ribbon 图标 + 待复习数角标
- 启动时顶部通知：「🌱 今天有 N 条笔记想重新见你」
- Cue 提取：**标题 + TLDR**，多级 fallback
  - frontmatter `tldr` → `> [!tldr]` callout → `## TLDR/摘要` → 第一段 → 前 N 字
- 扁平带边界按钮样式，主次层级清晰
- 纵向居中布局
- 空状态的温和文案 + streak/累计/复活池统计

**设置**
- 基础层 5 项：每日上限、首次间隔、评分档数、自动进入下一条、复习目录
- 高级层 11 项：期望保留率、间隔抖动、TLDR 字段名、TLDR fallback 字数、streak 开关、最小字符数、编辑阈值（字数/比例）、超阈值动作

**工程**
- 三层架构：Domain / Obsidian / UI，Domain 不依赖 Obsidian API
- TypeScript 严格模式 + esbuild + 自动部署到 iCloud vault
- **48 个单元测试全绿**，覆盖 FSRSService / Scheduler / CueExtractor / pathFilter / date
- 完整的复习历史 revlog（从 Day 1 就存，为将来的 FSRS optimizer 铺路）
- 笔记 rename/delete 事件监听，data.notes key 自动迁移

### Design Decisions · 关键设计决策

- **笔记 = 复习单元**（不造卡片、无制卡负担）
- **默认全部入池 + 白名单精细化**（不需要提前配置，想精细可精细）
- **实时计算今日列表**（不做日缓存，反映笔记最新状态）
- **无会话状态**（关掉就关掉，下次进来继续今天列表）
- **复习 tab 按需创建**（不存在就开，存在就复用）
- **按钮视觉层级刻意不对称**（主按钮加粗，次按钮不加粗，引导正常流程）
- **Stability × 0.5 作为默认编辑触发动作**（字段已就位，逻辑在 M1 实现）

### Not Yet · 尚未实现（留给后续里程碑）

- M1: **编辑影响调度**（阈值 + debounce + Stability × 0.5）
- M1: JOL 校准反馈（显示「自评 X% vs 实际 Y%」）
- M2: 笔记稳定期（新笔记编辑期保护）
- M2: 排除列表管理 UI（查看 + 恢复）
- M3: FSRS 参数本地重新优化（≥1000 次复习后）
- M3: 数据面板（R 分布、复习负载可视化）

### Code Stats

```
21 个源文件     源码
 5 个测试文件   48 个测试用例全绿
65 KB main.js   打包产物
```

### Verified By

手动验收通过 —— 使用者 @liyixin 在 iCloud 同步的个人 vault（147 条笔记）上跑通全部 MVP 流程。
