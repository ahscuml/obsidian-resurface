/**
 * Scheduler
 *
 * 计算"今日待复习列表"。
 * 策略：实时计算，按当前 R 值升序（最快忘的在前），取前 dailyLimit 条。
 *
 * 纯逻辑，不依赖 Obsidian API（便于测试）。
 */

import type { FSRSService } from "./FSRSService";
import type { StorageService } from "./StorageService";
import type { NotePath, NoteState } from "./types";
import { getDayStart } from "../utils/date";
import { isPathAllowed } from "./pathFilter";

export interface QueuedNote {
  path: NotePath;
  note: NoteState;
  retrievability: number; // 若无 lastReview 则用 0.5 作为占位（置于中间优先级）
}

export class Scheduler {
  constructor(
    private storage: StorageService,
    private fsrs: FSRSService,
  ) {}

  /**
   * 取今日待复习列表（未复习的部分）。
   * 过滤：路径白名单、非排除、nextReview <= now、今日未复习。
   * 排序：R 值升序。
   * 预算：dailyLimit 是**每日硬上限**。已经出现在 reviewedSet 里的（打过分的 / exclude 的）算已消耗预算。
   *
   * 举例：dailyLimit=15，已复习 10 条，候选池还有 20 条 → 返回 5 条（预算只剩 5）。
   */
  getTodayQueue(alreadyReviewedPaths: Set<NotePath>, now: Date = new Date()): QueuedNote[] {
    const settings = this.storage.data.settings;
    const budget = Math.max(0, settings.dailyLimit - alreadyReviewedPaths.size);
    if (budget === 0) return [];

    const dayStart = getDayStart(now, settings.dayBoundaryHour);

    const candidates: QueuedNote[] = [];
    for (const [path, note] of Object.entries(this.storage.data.notes)) {
      if (!isPathAllowed(path, settings.allowedPaths)) continue;
      if (note.excluded) continue;
      if (this.tooShort(note, settings.minCharacters)) continue;
      if (alreadyReviewedPaths.has(path)) continue;
      if (new Date(note.nextReview) > now) continue;

      // 今日已复习过的笔记（lastReview 在今日边界之后）跳过
      if (note.lastReview && new Date(note.lastReview) >= dayStart) continue;

      const r = this.fsrs.retrievability(note, now);
      candidates.push({
        path,
        note,
        retrievability: r ?? 0.5,
      });
    }

    // R 升序（越小越急）
    candidates.sort((a, b) => a.retrievability - b.retrievability);

    return candidates.slice(0, budget);
  }

  /**
   * 今日还将出现多少条（受 dailyLimit 剩余预算限制）。
   * 用于 ribbon 角标与侧栏进度条的分母计算，保证和 getTodayQueue 的发放节奏一致。
   */
  countDueToday(
    alreadyReviewedPaths: Set<NotePath>,
    now: Date = new Date(),
  ): number {
    const settings = this.storage.data.settings;
    const budget = Math.max(0, settings.dailyLimit - alreadyReviewedPaths.size);
    if (budget === 0) return 0;

    const dayStart = getDayStart(now, settings.dayBoundaryHour);
    let count = 0;
    for (const [path, note] of Object.entries(this.storage.data.notes)) {
      if (!isPathAllowed(path, settings.allowedPaths)) continue;
      if (note.excluded) continue;
      if (this.tooShort(note, settings.minCharacters)) continue;
      if (alreadyReviewedPaths.has(path)) continue;
      if (new Date(note.nextReview) > now) continue;
      if (note.lastReview && new Date(note.lastReview) >= dayStart) continue;
      count++;
    }
    return Math.min(count, budget);
  }

  /** 字符数低于阈值的笔记算作"短笔记"，不进入复习池。
   *  characterCount = -1 表示未统计过，暂时不过滤（避免新装用户漏笔记）。 */
  private tooShort(note: NoteState, minChars: number): boolean {
    if (minChars <= 0) return false;
    if (note.characterCount < 0) return false;
    return note.characterCount < minChars;
  }
}
