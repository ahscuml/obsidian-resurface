/**
 * FolderSuggestModal
 *
 * 基于 Obsidian 的 FuzzySuggestModal，让用户从 vault 的所有目录中模糊搜索选择一个。
 * 用于设置页添加"复习目录"。
 */

import { FuzzySuggestModal, TFolder, type App } from "obsidian";

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  constructor(
    app: App,
    private onChoose: (folder: TFolder) => void,
    private excludePaths: string[] = [],
  ) {
    super(app);
    this.setPlaceholder("搜索目录（递归包含子目录）");
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.app.vault.getRoot();

    const walk = (folder: TFolder) => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
      }
    };
    walk(rootFolder);

    // 排除已选过的目录（避免重复添加）
    const excludedSet = new Set(
      this.excludePaths.map((p) => p.replace(/\/+$/, "")),
    );
    return folders.filter((f) => {
      if (f.isRoot()) return true; // 保留根目录选项
      return !excludedSet.has(f.path);
    });
  }

  getItemText(folder: TFolder): string {
    if (folder.isRoot()) return "/ (vault 根目录)";
    return folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}
