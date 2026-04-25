/**
 * SideBarView
 *
 * 复习面板。挂在右侧栏。
 * 5 态状态机：initial / cue / rating / waitNext / completed
 *
 * 具体渲染靠原生 DOM。
 */

import { ItemView, TFile, WorkspaceLeaf, Notice } from "obsidian";
import type ResurfacePlugin from "../../main";
import { CueExtractor, type Cue } from "../domain/CueExtractor";
import type { NotePath, Rating } from "../domain/types";

export const VIEW_TYPE_RESURFACE_SIDEBAR = "resurface-sidebar";

type ViewState = "initial" | "cue" | "rating" | "waitNext" | "completed";

export class SideBarView extends ItemView {
  private state: ViewState = "initial";
  private currentPath: NotePath | null = null;
  private currentCue: Cue | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: ResurfacePlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_RESURFACE_SIDEBAR;
  }

  getDisplayText() {
    return "Resurface 复习";
  }

  getIcon() {
    return "sprout";
  }

  async onOpen() {
    await this.advance();
  }

  async onClose() {
    // 无需清理
  }

  /** 外部调用：刷新当前状态（例如笔记列表变化后） */
  async refresh() {
    if (this.state === "cue" || this.state === "initial" || this.state === "completed") {
      await this.advance();
    }
  }

  /** 走向下一个状态：从当前状态推进到合适的显示 */
  async advance() {
    this.plugin.session.refresh();
    const queue = this.plugin.scheduler.getTodayQueue(
      this.plugin.session.getReviewedSet(),
    );

    if (queue.length === 0) {
      // 检查是否是"今日已完成"还是"根本没有待复习"
      const reviewedToday = this.plugin.session.reviewedCount();
      this.state = reviewedToday > 0 ? "completed" : "initial";
      this.currentPath = null;
      this.currentCue = null;
    } else {
      const next = queue[0];
      this.currentPath = next.path;
      this.currentCue = await this.loadCue(next.path);
      this.state = "cue";
    }

    this.render();
  }

  private async loadCue(path: NotePath): Promise<Cue> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return { title: path, tldr: "(笔记不存在)" };
    }
    const content = await this.app.vault.read(file);
    return CueExtractor.extract(path, content, this.plugin.storage.data.settings);
  }

  // ─── 用户操作 ──────────────────────────

  private async expandContent() {
    if (!this.currentPath) return;
    await this.plugin.openReviewTab(this.currentPath);
    this.state = "rating";
    this.render();
  }

  private async submitRating(rating: Rating) {
    if (!this.currentPath) return;
    const note = this.plugin.storage.data.notes[this.currentPath];
    if (!note) return;

    const { newState, logEntry } = this.plugin.fsrs.review(note, rating);
    Object.assign(note, newState);
    this.plugin.storage.appendRevlog({
      ...logEntry,
      path: this.currentPath,
    });
    this.plugin.storage.data.stats.totalReviews++;
    this.plugin.updateStreakIfNeeded();
    await this.plugin.storage.save();

    this.plugin.session.markReviewed(this.currentPath);

    if (this.plugin.storage.data.settings.autoAdvance) {
      await this.advance();
    } else {
      this.state = "waitNext";
      this.render();
    }
    this.plugin.refreshBadge();
  }

  private async excludeCurrent() {
    if (!this.currentPath) return;
    this.plugin.storage.excludeNote(this.currentPath);
    this.plugin.session.markExcluded(this.currentPath);
    await this.plugin.storage.save();
    new Notice("这条笔记已从复习池移除");
    await this.advance();
    this.plugin.refreshBadge();
  }

  // ─── 渲染 ──────────────────────────

  private render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("resurface-root");

    switch (this.state) {
      case "initial":
        this.renderInitial(container);
        break;
      case "cue":
        this.renderCue(container);
        break;
      case "rating":
        this.renderRating(container);
        break;
      case "waitNext":
        this.renderWaitNext(container);
        break;
      case "completed":
        this.renderCompleted(container);
        break;
    }
  }

  private renderInitial(container: HTMLElement) {
    const box = container.createDiv({ cls: "resurface-empty" });
    box.createDiv({ text: "🌱", cls: "emoji" });

    const hasAnyNote = Object.keys(this.plugin.storage.data.notes).length > 0;
    if (!hasAnyNote) {
      box.createEl("p", { text: "还没有笔记进入复活池" });
      box.createEl("p", {
        text: "等你写下第一条笔记 3 天后，它就会来这里重新找你",
        cls: "setting-item-description",
      });
    } else {
      box.createEl("p", { text: "今天没有笔记等着被唤醒" });
      box.createEl("p", {
        text: "继续你的工作吧",
        cls: "setting-item-description",
      });
    }

    this.appendStats(container);
  }

  private renderCue(container: HTMLElement) {
    if (!this.currentCue) return;

    this.appendProgress(container);

    const box = container.createDiv({ cls: "resurface-cue" });
    box.createEl("h3", { text: this.currentCue.title });
    box.createEl("blockquote", { text: this.currentCue.tldr });

    const expandBtn = box.createEl("button", {
      text: "展开正文",
      cls: "resurface-primary-btn",
    });
    expandBtn.onclick = () => void this.expandContent();

    const excludeBtn = box.createEl("button", {
      text: "不再复习",
      cls: "resurface-secondary-btn",
    });
    excludeBtn.onclick = () => void this.excludeCurrent();
  }

  private renderRating(container: HTMLElement) {
    if (!this.currentCue) return;

    this.appendProgress(container);

    const box = container.createDiv({ cls: "resurface-cue" });
    box.createEl("h3", { text: this.currentCue.title });
    // 评分阶段仍展示 tldr，和 cue 态保持一致
    box.createEl("blockquote", { text: this.currentCue.tldr });

    const mode = this.plugin.storage.data.settings.ratingMode;
    const row = box.createDiv({ cls: "resurface-rating-row" });

    if (mode === "2-button") {
      const again = row.createEl("button", {
        text: "不会",
        cls: "resurface-rating-btn again",
      });
      again.onclick = () => void this.submitRating(1);
      const good = row.createEl("button", {
        text: "会",
        cls: "resurface-rating-btn good",
      });
      good.onclick = () => void this.submitRating(3);
    } else {
      const again = row.createEl("button", {
        text: "Again",
        cls: "resurface-rating-btn again",
      });
      again.onclick = () => void this.submitRating(1);
      const hard = row.createEl("button", {
        text: "Hard",
        cls: "resurface-rating-btn",
      });
      hard.onclick = () => void this.submitRating(2);
      const good = row.createEl("button", {
        text: "Good",
        cls: "resurface-rating-btn good",
      });
      good.onclick = () => void this.submitRating(3);
      const easy = row.createEl("button", {
        text: "Easy",
        cls: "resurface-rating-btn",
      });
      easy.onclick = () => void this.submitRating(4);
    }

    const excludeBtn = box.createEl("button", {
      text: "不再复习",
      cls: "resurface-secondary-btn",
    });
    excludeBtn.onclick = () => void this.excludeCurrent();
  }

  private renderWaitNext(container: HTMLElement) {
    if (!this.currentCue) return;

    this.appendProgress(container);

    const box = container.createDiv({ cls: "resurface-cue" });
    box.createEl("h3", { text: this.currentCue.title });
    box.createEl("blockquote", { text: this.currentCue.tldr });
    box.createEl("p", {
      text: "已记录。可以继续编辑这条笔记，或者进入下一条。",
      cls: "setting-item-description",
    });

    const nextBtn = box.createEl("button", {
      text: "进入下一条 →",
      cls: "resurface-primary-btn",
    });
    nextBtn.onclick = () => void this.advance();
  }

  private renderCompleted(container: HTMLElement) {
    const box = container.createDiv({ cls: "resurface-empty" });
    box.createDiv({ text: "🌱", cls: "emoji" });
    const count = this.plugin.session.reviewedCount();
    box.createEl("p", {
      text: `今日的 ${count} 条笔记都在你这里重新活了一次`,
    });
    this.appendStats(container);
  }

  private appendProgress(container: HTMLElement) {
    const done = this.plugin.session.reviewedCount();
    const remaining = this.plugin.scheduler.countDueToday(
      this.plugin.session.getReviewedSet(),
    );
    const total = done + remaining;
    if (total === 0) return;
    container.createDiv({
      cls: "resurface-progress",
      text: `🌱 ${done + 1}/${total}`,
    });
  }

  private appendStats(container: HTMLElement) {
    const settings = this.plugin.storage.data.settings;
    const stats = this.plugin.storage.data.stats;
    const poolSize = Object.values(this.plugin.storage.data.notes).filter(
      (n) => !n.excluded,
    ).length;

    const statsBox = container.createDiv({ cls: "resurface-stats" });
    if (settings.showStreak && stats.streakDays > 0) {
      statsBox.createSpan({
        cls: "line",
        text: `连续 ${stats.streakDays} 天陪伴笔记`,
      });
    }
    if (stats.totalReviews > 0) {
      statsBox.createSpan({
        cls: "line",
        text: `累计复习 ${stats.totalReviews} 次`,
      });
    }
    statsBox.createSpan({
      cls: "line",
      text: `复活池里有 ${poolSize} 条笔记`,
    });
  }
}
