# 主流间隔重复算法（SRS）技术调研报告

> 面向 Obsidian 复习插件选型 · 2026-04-20
> 综合两次独立调研（a3fda10c + a47625560）的交叉验证结果

---

## TL;DR

| 维度 | **SM-2** (1987) | **FSRS-6** (2025) | **SM-17/18** (2014+) |
|---|---|---|---|
| 作者 | Piotr Woźniak | Jarrett Ye (叶峻峣) | Piotr Woźniak |
| 记忆模型 | 单变量 E-Factor（经验难度系数） | DSR 三变量模型 | 两组件模型（S, R）+ 难度 |
| 核心公式复杂度 | 极低（5 行伪代码） | 中等（~6 个关系式，21 参数） | 高且不公开细节 |
| 参数来源 | 硬编码常数，不训练 | 从用户历史 log 反向 fit（~21 参数） | 从 SuperMemo 全球数据回归 |
| 需要用户评分 | 0–5 六级 | 1–4 四级（Again/Hard/Good/Easy） | 0–5 六级 |
| 需要历史数据 | 不需要 | 冷启动可用默认参数，~1000 条后可优化 | 需要大规模历史积累 |
| 遗忘曲线 | 隐式；按 EF 几何倍增 | 显式幂函数 | 指数 `R = e^(-t/S)`（经修正） |
| Log Loss (srs-benchmark) | ~0.49（FSRS v1 等价） | **0.346** | 0.432（fsrs-vs-sm17 独立基准） |
| 开源 / 授权 | 公有领域，可自由实现 | 实现代码 MIT / BSD-3 | **闭源**，商业授权 |
| 典型应用 | Anki 旧版、Mnemosyne、SuperMemo 2 | Anki ≥ 23.10，25.09 升 FSRS-6 | SuperMemo 18/19 桌面版 |

**结论先行：Obsidian 插件应默认使用 FSRS（通过 ts-fsrs），SM-2 仅作为 legacy 模式的兜底**。详细理由见第 4 节。

---

## 1. SM-2：经典但过时

### 1.1 原始公式（1987, SuperMemo 1.0 for DOS）

```
初始化：
  EF = 2.5        # Ease Factor
  n  = 0          # 成功复习次数
  I  = 0          # 当前间隔（天）

复习一次后（q 为 0-5 用户评分）：
  if q >= 3:                    # 记住了
      if n == 0:  I = 1
      elif n == 1: I = 6
      else:        I = round(I * EF)
      n = n + 1
  else:                         # 忘了
      n = 0
      I = 1

  EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
  EF  = max(1.3, EF')
```

评分语义：5 完美 / 4 犹豫后答对 / 3 吃力答对 / 2 错但感觉本该会 / 1 错，提示后能想起 / 0 完全不记得。

### 1.2 为什么还在广泛用

- **简单**：不需要用户历史，不需要训练，十几行代码。
- **零冷启动**：新用户第一天就能用。
- **Anki 默认了二十多年**，Mnemosyne、早期 RemNote 都基于它。

### 1.3 为什么 Woźniak 自己都说过时

1. **不可适应**：SM-2 用一个**固定的** `I(n) = I(n-1) * EF` 函数生成间隔。即使累积了上亿条复习数据，算法也无法从中学习。
2. **EF 一身二用**：EF 既表示"卡片难度"，又表示"每次稳定度增量"。Woźniak 的比喻："像自行车上用同一个拨杆同时变速和变向"。
3. **没有 Retrievability 维度**：间隔只由"复习次数 n"决定，不考虑用户何时真的复习。延迟复习应带来更大的稳定度增长——这就是间隔效应，SM-2 完全忽略。
4. **记忆状态无显式建模**：没有"记忆痕迹多强"这样的内部量，仅有 EF 一个数字，难以用于预测"现在回忆成功概率"。
5. **ease hell**：用户打分策略的微小差异就会导致间隔爆炸或塌缩——Anki 社区著名的老问题。

