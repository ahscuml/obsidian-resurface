/**
 * Resurface 核心数据类型定义
 *
 * 与架构文档 §4 的 data.json schema 对齐。
 */

import type { State } from "ts-fsrs";

/** 笔记路径（相对 vault 根目录） */
export type NotePath = string;

/** ISO 8601 时间戳 */
export type ISOTimestamp = string;

/** 评分档位：1=Again, 2=Hard, 3=Good, 4=Easy */
export type Rating = 1 | 2 | 3 | 4;

/** data.json 顶层结构 */
export interface ResurfaceData {
  version: number;
  settings: Settings;
  notes: Record<NotePath, NoteState>;
  archive: Record<NotePath, NoteState>;
  revlog: ReviewLogEntry[];
  stats: Stats;
  fsrsParams: FSRSParameters | null;
}

/** 用户设置 */
export interface Settings {
  // 基础层
  dailyLimit: number;
  firstReviewDays: number;
  firstReviewJitter: number;
  ratingMode: "2-button" | "4-button";
  autoAdvance: boolean;

  /**
   * 白名单：允许进入复习池的目录（递归匹配子目录）。
   * 空数组 = 不启用白名单，所有笔记都允许。
   * 路径以 vault 根为起点，不以 / 开头，以 / 结尾（如 "Zettels/"）。
   */
  allowedPaths: string[];

  /**
   * 最小字符数：字符数低于此值的笔记不进入复习池。
   * 统计方式：文件总字符数（和 Obsidian 右下角"字符"一致，含 frontmatter）。
   * 设为 0 = 不过滤。
   */
  minCharacters: number;

  // 高级层
  desiredRetention: number;
  tldrFieldName: string;
  tldrFallbackLength: number;
  showStreak: boolean;

  editThresholdAbsolute: number;
  editThresholdRatio: number;
  editTriggerAction: "x0.3" | "x0.5" | "x0.7" | "reset" | "none";

  dayBoundaryHour: number;
}

/** 一条笔记的完整状态 */
export interface NoteState {
  // FSRS 核心
  stability: number;
  difficulty: number;
  lastReview: ISOTimestamp | null;
  nextReview: ISOTimestamp;
  state: State;
  reps: number;
  lapses: number;

  // 排除
  excluded: boolean;
  excludedAt: ISOTimestamp | null;

  // 编辑跟踪（M1 功能，MVP 先存字段）
  lastSnapshotLength: number;
  lastSnapshotHash: string;
  lastEditTriggerAt: ISOTimestamp | null;

  // 字符数（用于过滤短笔记）。-1 表示未统计过。
  characterCount: number;

  // 入池时间
  addedAt: ISOTimestamp;
}

/** 复习记录（完整保留） */
export interface ReviewLogEntry {
  path: NotePath;
  timestamp: ISOTimestamp;
  rating: Rating;
  elapsedDays: number;
  scheduledDays: number;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyAfter: number;
}

/** 统计指标 */
export interface Stats {
  totalReviews: number;
  streakDays: number;
  lastReviewDate: string; // YYYY-MM-DD，用于 streak 计算
  firstUseDate: ISOTimestamp;
}

/** 用户个性化 FSRS 参数（MVP 不用，M3 才做） */
export interface FSRSParameters {
  w: number[];
  lastOptimizedAt: ISOTimestamp;
  trainingSize: number;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: Settings = {
  dailyLimit: 15,
  firstReviewDays: 3,
  firstReviewJitter: 1,
  ratingMode: "2-button",
  autoAdvance: false,

  allowedPaths: [],
  minCharacters: 50,

  desiredRetention: 0.9,
  tldrFieldName: "tldr",
  tldrFallbackLength: 100,
  showStreak: true,

  editThresholdAbsolute: 50,
  editThresholdRatio: 0.2,
  editTriggerAction: "x0.5",

  dayBoundaryHour: 4,
};

/** 当前 data.json schema 版本 */
export const CURRENT_SCHEMA_VERSION = 1;

/** 首次加载时的默认 data */
export function createDefaultData(): ResurfaceData {
  return {
    version: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    notes: {},
    archive: {},
    revlog: [],
    stats: {
      totalReviews: 0,
      streakDays: 0,
      lastReviewDate: "",
      firstUseDate: new Date().toISOString(),
    },
    fsrsParams: null,
  };
}
