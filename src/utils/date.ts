/**
 * 日期工具（纯函数）
 *
 * 日边界在凌晨 04:00（可配置）——凌晨 0-4 点仍算昨天。
 */

/** 返回 [当前时间] 所属"日"的起始时刻（以 boundaryHour 为界） */
export function getDayStart(at: Date, boundaryHour: number): Date {
  const d = new Date(at);
  d.setHours(boundaryHour, 0, 0, 0);
  if (d > at) {
    // 比如此时是凌晨 2 点、boundaryHour=4 → 此刻仍属昨天
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** 返回日期的 YYYY-MM-DD（不含时间） */
export function formatDateKey(at: Date, boundaryHour: number): string {
  const start = getDayStart(at, boundaryHour);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 两个日期相差多少"日边界天"（考虑 boundaryHour） */
export function daysBetween(
  earlier: Date,
  later: Date,
  boundaryHour: number,
): number {
  const a = getDayStart(earlier, boundaryHour);
  const b = getDayStart(later, boundaryHour);
  const diffMs = b.getTime() - a.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

/** 精确小时差（浮点天数，用于 FSRS elapsed） */
export function elapsedDaysExact(earlier: Date, later: Date): number {
  const diffMs = later.getTime() - earlier.getTime();
  return diffMs / (24 * 60 * 60 * 1000);
}

/** 一个随机抖动：[days - jitter, days + jitter] 天 */
export function addDaysWithJitter(
  base: Date,
  days: number,
  jitter: number,
): Date {
  const actualDays =
    days + (jitter > 0 ? Math.floor(Math.random() * (jitter * 2 + 1)) - jitter : 0);
  const result = new Date(base);
  result.setDate(result.getDate() + Math.max(1, actualDays));
  return result;
}
