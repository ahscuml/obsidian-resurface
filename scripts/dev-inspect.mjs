/**
 * 开发辅助：查看复习状态
 * 打印每条笔记的 FSRS 状态（S/D/next_review）
 *
 * 用法：node scripts/dev-inspect.mjs [筛选 keyword]
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const VAULT_PATH =
  "/Users/liyixin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault";
const DATA_FILE = join(
  VAULT_PATH,
  ".obsidian",
  "plugins",
  "obsidian-resurface",
  "data.json",
);

const keyword = process.argv[2] ?? "";

const raw = await readFile(DATA_FILE, "utf-8");
const data = JSON.parse(raw);

const STATE_NAMES = { 0: "New", 1: "Learning", 2: "Review", 3: "Relearning" };

// 总览
const now = new Date();
let total = 0;
let excluded = 0;
let reviewed = 0;
let due = 0;
for (const [path, n] of Object.entries(data.notes)) {
  total++;
  if (n.excluded) excluded++;
  if (n.reps > 0) reviewed++;
  if (!n.excluded && new Date(n.nextReview) <= now) due++;
}

console.log(`\n📊 复活池概览`);
console.log(`  总计:       ${total}`);
console.log(`  已排除:     ${excluded}`);
console.log(`  有过复习:   ${reviewed}`);
console.log(`  当前到期:   ${due}`);
console.log(`  累计复习:   ${data.stats.totalReviews} 次`);
console.log(`  连续天数:   ${data.stats.streakDays}`);

// 笔记列表
console.log(`\n📝 笔记状态${keyword ? `（筛选 "${keyword}"）` : "（仅显示已复习过的）"}\n`);

const filtered = Object.entries(data.notes)
  .filter(([path, n]) => {
    if (keyword) return path.includes(keyword);
    return n.reps > 0 || !n.excluded && new Date(n.nextReview) <= now;
  })
  .sort(([, a], [, b]) => new Date(a.nextReview) - new Date(b.nextReview));

if (filtered.length === 0) {
  console.log("  （无匹配）");
} else {
  const PAD = 45;
  console.log(
    "  " +
      "path".padEnd(PAD) +
      "  state     reps  S       next_review         excl",
  );
  console.log("  " + "─".repeat(PAD + 45));
  for (const [path, n] of filtered) {
    const shortPath = path.length > PAD - 1
      ? "…" + path.slice(-(PAD - 2))
      : path.padEnd(PAD);
    const next = new Date(n.nextReview);
    const nextStr = next.toISOString().replace("T", " ").slice(0, 16);
    const daysFromNow = Math.round(
      (next - now) / (24 * 3600 * 1000),
    );
    const nextLabel =
      daysFromNow <= 0 ? `${nextStr} ⚡已到期` : `${nextStr} (+${daysFromNow}d)`;
    console.log(
      "  " +
        shortPath.padEnd(PAD) +
        "  " +
        (STATE_NAMES[n.state] ?? n.state).padEnd(9) +
        " " +
        String(n.reps).padEnd(5) +
        " " +
        n.stability.toFixed(2).padEnd(7) +
        " " +
        nextLabel +
        " " +
        (n.excluded ? "✗" : ""),
    );
  }
}

console.log("");
