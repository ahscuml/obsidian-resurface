/**
 * 路径过滤：根据 allowedPaths（白名单）判断一条笔记是否应该进入复习池。
 *
 * 语义：
 *   - allowedPaths 空数组 → 不过滤，所有笔记都允许
 *   - 非空 → 笔记路径必须匹配至少一条规则
 *
 * 规则形式：目录路径（递归），例如 "Zettels/"
 *   - 以 / 结尾，表示目录及其所有子目录
 *   - 不以 / 开头（vault 相对路径）
 *
 * 边界：
 *   - 规则去掉末尾 / 后再比较前缀，兼容用户手写不带 /
 *   - 例外：允许"根目录"用 "" 表达（为 UI 保留，但一般不用）
 */

export function isPathAllowed(
  notePath: string,
  allowedPaths: string[],
): boolean {
  if (!allowedPaths || allowedPaths.length === 0) return true;
  for (const raw of allowedPaths) {
    if (matchesPath(notePath, raw)) return true;
  }
  return false;
}

function matchesPath(notePath: string, rule: string): boolean {
  const prefix = rule.replace(/\/+$/, "");
  if (prefix === "") return true; // 根目录 = 全部
  return notePath === prefix || notePath.startsWith(prefix + "/");
}

/** 规范化用户输入的目录（去首尾 /、末尾统一 /） */
export function normalizePathRule(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed + "/";
}
