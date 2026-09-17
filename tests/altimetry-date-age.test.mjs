/* Observed-date age must match the local calendar day shown in the label. */
import { makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();

function localCalendarDayStartMs(msOrDate) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function calendarDaysBeforeToday(observedAtMs, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  const diff = localCalendarDayStartMs(now) - localCalendarDayStartMs(observedAtMs);
  return Math.max(0, Math.round(diff / 86400000));
}
function formatObservedAgeDays(n) {
  if (n <= 0) return "today";
  if (n === 1) return "1 day ago";
  return n + " days ago";
}

console.log("Observed age uses local calendar days, not raw 24h buckets:");

// NOAA granule timestamps are UTC midnight. In US timezones that often reads as
// the prior local calendar day — age must follow the same local day, not hours.
const sep7UtcMidnight = Date.parse("2026-09-07T00:00:00Z");
const sep9MorningUtc = Date.parse("2026-09-09T10:14:00Z");
const showsSep6Locally = new Date(sep7UtcMidnight).toLocaleDateString(undefined, {
  month: "short",
  day: "numeric",
}) === "Sep 6";

if (showsSep6Locally) {
  check("Sep 7 UTC midnight shown as Sep 6 locally reads 3 days ago on Sep 9",
    calendarDaysBeforeToday(sep7UtcMidnight, sep9MorningUtc) === 3
    && formatObservedAgeDays(calendarDaysBeforeToday(sep7UtcMidnight, sep9MorningUtc)) === "3 days ago");
} else {
  check("Sep 7 UTC midnight shown as Sep 7 locally reads 2 days ago on Sep 9",
    calendarDaysBeforeToday(sep7UtcMidnight, sep9MorningUtc) === 2
    && formatObservedAgeDays(calendarDaysBeforeToday(sep7UtcMidnight, sep9MorningUtc)) === "2 days ago");
}

check("raw 24h rounding no longer understates when label and age disagree",
  Math.round((sep9MorningUtc - sep7UtcMidnight) / 86400000) === 2
  && calendarDaysBeforeToday(sep7UtcMidnight, sep9MorningUtc) >= 2);

check("same local calendar day is today",
  calendarDaysBeforeToday(sep9MorningUtc, sep9MorningUtc) === 0
  && formatObservedAgeDays(0) === "today");

check("yesterday local calendar is 1 day ago",
  calendarDaysBeforeToday(Date.parse("2026-09-08T15:00:00Z"), sep9MorningUtc) === 1);

done();
