/**
 * StorageService
 *
 * 封装 Obsidian Plugin 的 loadData / saveData API。
 * 提供类型安全的读写接口、默认值初始化、schema 迁移骨架。
 *
 * 依赖：
 *   - Obsidian 的 Plugin 实例（用于调用 loadData/saveData）
 *
 * 用法：
 *   const storage = new StorageService(plugin);
 *   await storage.load();
 *   storage.data.notes[path] = ...;
 *   await storage.save();
 */

import type { Plugin } from "obsidian";
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultData,
  type NotePath,
  type NoteState,
  type ResurfaceData,
  type ReviewLogEntry,
} from "./types";

export class StorageService {
  /** 对外暴露的 data 引用。load() 后可用 */
  data!: ResurfaceData;

  private saveQueued = false;
  private saveScheduleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private plugin: Plugin) {}

  /** 插件启动时调用 */
  async load(): Promise<void> {
    const raw = (await this.plugin.loadData()) as
      | Partial<ResurfaceData>
      | null;
    if (!raw) {
      this.data = createDefaultData();
      await this.save();
      return;
    }
    this.data = this.migrate(raw);
  }

  /** 立刻持久化到 data.json */
  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  /**
   * 延迟持久化（合并多次短时间内的写入）。
   * 用于 modify 事件等可能频繁触发的场景。
   */
  scheduleSave(delayMs = 500): void {
    if (this.saveScheduleTimer) {
      clearTimeout(this.saveScheduleTimer);
    }
    this.saveScheduleTimer = setTimeout(() => {
      this.saveScheduleTimer = null;
      void this.save();
    }, delayMs);
  }

  // ─── 笔记生命周期事件 ──────────────────────────

  /** 新笔记创建：初始化 NoteState（待调度，首次复习时间由 FSRSService 计算） */
  upsertNote(path: NotePath, state: NoteState): void {
    this.data.notes[path] = state;
  }

  /** 笔记重命名：迁移 key 及 revlog 引用 */
  onRename(oldPath: NotePath, newPath: NotePath): void {
    if (oldPath === newPath) return;
    const note = this.data.notes[oldPath];
    if (note) {
      this.data.notes[newPath] = note;
      delete this.data.notes[oldPath];
    }
    // 同步 revlog
    for (const entry of this.data.revlog) {
      if (entry.path === oldPath) entry.path = newPath;
    }
    this.scheduleSave();
  }

  /** 笔记删除：归档而非真正删除 */
  onDelete(path: NotePath): void {
    const note = this.data.notes[path];
    if (note) {
      this.data.archive[path] = note;
      delete this.data.notes[path];
      this.scheduleSave();
    }
  }

  /** 添加一条复习记录 */
  appendRevlog(entry: ReviewLogEntry): void {
    this.data.revlog.push(entry);
  }

  /** 标记笔记为不再复习 */
  excludeNote(path: NotePath): void {
    const note = this.data.notes[path];
    if (note) {
      note.excluded = true;
      note.excludedAt = new Date().toISOString();
    }
  }

  /** 取消排除 */
  unexcludeNote(path: NotePath): void {
    const note = this.data.notes[path];
    if (note) {
      note.excluded = false;
      note.excludedAt = null;
    }
  }

  /** 列出所有已排除的笔记（给高级设置"排除列表管理"用） */
  listExcluded(): Array<{ path: NotePath; note: NoteState }> {
    return Object.entries(this.data.notes)
      .filter(([, n]) => n.excluded)
      .map(([path, note]) => ({ path, note }));
  }

  // ─── Schema 迁移 ──────────────────────────

  private migrate(raw: Partial<ResurfaceData>): ResurfaceData {
    const version = raw.version ?? 0;
    let data: ResurfaceData = {
      ...createDefaultData(),
      ...raw,
      // 嵌套对象的默认合并
      settings: {
        ...createDefaultData().settings,
        ...(raw.settings ?? {}),
      },
      stats: {
        ...createDefaultData().stats,
        ...(raw.stats ?? {}),
      },
      notes: raw.notes ?? {},
      archive: raw.archive ?? {},
      revlog: raw.revlog ?? [],
      fsrsParams: raw.fsrsParams ?? null,
    };

    // 未来的迁移步骤：
    // if (version < 2) { ...migrate to v2... }

    data.version = CURRENT_SCHEMA_VERSION;

    // 清理 version 差异时的任何校正
    if (version !== CURRENT_SCHEMA_VERSION) {
      // 版本升级时可选：打印日志或 Notice
      console.log(
        `[Resurface] data.json 从 v${version} 升级到 v${CURRENT_SCHEMA_VERSION}`,
      );
    }

    return data;
  }
}
