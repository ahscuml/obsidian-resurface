# 调研结果 · Obsidian 复习插件

> 2026-04-20 · 为设计 Obsidian 复习插件收集的循证设计基础

## 目录

| 文件 | 内容 | 何时阅读 |
|---|---|---|
| [00-研究整合总览.md](./00-研究整合总览.md) | 4 份调研的交叉印证结论、算法选型、架构初稿 | **先读这个**，了解整体图景 |
| [01-遗忘曲线与间隔效应.md](./01-遗忘曲线与间隔效应.md) | Ebbinghaus 复现、Cepeda meta-analysis、Temporal Ridgeline 公式、扩展间隔的证伪 | 决定"首次复习何时"、"间隔如何缩放"时回查 |
| [02-SRS算法对比-FSRS深度剖析.md](./02-SRS算法对比-FSRS深度剖析.md) | SM-2 / FSRS v1-v6 / SM-17 / Duolingo HLR 对比；FSRS 公式细节；工程落地考量 | 实现调度器时查看（公式、ts-fsrs 接入） |
| [03-检索练习效应与合意难度.md](./03-检索练习效应与合意难度.md) | Roediger & Karpicke 系列、Bjork 合意难度、JOL 偏差、反馈机制 | 设计复习交互形态时回查 |
| [04-交替练习与学习策略.md](./04-交替练习与学习策略.md) | Interleaving 边界条件、Elaboration、Cornell/Feynman/Zettelkasten 的证据级别、Dunlosky 十大策略排名 | 设计复习队列排序、附加功能时回查 |

## 调研方法

- 4 个子 Agent 并行调研，每个主题独立进行 2 次调研做交叉验证，共 8 份报告归并
- 所有结论追溯到一手来源：论文原文、元分析、官方算法仓库（fsrs4anki、srs-benchmark、SuperMemo 官网等）
- 已识别并剔除 AI 内容农场伪造的数据（如 Feynman 技法流传的 fMRI/Science 数据）

## 核心结论速览

1. **检索练习 > 被动重读**（Hedges' g ≈ 0.50-1.07），是插件最重要的交互原则
2. **间隔 > 集中**（Cepeda 元分析，3 倍长期保留提升），是插件存在的理由
3. **FSRS-6 是算法选型的明确答案**（srs-benchmark Log Loss 0.35 vs SM-2 的 0.49），通过 ts-fsrs (MIT) 直接集成
4. **首次复习不应在第二天**，应 2-5 天后（证据：Karpicke & Roediger 系列）
5. **不要迎合用户舒适度**（JOL 偏差），但要设计 UI 帮助用户理解这种张力

## 被明确否定的做法

- Progressive Summarization / Cornell 三栏 / Feynman 品牌化 / 纯推送重读 / 全局随机 interleave / 展示伪精确遗忘百分比

## 下一步

基于这些证据还需决定的产品设计问题（证据给出了原则，但具体选择需用户偏好）：

1. 内容形态（事实 / 概念 / 程序性）—— 影响默认卡片类型和算法是否够用
2. 复习触发方式（主动 vs 被动推送）
3. 笔记如何纳入复习池（frontmatter / tag / 文件夹 / 全量排除式）
4. 卡片生成方式（手动 cloze / LLM / 笔记标题 / 混合）
5. UI 如何处理 JOL 偏差（多强地教育用户）
