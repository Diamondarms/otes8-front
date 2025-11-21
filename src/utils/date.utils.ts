
import { WeekDateRangeFixed } from '../models/finance.models';

export function getCurrentMesAno(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

export function parseDate(dateStr?: string | Date): Date | null {
  if (!dateStr) {
    return null;
  }

  // If it's already a Date object, it's valid.
  if (dateStr instanceof Date) {
    return dateStr;
  }

  // For full ISO strings (containing 'T'), new Date() works reliably
  // across browsers and timezones.
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  // For 'YYYY-MM-DD' strings, which can be ambiguous (often treated as UTC),
  // we parse manually to ensure it's interpreted in the user's local timezone.
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const [year, month, day] = parts;
    // new Date(year, monthIndex, day) reliably creates a date in the local timezone.
    const localDate = new Date(year, month - 1, day);
    // Verify that the date wasn't rolled over by an invalid value (e.g. month 13)
    if (localDate.getFullYear() === year && localDate.getMonth() === month - 1 && localDate.getDate() === day) {
      return localDate;
    }
  }

  console.warn('Could not reliably parse date format:', dateStr);
  return null;
}

export function getMesAnoFromDate(dateObj: Date | string): string {
  let d: Date;
  if (typeof dateObj === 'string') {
    d = parseDate(dateObj) as Date;
    if (!d) throw new Error('Data string inválida para getMesAnoFromDate');
  } else {
    d = dateObj;
  }
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

export function getWeeksOfMonthFixed4(mesAnoReferencia: string): WeekDateRangeFixed[] {
  const [year, monthNum] = mesAnoReferencia.split('-').map(Number);
  const weeks: WeekDateRangeFixed[] = [];
  const firstOfMonth = new Date(year, monthNum - 1, 1);
  const lastOfMonth = new Date(year, monthNum, 0);

  weeks.push({
    weekOfMonth: 1,
    startDate: new Date(year, monthNum - 1, 1),
    endDate: new Date(year, monthNum - 1, 7, 23, 59, 59, 999),
    label: `Semana 1 (01-07)`,
  });
  weeks.push({
    weekOfMonth: 2,
    startDate: new Date(year, monthNum - 1, 8),
    endDate: new Date(year, monthNum - 1, 14, 23, 59, 59, 999),
    label: `Semana 2 (08-14)`,
  });
  weeks.push({
    weekOfMonth: 3,
    startDate: new Date(year, monthNum - 1, 15),
    endDate: new Date(year, monthNum - 1, 21, 23, 59, 59, 999),
    label: `Semana 3 (15-21)`,
  });
  weeks.push({
    weekOfMonth: 4,
    startDate: new Date(year, monthNum - 1, 22),
    endDate: lastOfMonth, // End of day is handled by comparison logic
    label: `Semana 4 (22-${lastOfMonth.getDate()})`,
  });

  return weeks
    .map((w) => ({
      ...w,
      startDate: new Date(
        Math.max(w.startDate.getTime(), firstOfMonth.getTime())
      ),
      endDate: new Date(Math.min(w.endDate.getTime(), lastOfMonth.getTime())),
    }))
    .filter((w) => w.startDate <= w.endDate);
}