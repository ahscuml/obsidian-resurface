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
   * 截断：settings.dailyLimit 条。
   */
  getTodayQueue(alreadyReviewedPaths: Set<NotePath>, now: Date = new Date()): QueuedNote[] {
    const settings = this.storage.data.settings;
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

    return candidates.slice(0, settings.dailyLimit);
  }

  /** 今日总共有多少条到期（忽略上限），用于展示数字 */
  countDueToday(
    alreadyReviewedPaths: Set<NotePath>,
    now: Date = new Date(),
  ): number {
    const settings = this.storage.data.settings;
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
    // 截断到 dailyLimit（展示层只关心今天会出现多少）
    return Math.min(count, settings.dailyLimit);
  }

  /** 字符数低于阈值的笔记算作"短笔记"，不进入复习池。
   *  characterCount = -1 表示未统计过，暂时不过滤（避免新装用户漏笔记）。 */
  private tooShort(note: NoteState, minChars: number): boolean {
    if (minChars <= 0) return false;
    if (note.characterCount < 0) return false;
    return note.characterCount < minChars;
  }
}