SM-5（1989）改用 A-Factor + O-Factor 矩阵自适应，实测间隔从 SM-2 的 86 天平均提升到 190 天，保留率 89%→92%。此后 SuperMemo 不再使用 SM-2。

---

## 2. FSRS 深度剖析 ⭐

### 2.1 谱系与发展

| 版本 | 年份 | 参数数 | 关键变化 |
|---|---|---|---|
| FSRS v1 | 2022 | 7 | 初版实验，作者 Jarrett Ye（叶峻峣）个人自用 |
| FSRS v2 | 2022 | 14 | 双组件公式雏形 |
| FSRS v3 | 2022 | 13 | 第一个公开发行版，首次作为 Anki custom scheduler |
| FSRS v4 | 2023 | 17 | **遗忘曲线从指数改为幂函数**；Anki **23.10** 集成 |
| FSRS-4.5 | 2024 Q1 | 17 | 幂函数改为 `R = (1+19t/81S)^(-0.5)`，拟合更好 |
| FSRS-5 | 2024 Q3 | 19 | 引入 same-day review 建模；初始难度改以 D₀(Easy) 为 mean-reversion 目标 |
| FSRS-6 | 2025 | **21** | 遗忘曲线的衰减指数 `w₂₀` 变为可学参数；Anki **25.09** 原生支持 |

### 2.2 DSR 模型直觉

FSRS 把"记忆状态"分解成三个维度（描述**一张卡片**的记忆状态）：

- **R, Retrievability（可提取性）** ∈ [0, 1]：此刻尝试回忆能答对的概率
- **S, Stability（稳定性）**，单位"天"：**记忆衰减到 R=90% 所需的天数**。**这就是稳定性的定义**——不是一个抽象量，而是"这张卡片能撑多少天还保持 90% 回忆率"
- **D, Difficulty（难度）** ∈ [1, 10]：这张卡本质有多难。跟用户无关的"材料难度"。D 没有严格数学定义，是工程上的经验变量

> 关键洞察：SM-2 的 EF 混淆了 D 和 S；FSRS 把它们拆开后，模型表达力指数级提升。

二元模型（S, R）由 Woźniak 在 1990/1995 年证明"足以描述人脑单个记忆的状态"；Bjork 独立提出的 New Theory of Disuse 使用"storage strength / retrieval strength"等价概念。FSRS 把 D 作为第三个工程补丁加回来。

### 2.3 核心公式（FSRS-6，21 参数 $w_0 \ldots w_{20}$）

**① 遗忘曲线（Retrievability）——幂函数，衰减指数可学：**

$$R(t, S) = \left(1 + \text{factor} \cdot \frac{t}{S}\right)^{-w_{20}}, \quad \text{factor} = 0.9^{-1/w_{20}} - 1$$

约束 `R(S, S) = 0.9`。`w₂₀ ∈ [0.1, 0.8]`，多数用户 <0.2。

**为什么从指数改成幂函数？** 2018 年后，数据上幂函数拟合比指数更好。Expertium 给出的直觉解释：若人脑中混合了多条稳定度不同的记忆痕迹，**两条指数曲线的叠加在数学上更接近一条幂函数**。

**② 下一次间隔（给定 desired retention `r`）：**

$$I(r, S) = \frac{S}{\text{factor}} \cdot \left(r^{1/(-w_{20})} - 1\right)$$

当 `r = 0.9` 时 `I = S`（stability 的定义兑现）。

**③ 初始 Stability（首次评分后）：**

$$S_0(G) = w_{G-1}, \quad G \in \{1, 2, 3, 4\}$$

**④ 初始 Difficulty：**

$$D_0(G) = w_4 - e^{w_5 (G-1)} + 1$$

**⑤ 复习成功后 Stability 更新（核心公式）：**

$$S'_r(D, S, R, G) = S \cdot \left[e^{w_8} \cdot (11 - D) \cdot S^{-w_9} \cdot (e^{w_{10}(1-R)} - 1) \cdot w_{15}^{\mathbb{1}[G=2]} \cdot w_{16}^{\mathbb{1}[G=4]} + 1\right]$$

