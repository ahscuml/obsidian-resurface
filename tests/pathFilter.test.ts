import { describe, it, expect } from "vitest";
import { isPathAllowed, normalizePathRule } from "../src/domain/pathFilter";

describe("pathFilter", () => {
  describe("isPathAllowed", () => {
    it("空白名单 = 全部允许", () => {
      expect(isPathAllowed("anything.md", [])).toBe(true);
      expect(isPathAllowed("deep/path/foo.md", [])).toBe(true);
    });

    it("目录规则匹配直接子项", () => {
      const allowed = ["Zettels/"];
      expect(isPathAllowed("Zettels/foo.md", allowed)).toBe(true);
    });

    it("目录规则递归匹配子目录", () => {
      const allowed = ["Zettels/"];
      expect(isPathAllowed("Zettels/sub/foo.md", allowed)).toBe(true);
      expect(isPathAllowed("Zettels/a/b/c/deep.md", allowed)).toBe(true);
    });

    it("目录规则不匹配无关路径", () => {
      const allowed = ["Zettels/"];
      expect(isPathAllowed("Inbox/note.md", allowed)).toBe(false);
      expect(isPathAllowed("ZettelsOther/foo.md", allowed)).toBe(false); // 前缀字符串不算
    });

    it("多条规则：任一匹配即允许", () => {
      const allowed = ["Zettels/", "Projects/"];
      expect(isPathAllowed("Zettels/a.md", allowed)).toBe(true);
      expect(isPathAllowed("Projects/b.md", allowed)).toBe(true);
      expect(isPathAllowed("Other/c.md", allowed)).toBe(false);
    });

    it("不带尾部 / 的规则也能工作（兼容手写）", () => {
      const allowed = ["Zettels"];
      expect(isPathAllowed("Zettels/foo.md", allowed)).toBe(true);
      expect(isPathAllowed("ZettelsOther/foo.md", allowed)).toBe(false);
    });
  });

  describe("normalizePathRule", () => {
    it("添加末尾 /", () => {
      expect(normalizePathRule("Zettels")).toBe("Zettels/");
    });

    it("去掉开头 /", () => {
      expect(normalizePathRule("/Zettels/")).toBe("Zettels/");
    });

    it("多余 / 被清理", () => {
      expect(normalizePathRule("//Zettels//")).toBe("Zettels/");
    });

    it("空字符串保持为空", () => {
      expect(normalizePathRule("")).toBe("");
      expect(normalizePathRule("   ")).toBe("");
      expect(normalizePathRule("/")).toBe("");
    });

    it("去掉前后空格", () => {
      expect(normalizePathRule("  Zettels/  ")).toBe("Zettels/");
    });
  });
});
