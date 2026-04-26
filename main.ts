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

    // 6. 跨日/聚焦时自动刷新：
    //    - active-leaf-change: 用户切换到侧栏 tab / 侧栏重新激活
    //    - window focus: Obsidian 窗口从后台切回前台（跨日常见场景：昨天没关，今天切回）
    //    - visibilitychange: 页面从不可见变可见（electron/tab 场景互补）
    //    所有事件共用防抖，避免短时间内重复计算。
    this.registerAutoRefresh();

    // 7. 首次加载：等 workspace 准备好后再扫描 vault
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
    // Obsidian 会自动清理用 registerEvent/registerView/registerDomEvent 注册的内容
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
      this.refreshDebounceTimer = null;
    }
  }

  // ─── 自动刷新 ──────────────────────────

  private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 监听焦点/激活类事件，触发侧栏刷新。共用 250ms 防抖避免重复触发。
   * 只有侧栏真的存在且 session 检测到跨日或队列过时时才重算。
   */
  private registerAutoRefresh(): void {
    const schedule = () => this.scheduleAutoRefresh();

    // 用户在 Obsidian 内部切 leaf（比如从编辑器 tab 切到侧栏）
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => schedule()),
    );

    // Obsidian 窗口重新获得焦点（从其它 App / 后台切回）
    this.registerDomEvent(window, "focus", () => schedule());

    // 页面可见性变化（electron 最小化恢复、浏览器 tab 切换等）
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") schedule();
    });
  }

  private scheduleAutoRefresh(): void {
    if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshDebounceTimer = null;
      this.doAutoRefresh();
    }, 250);
  }

  private doAutoRefresh(): void {
    // 主动推进 session 的日期边界检测，确保跨日时 reviewedSet 已清空。
    // 否则 rating/waitNext 态不会触发 advance()，session 可能仍带着昨日残留，
    // 导致 badge 显示的数字偏低（昨日已复习 10 条 + 今日上限 15 = 错误的 5 条剩余）。
    this.session.refresh();
    this.refreshBadge();
    // 侧栏的 refresh() 内部有守卫：只在 cue/initial/completed 态重算，
    // 不会打断用户正在进行的评分流程。
    void this.refreshSideBar();
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
