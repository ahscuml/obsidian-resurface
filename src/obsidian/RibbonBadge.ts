/**
 * RibbonBadge
 *
 * 侧栏 ribbon 的图标 + 角标数字。
 * Obsidian 原生 addRibbonIcon 返回一个 HTMLElement，我们在其上加 badge。
 */

import type { Plugin } from "obsidian";

export class RibbonBadge {
  private iconEl: HTMLElement | null = null;
  private badgeEl: HTMLSpanElement | null = null;

  constructor(
    private plugin: Plugin,
    private icon: string,
    private title: string,
    private onClick: () => void,
  ) {}

  create(): void {
    this.iconEl = this.plugin.addRibbonIcon(this.icon, this.title, () =>
      this.onClick(),
    );
    this.iconEl.addClass("resurface-ribbon");
    // 插入一个 badge span，用绝对定位贴在右上
    this.badgeEl = this.iconEl.createSpan({
      cls: "resurface-ribbon-badge",
    });
    // 内联样式；避免需要修改全局 css
    const style = this.iconEl.style;
    style.position = style.position || "relative";

    const badgeStyle = this.badgeEl.style;
    badgeStyle.position = "absolute";
    badgeStyle.top = "2px";
    badgeStyle.right = "2px";
    badgeStyle.minWidth = "16px";
    badgeStyle.height = "16px";
    badgeStyle.padding = "0 4px";
    badgeStyle.borderRadius = "8px";
    badgeStyle.background = "var(--interactive-accent)";
    badgeStyle.color = "var(--text-on-accent)";
    badgeStyle.fontSize = "10px";
    badgeStyle.lineHeight = "16px";
    badgeStyle.textAlign = "center";
    badgeStyle.display = "none";
    badgeStyle.pointerEvents = "none";
  }

  setCount(n: number): void {
    if (!this.badgeEl) return;
    if (n <= 0) {
      this.badgeEl.style.display = "none";
    } else {
      this.badgeEl.style.display = "block";
      this.badgeEl.setText(n > 99 ? "99+" : String(n));
    }
  }
}
