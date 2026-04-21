/**
 * CueExtractor
 *
 * 从笔记原文里提取复习时展示的 cue：{ title, tldr }。
 *
 * TLDR 的 fallback 链（按优先级）：
 *   1. frontmatter 的 tldrFieldName 字段（默认 "tldr"）
 *   2. > [!tldr] callout 的内容
 *   3. ## TLDR / ## 摘要 区块下的第一段
 *   4. 笔记中第一个非空自然段
 *   5. 笔记去掉 frontmatter 后的前 N 字（默认 200）
 *
 * 纯函数：输入文件路径 + 原始内容 + 设置；输出 { title, tldr }。
 */

import type { Settings, NotePath } from "./types";

export interface Cue {
  title: string;
  tldr: string;
}

export class CueExtractor {
  static extract(
    path: NotePath,
    rawContent: string,
    settings: Settings,
  ): Cue {
    const { frontmatter, body } = splitFrontmatter(rawContent);
    const title = extractTitle(path, body);
    const tldr =
      fromFrontmatter(frontmatter, settings.tldrFieldName) ??
      fromTldrCallout(body) ??
      fromTldrHeading(body) ??
      fromFirstParagraph(body) ??
      fromHeadingN(body, settings.tldrFallbackLength) ??
      "(空笔记)";
    return { title, tldr };
  }
}

// ─── 辅助 ──────────────────────────

function splitFrontmatter(content: string): {
  frontmatter: Record<string, string> | null;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: null, body: content };
  const fmText = match[1];
  const body = content.slice(match[0].length);
  const fm = parseSimpleYaml(fmText);
  return { frontmatter: fm, body };
}

/** 最简 YAML 解析：只支持 key: value 的单行形式，够提 tldr 字段用 */
function parseSimpleYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function extractTitle(path: NotePath, body: string): string {
  // 优先第一行的 # 开头
  const firstH1 = body.match(/^\s*#\s+(.+)$/m);
  if (firstH1) return firstH1[1].trim();
  // 否则用文件名去掉 .md 和路径
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "");
}

function fromFrontmatter(
  fm: Record<string, string> | null,
  fieldName: string,
): string | null {
  if (!fm) return null;
  const v = fm[fieldName];
  if (!v || !v.trim()) return null;
  return v.trim();
}

function fromTldrCallout(body: string): string | null {
  // 匹配 > [!tldr] ... 的 callout
  // 支持多行（连续 > 开头的行）
  const match = body.match(
    /^>\s*\[!(?:tldr|summary|abstract)\][^\n]*\n((?:>\s?.*\n?)+)/im,
  );
  if (!match) return null;
  const text = match[1]
    .split("\n")
    .map((l) => l.replace(/^>\s?/, ""))
    .filter((l) => l.trim())
    .join(" ")
    .trim();
  return text || null;
}

function fromTldrHeading(body: string): string | null {
  // ## TLDR / ## 摘要 下的第一段
  const match = body.match(
    /^##\s+(?:TL;?DR|TLDR|摘要|概要)\s*\n+([^\n]+(?:\n[^#\n]+)*)/im,
  );
  if (!match) return null;
  const text = match[1].trim();
  return text || null;
}

function fromFirstParagraph(body: string): string | null {
  // 跳过空行和 heading，取第一个非 heading 段落
  const lines = body.split("\n");
  const paragraphLines: string[] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (!started) {
      if (!t) continue;
      if (t.startsWith("#")) continue;
      if (t.startsWith(">")) continue; // 跳过 callout
      started = true;
      paragraphLines.push(t);
    } else {
      if (!t) break;
      if (t.startsWith("#")) break;
      paragraphLines.push(t);
    }
  }
  if (!paragraphLines.length) return null;
  return paragraphLines.join(" ");
}

function fromHeadingN(body: string, n: number): string | null {
  const text = body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > n ? text.slice(0, n) + "…" : text;
}
