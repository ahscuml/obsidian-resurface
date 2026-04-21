# 🌱 Resurface

> 让你在 Obsidian 里写过的笔记，按科学的节奏重新找到你。

基于 [FSRS-6](https://github.com/open-spaced-repetition/fsrs4anki/wiki) 的 Obsidian 复习插件。笔记写完即入池，无需制卡；调度系统在合适的时刻把它们重新推送给你；复习既是检索，也是对笔记的二次加工。

## 为什么再做一个复习插件

已有的 SRS 工具（Anki / RemNote / Obsidian-spaced-repetition）的核心假设是"**人造卡片**"—— 你需要专门花时间把知识打包成问答卡。这和 Zettelkasten / atomic notes 的工作流天然割裂。

Resurface 走相反路径：

|  | Anki 范式 | Resurface |
|---|---|---|
| 复习单元 | 人造卡片 | **笔记本身** |
| 制卡工作量 | 需要专门造卡 | 零 |
| 复习时能做什么 | 看答案 + 打分 | 看笔记 + 打分 + **可编辑** |
| 管理方式 | 提前分 deck | 复习现场决定排除 |

## 核心特性

- **FSRS-6 调度**：目前开源 SRS 算法中的 SOTA（[srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) Log Loss 比 SM-2 低约 30%）
- **笔记自动入池**：新建的 markdown 笔记 3 天 ± 1 天后首次复习
- **智能排序**：按"当前遗忘概率 R"升序，最快要忘的先出
- **每日上限**：默认 15 条，超出部分 FSRS 自动消化
- **白名单路径**：只复习指定目录下的笔记（递归 + 多选）
- **短笔记过滤**：字符数 < 50 的笔记默认不进池
- **扁平 + 克制的 UI**：不推送、不打扰，只在你打开 Obsidian 时安静提示
- **复习时编辑笔记**：主区打开真笔记 · 可修改 · 可加链接 · 笔记是活的

## 安装

> ⚠️ 目前处于 MVP 阶段，尚未提交到 Obsidian 社区插件市场。

### 手动安装

1. 从 [Releases](../../releases) 下载最新版本的 `main.js`、`manifest.json`、`styles.css`
2. 放到你 vault 的 `.obsidian/plugins/obsidian-resurface/` 目录下
3. Obsidian → 设置 → 社区插件 → 已安装插件 → 启用 Resurface

### 从源码构建

```bash
git clone <this-repo>
cd obsidian-resurface
npm install
npm run build
```

构建产物会自动部署到 `.env.local` 里 `VAULT_PATH` 指定的 vault 中。

## 使用

1. **启用后**：Resurface 会扫描 vault 里所有现有 markdown，加入复活池（3 天 ± 1 天后开始出现）
2. **每次打开 Obsidian**：顶部出现 `🌱 今天有 N 条笔记想重新见你` 提示 + ribbon 🌱 角标显示数字
3. **点 ribbon 图标**：右侧栏打开复习面板，显示第一条笔记的标题 + TLDR
4. **点"展开正文"**：主区打开真正的笔记内容（复用一个"复习专用 tab"）
5. **评分"会"/"不会"**：FSRS 调度下次时间；默认停留在当前笔记，可编辑/加链接
6. **点"进入下一条"**：切到下一条。反复直到今日 N 条都复习完
7. **"不再复习"**：随时从复习池永久移除某条笔记

## TLDR 提取

卡片正面默认展示 **标题 + TLDR**。TLDR 按以下优先级提取：

1. frontmatter 的 `tldr` 字段
2. `> [!tldr]` callout
3. `## TLDR` 或 `## 摘要` 区块下的第一段
4. 笔记第一段
5. 笔记开头 200 字

无需改动写作习惯——越用心写 TLDR，cue 质量越高。

## 设置项

**基础**：每日上限 · 首次复习间隔 · 评分档数 · 自动进入下一条 · 复习目录（白名单）

**高级**：期望保留率 · 间隔抖动 · TLDR 字段名 · 最小字符数 · streak 开关 · 编辑阈值 · 超阈值动作（M1）

## 设计哲学

- **笔记 = 复习单元**：不造卡片，笔记本身就是最小单元
- **不打扰**：被动视觉提示，不推送
- **复习现场决策**：不需要提前配置/打标签
- **笔记是活的**：复习时可编辑，笔记会生长

## 文档

- [产品设计文档](./docs/产品设计文档.md)
- [技术架构文档](./docs/技术架构文档.md)
- [学习科学调研](./research/)（4 份一手文献综述）
- [CHANGELOG](./CHANGELOG.md)

## 路线图

- [x] **v0.1.0 MVP**：调度 + 复习 UI + 白名单 + 短笔记过滤
- [ ] **M1**：编辑影响调度（大改笔记 → Stability × 0.5）· JOL 校准反馈
- [ ] **M2**：排除列表管理 UI · 笔记稳定期
- [ ] **M3**：FSRS 参数本地优化 · 数据面板
- [ ] **M4**：多语言 · 同步冲突处理 · 大 vault 性能优化

## 技术栈

- **TypeScript** · **Obsidian Plugin API** · **原生 DOM**（无 React/Vue）
- [**ts-fsrs**](https://github.com/open-spaced-repetition/ts-fsrs) 4.7.1 · MIT
- **esbuild** 打包 · **Vitest** 纯函数测试（48 tests）

## 致谢

算法与证据基础：
- [FSRS](https://github.com/open-spaced-repetition) · 叶峻峣（Jarrett Ye）及 open-spaced-repetition 社区
- [Robert & Elizabeth Bjork](https://bjorklab.psych.ucla.edu/) 的 desirable difficulty 理论
- Henry Roediger & Jeffrey Karpicke 的 retrieval practice 研究
- Piotr Woźniak 及 SuperMemo 团队的数十年奠基工作

## 许可证

[MIT](./LICENSE)
