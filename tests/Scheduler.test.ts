/**
 * Scheduler 单元测试
 *
 * 不依赖 Obsidian，手工构造 StorageService / FSRSService 的最小替身。
 */

import { describe, it, expect } from "vitest";
import { Scheduler } from "../src/domain/Scheduler";
import type { FSRSService } from "../src/domain/FSRSService";
import type { StorageService } from "../src/domain/StorageService";
import { DEFAULT_SETTINGS, type NoteState } from "../src/domain/types";
import { State } from "ts-fsrs";

function makeNote(partial: Partial<NoteState> = {}): NoteState {
  return {
    stability: 5,
    difficulty: 3,
    lastReview: "2026-04-18T10:00:00Z",
    nextReview: "2026-04-21T00:00:00Z", // 已到期
    state: State.Review,
    reps: 1,
    lapses: 0,
    excluded: false,
    excludedAt: null,
    lastSnapshotLength: 100,
    lastSnapshotHash: "abc",
    lastEditTriggerAt: null,
    characterCount: 500,
    addedAt: "2026-04-15T00:00:00Z",
    ...partial,
  };
}

function makeEnv(
  notes: Record<string, NoteState>,
  rOverrides: Record<string, number> = {},
) {
  const storage = {
    data: {
      settings: { ...DEFAULT_SETTINGS },
      notes,
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

  const fsrs = {
    retrievability: (note: NoteState) => {
      // 按 stability 返回一个可控的 R 值（测试预期用）
      const path = Object.entries(notes).find(([, n]) => n === note)?.[0];
      if (path && path in rOverrides) return rOverrides[path];
      return note.stability / 10;
    },
  } as unknown as FSRSService;

  return { storage, fsrs, scheduler: new Scheduler(storage, fsrs) };
}

describe("Scheduler", () => {
  const now = new Date("2026-04-21T15:00:00Z");

  it("排除的笔记不出现", () => {
    const { scheduler } = makeEnv({
      a: makeNote(),
      b: makeNote({ excluded: true }),
    });
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path)).toEqual(["a"]);
  });

  it("按 R 值升序排序（越急越靠前）", () => {
    const { scheduler } = makeEnv(
      {
        a: makeNote(),
        b: makeNote(),
        c: makeNote(),
      },
      { a: 0.9, b: 0.3, c: 0.6 },
    );
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path)).toEqual(["b", "c", "a"]);
  });

  it("今日已复习（lastReview 在 dayStart 之后）不再出现", () => {
    const { scheduler } = makeEnv({
      a: makeNote({ lastReview: "2026-04-21T10:00:00Z" }), // 今日
      b: makeNote({ lastReview: "2026-04-20T10:00:00Z" }), // 昨日
    });
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path)).toEqual(["b"]);
  });

  it("nextReview 未到不出现", () => {
    const { scheduler } = makeEnv({
      a: makeNote({ nextReview: "2026-04-25T00:00:00Z" }), // 未来
      b: makeNote(),
    });
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path)).toEqual(["b"]);
  });

  it("被 session 标记为已复习的笔记跳过", () => {
    const { scheduler } = makeEnv({
      a: makeNote(),
      b: makeNote(),
    });
    const queue = scheduler.getTodayQueue(new Set(["a"]), now);
    expect(queue.map((q) => q.path)).toEqual(["b"]);
  });

  it("截断到 dailyLimit 条", () => {
    const notes: Record<string, NoteState> = {};
    for (let i = 0; i < 30; i++) notes[`n${i}`] = makeNote();
    const { scheduler, storage } = makeEnv(notes);
    storage.data.settings.dailyLimit = 5;
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.length).toBe(5);
  });

  it("countDueToday 不超过 dailyLimit", () => {
    const notes: Record<string, NoteState> = {};
    for (let i = 0; i < 30; i++) notes[`n${i}`] = makeNote();
    const { scheduler, storage } = makeEnv(notes);
    storage.data.settings.dailyLimit = 10;
    const count = scheduler.countDueToday(new Set(), now);
    expect(count).toBe(10);
  });

  it("白名单过滤：只保留匹配目录的笔记", () => {
    const { scheduler, storage } = makeEnv({
      "Zettels/a.md": makeNote(),
      "Zettels/sub/b.md": makeNote(),
      "Inbox/c.md": makeNote(),
      "Projects/d.md": makeNote(),
    });
    storage.data.settings.allowedPaths = ["Zettels/"];
    const queue = scheduler.getTodayQueue(new Set(), now);
    const paths = queue.map((q) => q.path).sort();
    expect(paths).toEqual(["Zettels/a.md", "Zettels/sub/b.md"]);
  });

  it("白名单多目录：任一匹配即可", () => {
    const { scheduler, storage } = makeEnv({
      "Zettels/a.md": makeNote(),
      "Projects/b.md": makeNote(),
      "Inbox/c.md": makeNote(),
    });
    storage.data.settings.allowedPaths = ["Zettels/", "Projects/"];
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path).sort()).toEqual([
      "Projects/b.md",
      "Zettels/a.md",
    ]);
  });

  it("白名单空数组 = 不过滤", () => {
    const { scheduler, storage } = makeEnv({
      a: makeNote(),
      b: makeNote(),
    });
    storage.data.settings.allowedPaths = [];
    expect(scheduler.getTodayQueue(new Set(), now).length).toBe(2);
  });

  it("字符数低于 minCharacters 的笔记被过滤掉", () => {
    const { scheduler, storage } = makeEnv({
      short: makeNote({ characterCount: 30 }),
      long: makeNote({ characterCount: 200 }),
    });
    storage.data.settings.minCharacters = 50;
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.map((q) => q.path)).toEqual(["long"]);
  });

  it("characterCount = -1（未统计）暂不过滤", () => {
    const { scheduler, storage } = makeEnv({
      unknown: makeNote({ characterCount: -1 }),
    });
    storage.data.settings.minCharacters = 50;
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.length).toBe(1);
  });

  it("minCharacters = 0 不过滤", () => {
    const { scheduler, storage } = makeEnv({
      tiny: makeNote({ characterCount: 0 }),
    });
    storage.data.settings.minCharacters = 0;
    const queue = scheduler.getTodayQueue(new Set(), now);
    expect(queue.length).toBe(1);
  });
});
