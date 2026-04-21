import { describe, it, expect } from "vitest";
import { getDayStart, formatDateKey, daysBetween } from "../src/utils/date";

describe("date utils", () => {
  describe("getDayStart", () => {
    it("凌晨 4 点前仍算昨天", () => {
      const at = new Date("2026-04-21T02:30:00");
      const start = getDayStart(at, 4);
      expect(start.getDate()).toBe(20); // 4/20
      expect(start.getHours()).toBe(4);
    });

    it("凌晨 4 点整算今天", () => {
      const at = new Date("2026-04-21T04:00:00");
      const start = getDayStart(at, 4);
      expect(start.getDate()).toBe(21);
    });

    it("下午正常算今天", () => {
      const at = new Date("2026-04-21T15:00:00");
      const start = getDayStart(at, 4);
      expect(start.getDate()).toBe(21);
      expect(start.getHours()).toBe(4);
    });

    it("boundaryHour=0 时按正常 0 点分界", () => {
      const at = new Date("2026-04-21T02:30:00");
      const start = getDayStart(at, 0);
      expect(start.getDate()).toBe(21);
    });
  });

  describe("formatDateKey", () => {
    it("返回 YYYY-MM-DD 格式", () => {
      const at = new Date("2026-04-21T15:00:00");
      expect(formatDateKey(at, 4)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("凌晨 3 点属于前一天", () => {
      const at = new Date("2026-04-21T03:00:00");
      const key = formatDateKey(at, 4);
      expect(key).toBe("2026-04-20");
    });
  });

  describe("daysBetween", () => {
    it("同一天返回 0", () => {
      const a = new Date("2026-04-21T10:00:00");
      const b = new Date("2026-04-21T20:00:00");
      expect(daysBetween(a, b, 4)).toBe(0);
    });

    it("跨日边界返回 1", () => {
      const a = new Date("2026-04-21T10:00:00");
      const b = new Date("2026-04-22T10:00:00");
      expect(daysBetween(a, b, 4)).toBe(1);
    });

    it("凌晨 3 点到凌晨 5 点（跨 boundary 4）返回 1", () => {
      const a = new Date("2026-04-21T03:00:00"); // 属于 4/20
      const b = new Date("2026-04-21T05:00:00"); // 属于 4/21
      expect(daysBetween(a, b, 4)).toBe(1);
    });
  });
});
