/**
 * VaultWatcher
 *
 * 监听 Obsidian Vault 的 create / modify / rename / delete 事件。
 * 仅处理 markdown 文件。
 *
 * MVP 职责：
 *   - create: 为新笔记初始化 NoteState
 *   - rename: 迁移 storage 中的 key
 *   - delete: 归档
 *   - modify: MVP 阶段仅更新 mtime（为 M1 的 EditTracker 做数据准备）
 */

import { TFile, type Plugin, type Vault } from "obsidian";
import type { FSRSService } from "../domain/FSRSService";
import type { StorageService } from "../domain/StorageService";

export class VaultWatcher {
  constructor(
    private plugin: Plugin,
    private storage: StorageService,
    private fsrs: FSRSService,
    private onListMayChange: () => void,
  ) {}

  register(): void {
    const vault = this.plugin.app.vault;

    this.plugin.registerEvent(
      vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.onCreate(file);
        }
      }),
    );

    this.plugin.registerEvent(
      vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          this.onRename(file, oldPath);
        }
      }),
    );

    this.plugin.registerEvent(
      vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.onDelete(file);
        }
      }),
    );

    // modify 事件：MVP 阶段只更新字符数，用于"短笔记过滤"
    // M1 阶段会在这里加入 EditTracker 的阈值触发
    this.plugin.registerEvent(
      vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          void this.updateCharacterCount(file);
        }
      }),
    );
  }

  /**
   * 扫描整个 vault，为所有尚未入池的 markdown 文件初始化状态。
   * 在插件首次启用时调用。
   * 同时更新已有笔记的 characterCount（如果还没算过）。
   */
  async backfillExistingNotes(): Promise<void> {
    const vault = this.plugin.app.vault;
    const files = vault.getMarkdownFiles();
    const now = new Date();
    let added = 0;
    let updated = 0;
    for (const file of files) {
      const existing = this.storage.data.notes[file.path];
      if (!existing) {
        const newNote = this.fsrs.createInitialNoteState(now);
        // 首次入池时也算一下字符数
        try {
          const content = await vault.cachedRead(file);
          newNote.characterCount = content.length;
        } catch {
          newNote.characterCount = 0;
        }
        this.storage.upsertNote(file.path, newNote);
        added++;
      } else if (existing.characterCount < 0) {
        // 已入池但还没算过字符数（老版本数据迁移）
        try {
          const content = await vault.cachedRead(file);
          existing.characterCount = content.length;
          updated++;
        } catch {
          existing.characterCount = 0;
        }
      }
    }
    if (added > 0 || updated > 0) {
      await this.storage.save();
      console.log(
        `[Resurface] backfilled ${added} new notes, updated ${updated} character counts`,
      );
    }
  }

  private async onCreate(file: TFile): Promise<void> {
    // 如果已存在（重启后扫描到同路径），跳过
    if (this.storage.data.notes[file.path]) return;
    const note = this.fsrs.createInitialNoteState(new Date());
    try {
      const content = await this.plugin.app.vault.cachedRead(file);
      note.characterCount = content.length;
    } catch {
      note.characterCount = 0;
    }
    this.storage.upsertNote(file.path, note);
    this.storage.scheduleSave();
    this.onListMayChange();
  }

  private onRename(file: TFile, oldPath: string): void {
    this.storage.onRename(oldPath, file.path);
    this.onListMayChange();
  }

  private onDelete(file: TFile): void {
    this.storage.onDelete(file.path);
    this.onListMayChange();
  }

  /** 更新字符数（将来由 modify 事件或手动调用） */
  async updateCharacterCount(file: TFile): Promise<void> {
    const note = this.storage.data.notes[file.path];
    if (!note) return;
    try {
      const content = await this.plugin.app.vault.cachedRead(file);
      note.characterCount = content.length;
      this.storage.scheduleSave();
    } catch {
      // 读失败保持原值
    }
  }
}
