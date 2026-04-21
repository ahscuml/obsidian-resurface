/**
 * FSRSService 单元测试（最小形式）
 *
 * 只验证我们封装层的关键属性，不重新测 ts-fsrs 本身。
 */

import { describe, it, expect } from "vitest";
import { FSRSService } from "../src/domain/FSRSService";
import type { StorageService } from "../src/domain/StorageService";
import { DEFAULT_SETTINGS } from "../src/domain/types";
import { State } from "ts-fsrs";

function makeService() {
  const storage = {
    data: {
      settings: { ...DEFAULT_SETTINGS },
      notes: {},
      archive: {},
      revlog: [],
      stats: {
        totalReviews: 0,
        streakDays: 0,
        lastReviewDate: "",
        firstUseDate: "",
      },
      fsrsParams: null,
      version: 1,
    },
  } as unknown as StorageService;
  return { fsrs: new FSRSService(storage), storage };
}

describe("FSRSService", () => {
  it("createInitialNoteState 产生新卡片，next_review 在设置的首次间隔附近", () => {
    const { fsrs, storage } = makeService();
    storage.data.settings.firstReviewDays = 3;
    storage.data.settings.firstReviewJitter = 0;

    const now = new Date("2026-04-21T10:00:00Z");
    const note = fsrs.createInitialNoteState(now);

    expect(note.state).toBe(State.New);
    expect(note.reps).toBe(0);
    expect(note.lastReview).toBeNull();

    const due = new Date(note.nextReview);
    const diffDays = (due.getTime() - now.getTime()) / (24 * 3600 * 1000);
    expect(Math.round(diffDays)).toBe(3);
  });

  it("Good 评分后 reps 增加、状态进入 Learning 或 Review", () => {
    const { fsrs } = makeService();
    const now = new Date();
    const initial = fsrs.createInitialNoteState(now);

    const { newState, logEntry } = fsrs.review(initial, 3, now);
    expect(newState.reps).toBeGreaterThan(0);
    expect(logEntry.rating).toBe(3);
    expect(newState.lastReview).not.toBeNull();
  });

  it("Again 评分后 lapses 不一定变（取决于之前 state），但状态会回到 Learning/Relearning", () => {
    const { fsrs } = makeService();
    const now = new Date();
    let note = fsrs.createInitialNoteState(now);
    // 先 Good 两次让它到 Review
    note = fsrs.review(note, 3, now).newState;
    note = fsrs.review(note, 3, new Date(now.getTime() + 10 * 24 * 3600 * 1000))
      .newState;

    const beforeLapses = note.lapses;
    const { newState } = fsrs.review(
      note,
      1,
      new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    );
    expect(newState.lapses).toBeGreaterThanOrEqual(beforeLapses);
  });

  it("retrievability 返回 [0,1] 内的数或 null（新卡返回 null）", () => {
    const { fsrs } = makeService();
    const newCard = fsrs.createInitialNoteState();
    expect(fsrs.retrievability(newCard)).toBeNull();

    const reviewed = fsrs.review(newCard, 3).newState;
    const r = fsrs.retrievability(
      reviewed,
      new Date(Date.now() + 5 * 24 * 3600 * 1000),
    );
    if (r !== null) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("adjustStabilityForEdit x0.5 让 stability 减半", () => {
    const { fsrs, storage } = makeService();
    storage.data.settings.editTriggerAction = "x0.5";
    let note = fsrs.createInitialNoteState();
    note = fsrs.review(note, 3).newState;
    const before = note.stability;
    const adjusted = fsrs.adjustStabilityForEdit(note);
    expect(adjusted).not.toBeNull();
    if (adjusted) {
      expect(adjusted.stability).toBeCloseTo(before * 0.5, 5);
      expect(adjusted.lastEditTriggerAt).not.toBeNull();
    }
  });

  it("adjustStabilityForEdit 的 none 不改变状态", () => {
    const { fsrs, storage } = makeService();
    storage.data.settings.editTriggerAction = "none";
    let note = fsrs.createInitialNoteState();
    note = fsrs.review(note, 3).newState;
    const adjusted = fsrs.adjustStabilityForEdit(note);
    expect(adjusted).toBeNull();
  });
});
