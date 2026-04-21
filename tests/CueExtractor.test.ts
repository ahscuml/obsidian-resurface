import { describe, it, expect } from "vitest";
import { CueExtractor } from "../src/domain/CueExtractor";
import { DEFAULT_SETTINGS } from "../src/domain/types";

const s = DEFAULT_SETTINGS;

describe("CueExtractor", () => {
  it("frontmatter tldr 字段优先级最高", () => {
    const content = `---
tldr: 这是摘要
---

# 笔记标题

正文内容很多很多。
`;
    const { title, tldr } = CueExtractor.extract("note.md", content, s);
    expect(title).toBe("笔记标题");
    expect(tldr).toBe("这是摘要");
  });

  it("回退到 > [!tldr] callout", () => {
    const content = `# 标题

> [!tldr]
> 这是 callout 的摘要内容

正文
`;
    const { tldr } = CueExtractor.extract("x.md", content, s);
    expect(tldr).toContain("callout 的摘要内容");
  });

  it("回退到 ## TLDR 区块", () => {
    const content = `# 标题

## TLDR

一句话摘要在这里

## 其他章节

...`;
    const { tldr } = CueExtractor.extract("x.md", content, s);
    expect(tldr).toBe("一句话摘要在这里");
  });

  it("回退到第一段", () => {
    const content = `# 标题

这是第一段内容。

第二段。`;
    const { tldr } = CueExtractor.extract("x.md", content, s);
    expect(tldr).toBe("这是第一段内容。");
  });

  it("回退到开头 N 字（无段落的极端情况）", () => {
    // 构造：只有 heading 没有任何段落 —— 会走到 fromHeadingN
    const content = `# 标题
## 子标题
### 子子标题`;
    const { tldr } = CueExtractor.extract(
      "x.md",
      content,
      { ...s, tldrFallbackLength: 200 },
    );
    // 所有 heading 被移除后，应该是空字符串 → 占位
    expect(tldr).toBe("(空笔记)");
  });

  it("第一段被用作 TLDR", () => {
    const content = `# 标题

第一段`;
    const { tldr } = CueExtractor.extract("x.md", content, s);
    expect(tldr).toBe("第一段");
  });

  it("空笔记返回占位", () => {
    const { tldr } = CueExtractor.extract("x.md", "", s);
    expect(tldr).toBe("(空笔记)");
  });

  it("标题来自 H1 而非文件名（如果有）", () => {
    const content = `# H1 标题

内容`;
    const { title } = CueExtractor.extract(
      "path/to/file.md",
      content,
      s,
    );
    expect(title).toBe("H1 标题");
  });

  it("无 H1 时 title 用文件名", () => {
    const content = `没有 H1 标题的笔记`;
    const { title } = CueExtractor.extract(
      "path/to/some-note.md",
      content,
      s,
    );
    expect(title).toBe("some-note");
  });
});
