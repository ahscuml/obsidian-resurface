/**
 * ResurfacePlugin —— 主入口
 *
 * 生命周期与服务装配。
 */

import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StorageService } from "./src/domain/StorageService";
import { FSRSService } from "./src/domain/FSRSService";
import { Scheduler } from "./src/domain/Scheduler";
import { ReviewSession } from "./src/domain/ReviewSession";
import { VaultWatcher } from "./src/obsidian/VaultWatcher";
import { RibbonBadge } from "./src/obsidian/RibbonBadge";
import { showStartupNotice } from "./src/obsidian/StartupNotice";
import {
  SideBarView,
  VIEW_TYPE_RESURFACE_SIDEBAR,
} from "./src/ui/SideBarView";
import { ResurfaceSettingTab } from "./src/ui/SettingsTab";
import { formatDateKey } from "./src/utils/date";
import type { NotePath } from "./src/domain/types";

export default class ResurfacePlugin extends Plugin {
  storage!: StorageService;
  fsrs!: FSRSService;
  scheduler!: Scheduler;
  session!: ReviewSession;

  private vaultWatcher!: VaultWatcher;
  private ribbonBadge!: RibbonBadge;

  async onload() {
    console.log("[Resurface] loading");

    // 1. 核心服务
    this.storage = new StorageService(this);
    await this.storage.load();

    this.fsrs = new FSRSService(this.storage);
    this.scheduler = new Scheduler(this.storage, this.fsrs);
    this.session = new ReviewSession(
      () => this.storage.data.settings.dayBoundaryHour,
    );

    // 2. Obsidian 事件
    this.vaultWatcher = new VaultWatcher(
      this,
      this.storage,
      this.fsrs,
      () => this.onListMayChange(),
    );
    this.vaultWatcher.register();

    // 3. 注册 View
    this.registerView(
      VIEW_TYPE_RESURFACE_SIDEBAR,
      (leaf) => new SideBarView(leaf, this),
    );

    // 4. Ribbon badge
    this.ribbonBadge = new RibbonBadge(this, "sprout", "Resurface 复习", () =>
      this.activateSideBar(),
    );
    this.ribbonBadge.create();

    // 5. Settings tab
    this.addSettingTab(new ResurfaceSettingTab(this.app, this));

    // 6. 首次加载：等 workspace 准备好后再扫描 vault
    this.app.workspace.onLayoutReady(async () => {
      await this.vaultWatcher.backfillExistingNotes();
      this.refreshBadge();
      const dueCount = this.scheduler.countDueToday(
        this.session.getReviewedSet(),
      );
      showStartupNotice(dueCount);
    });

    console.log("[Resurface] loaded");
  }

  async onunload() {
    console.log("[Resurface] unloading");
    // Obsidian 会自动清理用 registerEvent/registerView 注册的内容
  }

  // ─── Side bar ──────────────────────────

  async activateSideBar(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_RESURFACE_SIDEBAR)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true)!;
      await leaf.setViewState({
        type: VIEW_TYPE_RESURFACE_SIDEBAR,
        active: true,
      });
    }
    await workspace.revealLeaf(leaf);
    // 重新进入时刷新状态
    await this.refreshSideBar();
  }

  async refreshSideBar(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_RESURFACE_SIDEBAR,
    )[0];
    if (leaf && leaf.view instanceof SideBarView) {
      await leaf.view.refresh();
    }
  }

  refreshBadge(): void {
    const count = this.scheduler.countDueToday(
      this.session.getReviewedSet(),
    );
    this.ribbonBadge.setCount(count);
  }

  // ─── 复习专用 Tab ──────────────────────────

  /**
   * 在主区打开指定笔记，使用"复习专用 tab"：
   *   - 如果已经在 reviewTabLeaf 里，复用
   *   - 否则在主区新开 tab
   */
  private reviewTabLeaf: WorkspaceLeaf | null = null;

  async openReviewTab(path: NotePath): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const { workspace } = this.app;

    // 如果已有 tab 且还活着 → 复用
    if (this.reviewTabLeaf) {
      const stillValid = workspace.getLeavesOfType("markdown").includes(
        this.reviewTabLeaf,
      );
      if (!stillValid) {
        this.reviewTabLeaf = null;
      }
    }

    if (!this.reviewTabLeaf) {
      this.reviewTabLeaf = workspace.getLeaf("tab");
    }

    await this.reviewTabLeaf.openFile(file);
    workspace.revealLeaf(this.reviewTabLeaf);
  }

  // ─── 统计 ──────────────────────────

  updateStreakIfNeeded(): void {
    const stats = this.storage.data.stats;
    const boundaryHour = this.storage.data.settings.dayBoundaryHour;
    const todayKey = formatDateKey(new Date(), boundaryHour);
    if (stats.lastReviewDate === todayKey) return; // 今日已经计过

    if (stats.lastReviewDate) {
      // 计算与上次日期相差多少日边界天
      const last = new Date(stats.lastReviewDate + "T12:00:00");
      const diff = Math.round(
        (new Date(todayKey + "T12:00:00").getTime() - last.getTime()) /
          (24 * 3600 * 1000),
      );
      if (diff === 1) {
        stats.streakDays++;
      } else if (diff > 1) {
        stats.streakDays = 1; // 断更了，从 1 重启
      }
    } else {
      stats.streakDays = 1;
    }
    stats.lastReviewDate = todayKey;
  }

  // ─── 事件回调 ──────────────────────────

  private onListMayChange(): void {
    this.refreshBadge();
    // 如果侧栏正在显示 cue/initial/completed 状态，可能需要刷新
    void this.refreshSideBar();
  }
}
