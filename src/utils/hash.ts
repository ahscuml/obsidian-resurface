/**
 * SHA-256 哈希（取前 16 字符）
 *
 * 用于笔记内容指纹（M1 的 EditTracker）。
 * MVP 阶段也用来初始化 lastSnapshotHash，避免空字符串。
 */

export async function hashContent(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
