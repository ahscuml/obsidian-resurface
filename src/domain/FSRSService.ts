/**
 * FSRSService
 *
 * 封装 ts-fsrs，对外暴露领域层友好的 API。
 *
 * 职责：
 *   - 基于当前 settings 初始化 FSRS 实例
 *   - 笔记首次入池：生成 initial NoteState
 *   - 评分一次：计算新 NoteState + 追加 revlog
 *   - 计算当前 R 值
 *   - M1: 编辑触发时调整 Stability
 */

import {
  FSRS,
  generatorParameters,
  createEmptyCard,
  Rating as TsFsrsRating,
  State,
  type Card,
} from "ts-fsrs";
import type { StorageService } from "./StorageService";
import type { NoteState, Rating, ReviewLogEntry } from "./types";
import { addDaysWithJitter } from "../utils/date";

export class FSRSService {
  private fsrs!: FSRS;

  constructor(private storage: StorageService) {
    this.rebuildInstance();
  }

  /** 设置变更后重建 FSRS 实例（因为 requestRetention 影响调度） */
  rebuildInstance(): void {
    const settings = this.storage.data.settings;
    const w = this.storage.data.fsrsParams?.w;
    this.fsrs = new FSRS(
      generatorParameters({
        ...(w ? { w } : {}),
        request_retention: settings.desiredRetention,
        enable_fuzz: true,
      }),
    );
  }

  /** 新笔记入池：生成初始 NoteState */
  createInitialNoteState(now: Date = new Date()): NoteState {
    const settings = this.storage.data.settings;
    const nextReview = addDaysWithJitter(
      now,
      settings.firstReviewDays,
      settings.firstReviewJitter,
    );
    return {
      stability: 0,
      difficulty: 0,
      lastReview: null,
      nextReview: nextReview.toISOString(),
      state: State.New,
      reps: 0,
      lapses: 0,
      excluded: false,
      excludedAt: null,
      lastSnapshotLength: 0,
      lastSnapshotHash: "",
      lastEditTriggerAt: null,
      characterCount: -1,
      addedAt: now.toISOString(),
    };
  }

  /**
   * 对一条笔记评分。
   * 返回新 NoteState 和应追加的 ReviewLogEntry。
   * （不会直接写 storage —— 调用方负责把新状态写回）
   */
  review(
    note: NoteState,
    rating: Rating,
    now: Date = new Date(),
  ): { newState: NoteState; logEntry: Omit<ReviewLogEntry, "path"> } {
    const card = this.toCard(note);
    const scheduling = this.fsrs.repeat(card, now);
    const result = scheduling[rating];

    const newCard = result.card as Card;
    const stabilityBefore = note.stability;

    const newState: NoteState = {
      ...note,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      lastReview: now.toISOString(),
      nextReview: (newCard.due instanceof Date
        ? newCard.due
        : new Date(newCard.due)
      ).toISOString(),
      state: newCard.state,
      reps: newCard.reps,
      lapses: newCard.lapses,
    };

    const logEntry: Omit<ReviewLogEntry, "path"> = {
      timestamp: now.toISOString(),
      rating,
      elapsedDays: newCard.elapsed_days,
      scheduledDays: newCard.scheduled_days,
      stabilityBefore,
      stabilityAfter: newCard.stability,
      difficultyAfter: newCard.difficulty,
    };

    return { newState, logEntry };
  }

  /** 当前 R 值（回忆成功概率），笔记未曾复习过时返回 null */
  retrievability(note: NoteState, now: Date = new Date()): number | null {
    if (!note.lastReview || note.state === State.New) {
      return null;
    }
    const card = this.toCard(note);
    const r = this.fsrs.get_retrievability(card, now, false);
    return typeof r === "number" ? r : null;
  }

  /**
   * 编辑影响调度（M1 才用，MVP 未启用）。
   * 把 stability 乘以 factor，由 FSRS 算出新 nextReview。
   */
  adjustStabilityForEdit(
    note: NoteState,
    now: Date = new Date(),
  ): NoteState | null {
    const action = this.storage.data.settings.editTriggerAction;
    if (action === "none") return null;

    if (action === "reset") {
      return this.createInitialNoteState(now);
    }

    const factorMap = { "x0.3": 0.3, "x0.5": 0.5, "x0.7": 0.7 } as const;
    const factor = factorMap[action];
    if (!factor || note.stability <= 0) return null;

    const newStability = note.stability * factor;
    // 用数学近似推算下次复习时间（不访问 ts-fsrs 的私有 API）
    const days = this.estimateInterval(newStability);
    const due = new Date(now.getTime() + days * 24 * 3600 * 1000);

    return {
      ...note,
      stability: newStability,
      nextReview: due.toISOString(),
      lastEditTriggerAt: now.toISOString(),
    };
  }

  /** 粗略估计当前 stability 对应的下次复习间隔（天） */
  private estimateInterval(stability: number): number {
    // FSRS: 当 t = S 时 R = 0.9；对任意 R_target，间隔 ≈ S × f(R_target, S)
    // 对 desiredRetention = 0.9，间隔 ≈ stability
    // 这是可接受的近似（精确值需要访问 FSRS 参数的 decay 指数）
    const r = this.storage.data.settings.desiredRetention;
    if (r >= 0.9) return stability;
    // 较低 requestRetention → 较长间隔；简单线性外推
    return stability * (0.9 / r);
  }

  // ─── 转换工具 ──────────────────────────

  private toCard(note: NoteState): Card {
    if (!note.lastReview) {
      const empty = createEmptyCard();
      return { ...empty, due: new Date(note.nextReview) };
    }
    return {
      due: new Date(note.nextReview),
      stability: note.stability,
      difficulty: note.difficulty,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: note.reps,
      lapses: note.lapses,
      state: note.state,
      last_review: new Date(note.lastReview),
    };
  }
}

/** Rating 转换（我们的 1-4 和 ts-fsrs 的枚举一致） */
export function toTsFsrsRating(r: Rating): TsFsrsRating {
  return r as unknown as TsFsrsRating;
}