三条关键性质（与 SuperMemo 的 stability increase function 一致）：
- **D 越大 → SInc 越小**：难卡片每次涨得慢
- **S 越大 → SInc 越小**：已经很稳的记忆更难变更稳（记忆稳定度饱和）
- **R 越小 → SInc 越大**：**越是快忘了时成功回忆，记忆涨得越多**（间隔效应的量化体现）

**⑥ 复习失败后 Post-Lapse Stability：**

$$S'_f(D, S, R) = w_{11} \cdot D^{-w_{12}} \cdot \left((S+1)^{w_{13}} - 1\right) \cdot e^{w_{14}(1-R)}$$

且约束 `S'_f ≤ S`（忘了不会让稳定度升高）。

**⑦ Difficulty 更新（线性阻尼 + mean reversion）：**

$$\Delta D(G) = -w_6 (G - 3)$$
$$D' = D + \Delta D \cdot \frac{10 - D}{9}$$
$$D'' = w_7 \cdot D_0(4) + (1 - w_7) \cdot D'$$

mean reversion 把 D 往 `D₀(Easy)` 拉，**防止"ease hell"**（Anki 里 EF 越点越低、间隔塌陷的老问题）。

### 2.4 参数如何 fit

- **优化对象**：21 个 `w_i`
- **损失函数**：Binary Cross-Entropy，把每次复习当作二分类（回忆成功=1，失败=0），预测 $\hat{p} = R(t, S)$
- **优化器**：PyTorch 上用 Adam / mini-batch SGD；Rust 版用纯 Rust 实现
- **冷启动**：官方提供 default parameters，无历史数据也可用
- **推荐训练数据量**：Anki 官方建议 ≥1000 次复习再触发 optimize；<400 条退回默认参数
- **训练耗时**：单用户（10 万条 log）在本地 CPU 上通常 **< 10 秒**
- **个性化**：每个用户一套参数，不同人差异可能很大（记忆快的人 w₈ 更大）

### 2.5 为什么被认为是 SOTA

来自 [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)（数据集：10000 个 Anki 用户、约 3.5 亿条用于评估的复习记录）：

| 算法 | 参数数 | Log Loss | RMSE(bins) | AUC |
|---|---:|---:|---:|---:|
| RWKV-P（神经网络） | 2.7M | 0.2773 | 0.0250 | 0.833 |
| **FSRS-7** （最新） | 35 | **0.3437** | 0.0655 | 0.707 |
| **FSRS-rs**（Anki 当前实装） | 21 | **0.3443** | 0.0635 | 0.707 |
| **FSRS-6** | 21 | **0.3460** | 0.0653 | 0.703 |
| FSRS-5 | 19 | 0.3560 | 0.0741 | 0.701 |
| FSRS-4.5 | 17 | 0.3624 | 0.0764 | 0.689 |
| DASH | 9 | 0.3682 | 0.0836 | 0.631 |
| FSRS v4 | 17 | 0.3726 | 0.0838 | 0.685 |
| FSRS v3 | 13 | 0.4364 | 0.1097 | 0.660 |
| **HLR (Duolingo)** | 3 | 0.4694 | 0.1275 | 0.637 |
| **FSRS v1（≈SM-2 水平）** | 7 | 0.4913 | 0.1316 | 0.630 |

**在 SuperMemo 用户数据上的独立基准**（fsrs-vs-sm17）：**FSRS-6 log loss 0.368 < SM-17 的 0.432**。即使用 SuperMemo 自己的数据，FSRS 也赢了。

关键结论：
- FSRS-6 用 21 个参数，达到 2.7M 参数 RWKV 神经网络约 80% 的 Log Loss 水平
- FSRS-6 相对 HLR 的 Log Loss 降幅 ≈ 26%，相对 SM-2 类方法 ≈ 30%

---

## 3. SuperMemo 家族与其他算法

### 3.1 SM-17 / SM-18（SuperMemo 17-19 在用）

