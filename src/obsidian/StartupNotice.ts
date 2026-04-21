/**
 * StartupNotice
 *
 * 插件启动时根据待复习数量弹出顶部 Notice。
 */

import { Notice } from "obsidian";

export function showStartupNotice(dueCount: number): void {
  if (dueCount <= 0) return;
  new Notice(`🌱 今天有 ${dueCount} 条笔记想重新见你`, 5000);
}