- **二元记忆模型**：变量只有 S, R；D（在 SuperMemo 里叫 C，complexity）是工程补丁
- **Stability Increase Function**：`SInc = f(C, S, R)`——和 FSRS 核心形式一致。实际上 FSRS 的主公式可以视为 SuperMemo 二元模型的参数化、可微、可 fit 版本
- **自适应矩阵**：SM-17 用多维 `SInc[C][S][R]` 矩阵存储经验值，按用户复习逐格更新。不做全局 MLE，而是"哪格有数据就修哪格"
- **SM-18 改进**：改进了 grade deviation / matrix deviation 的处理、startup stability
- **闭源原因**：SuperMemo 是商业公司，闭源是商业策略

**SuperMemo 官方对 FSRS 的态度**：Woźniak 承认 FSRS 在"把二元模型转成可微公式 + 用现代 ML 优化"方面做得不错，但认为 SM-17 的**自适应矩阵**在极端复习模式（比如严重 overdue）下比 FSRS 的参数化公式更稳健。但公开基准上 FSRS 确实更优。

### 3.2 Duolingo Half-Life Regression (HLR, Settles & Meeder 2016)

$$p = 2^{-\Delta / h}, \quad h = 2^{\theta \cdot \mathbf{x}}$$

- 特征 `x`：`√history_correct`, `√history_wrong`, bias, lexeme one-hot
- 训练：AdaGrad，损失 = `(p-p̂)² + α(h-ĥ)² + λ||θ||²`；~13M 数据点
- 特点：**不需要用户评分**（只看答对/答错）
- 局限：只有 `h` 一个状态量，没有难度维度；Log Loss 0.469，明显弱于 FSRS

### 3.3 其他

- **Mnemosyne**：SM-2 的轻度改良变体
- **Memrise**：闭源。据称使用类似 Leitner box + 自研启发式的 hybrid
- **Leitner 系统**：纸质抽屉方案，固定 5 个 box + 翻倍间隔，无个性化
- **Ebisu**：贝叶斯版 HLR，每张卡一个 Beta 分布跟踪回忆概率。优雅但基准表现逊于 FSRS

---

## 4. 工程落地：对 Obsidian 插件的建议

### 4.1 用户评分依赖的现实考量

| 算法 | 最少评分档位 | 简化可能性 |
|---|---|---|
| SM-2 | 6 档（0-5） | 可折叠到 2 档，但会损失精度 |
| FSRS | **4 档（Again/Hard/Good/Easy）** | **Again/Good 两档可行**（映射：`会→Good(3)`、`不会→Again(1)`），Anki 社区 validate 过 |
| HLR | 2 档（对/错） | 原生二档 |

**对简化用户体验的建议**：如果想做"会/不会"两键模式，FSRS 完全支持——srs-benchmark 里有 `--two_buttons` flag 的实验。

### 4.2 冷启动

FSRS 不需要训练才能跑：**官方给出了每个版本的 default parameters**。新用户第一天就能用 FSRS-6 默认 21 参数；等攒够 ~1000 次复习再触发 optimizer 做一次 fit。

建议的渐进路径：
1. **0-1000 次复习**：直接 FSRS 默认参数
2. **≥1000 次复习**：自动触发一次 FSRS optimizer 训练，生成用户个性化 `w[0..20]`
3. **每月 / 攒够 5000 条新复习**：重新 fit

**不建议**"先 SM-2、后切 FSRS"的路径——因为：
- SM-2 不产生 FSRS 需要的 R, S, D 状态
- 切换时历史复习记录仍可被 FSRS optimizer 直接消化（它只需要 `timestamp + grade + interval + outcome`）
- 默认 FSRS 参数本身就比 SM-2 好

### 4.3 跨设备同步数据量

每张卡需存：
- SM-2：`interval, ef, reps, lapses` — ~16 字节
- FSRS：`stability, difficulty, last_review, state, step` — ~32 字节

外加每次复习的 revlog（FSRS optimizer 需要完整历史）：`card_id, timestamp, grade, interval_before` ≈ 24 字节/条。一个重度用户（5 万次复习/年）revlog ≈ 1.2 MB/年 —— 对 Obsidian Sync 毫无压力。

### 4.4 开源实现与许可证

| 实现 | 语言 | 许可证 | 备注 |
|---|---|---|---|
| [fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki) | Python + JS | **MIT** | 参考实现 + Anki custom scheduler |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | TypeScript | **MIT** | **Obsidian 插件首选**，零依赖 |
| [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) | Rust | BSD-3 | Anki 桌面端现役，性能最佳 |
| [rs-fsrs](https://github.com/open-spaced-repetition/rs-fsrs) | Rust | MIT | 轻量纯调度版 |
| [fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) | Python | MIT | 参数训练工具 |

**Obsidian 插件直接使用 `ts-fsrs` 即可**——体积小、原生 TS、能在 Obsidian 沙箱中跑。后续希望在用户本地做参数优化：
- 方案 A：WASM 包装 fsrs-rs（性能好，打包体积 ~500KB）
- 方案 B：纯 TS 实现 optimizer（慢但够用，5000 条复习在浏览器里几秒钟）

### 4.5 最终建议

1. **默认算法：FSRS-6（通过 ts-fsrs）**。用户首次使用就用默认参数，立刻享受好于 SM-2 的调度质量。
2. **评分界面：4 档**（Again / Hard / Good / Easy），遵循 Anki 约定；另外提供"二键模式"选项（仅 Again / Good）给新手。
3. **Optimizer：延后集成**。先跑默认参数，观测用户量到一定规模后再做本地 TS optimizer 或可选的服务端 fit。
4. **SM-2 保留为"legacy 模式"**：给希望与旧 Anki deck 精确复现的用户一个选项，但不作为默认。
5. **数据结构设计**：**从 Day 1 就存完整 revlog**（`timestamp + grade + interval_before + outcome`），无论用哪个算法。这是后续切换到 FSRS optimizer 的前提。
6. **暴露 `desired_retention` 参数**（默认 0.9）：学霸可调到 0.95（更频繁复习），通勤党调到 0.85（更放松）。这是 Anki 没有很好暴露、但 FSRS 天然支持的产品亮点。
7. **长期关注 FSRS-7**：已在 srs-benchmark 出现（35 参数、支持 fractional interval），Anki 尚未正式 ship；值得在插件架构里**把算法参数化**（让算法成为可插拔模块）。

---

## Sources

- [fsrs4anki wiki - The Algorithm (全版本公式一手来源)](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)
- [srs-benchmark (10k 用户评测)](https://github.com/open-spaced-repetition/srs-benchmark)
- [fsrs-vs-sm17 (独立对比)](https://github.com/open-spaced-repetition/fsrs-vs-sm17)
- [A Technical Explanation of FSRS by Expertium](https://expertium.github.io/Algorithm.html)
- [Anki Manual - FSRS](https://docs.ankiweb.net/deck-options.html)
- [SuperMemo 2 原始算法](https://super-memory.com/english/ol/sm2.htm)
- [supermemo.guru - Two component model of long-term memory](https://supermemo.guru/wiki/Two_component_model_of_long-term_memory)
- [supermemo.guru - Algorithm SM-17](https://supermemo.guru/wiki/Algorithm_SM-17)
- [SuperMemopedia: SuperMemo Dethroned by FSRS](https://www.supermemopedia.com/wiki/SuperMemo_dethroned_by_FSRS)
- [Ye et al. KDD 2022 - A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling](https://dl.acm.org/doi/10.1145/3534678.3539081)
- [Settles & Meeder 2016 - A Trainable Spaced Repetition Model (HLR)](https://aclanthology.org/P16-1174/)
- [ts-fsrs (Obsidian 插件可直接集成)](https://github.com/open-spaced-repetition/ts-fsrs)
- [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs)
- [Anki 23.10 Release Notes](https://github.com/ankitects/anki/releases/tag/23.10)
