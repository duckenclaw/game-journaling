import { execFileSync } from "node:child_process";

// ──────────────────────────────────────────────
// Calendar.app automation
// ──────────────────────────────────────────────
//
// Every value is passed through `argv` rather than interpolated into the
// script text — game names routinely contain quotes, colons and backslashes.

/** macOS error code for "Not authorized to send Apple events". */
const ERR_NOT_AUTHORIZED = "-1743";

export class CalendarAccessError extends Error {}

function runOsa(script: string, args: string[]): string {
  try {
    return execFileSync("osascript", ["-", ...args], {
      input: script,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    if (stderr.includes(ERR_NOT_AUTHORIZED) || stderr.includes("not allowed assistive")) {
      throw new CalendarAccessError(
        "Calendar automation is not authorized.\n" +
          "  Grant your terminal access under System Settings → Privacy & Security →\n" +
          "  Automation → (your terminal) → Calendar, then re-run.",
      );
    }
    throw new Error(`osascript failed: ${stderr.trim() || (err as Error).message}`);
  }
}

/** Builds an AppleScript date without depending on the user's locale. */
const MAKE_DATE_HANDLER = `
on makeDate(y, m, d)
	set monthList to {January, February, March, April, May, June, July, August, September, October, November, December}
	set theDate to current date
	set time of theDate to 0
	set day of theDate to 1
	set year of theDate to y
	set month of theDate to item m of monthList
	set day of theDate to d
	return theDate
end makeDate
`;

const ENSURE_CALENDAR = `
on run argv
	set calName to item 1 of argv
	tell application "Calendar"
		if not (exists calendar calName) then
			make new calendar with properties {name:calName}
		end if
	end tell
	return "ok"
end run
`;

const LIST_UIDS = `
on run argv
	set calName to item 1 of argv
	tell application "Calendar"
		if not (exists calendar calName) then return ""
		tell calendar calName
			set uidList to uid of every event
		end tell
	end tell
	if uidList is {} then return ""
	set AppleScript's text item delimiters to linefeed
	return uidList as text
end run
`;

const CREATE_EVENT = `
on run argv
	set calName to item 1 of argv
	set evtSummary to item 2 of argv
	set evtDescription to item 3 of argv
	set y to (item 4 of argv) as integer
	set m to (item 5 of argv) as integer
	set d to (item 6 of argv) as integer

	set startDate to my makeDate(y, m, d)

	tell application "Calendar"
		tell calendar calName
			set newEvent to make new event with properties {summary:evtSummary, description:evtDescription, start date:startDate, end date:(startDate + 1 * days), allday event:true}
			tell newEvent
				make new display alarm at end with properties {trigger interval:-10080}
				make new display alarm at end with properties {trigger interval:0}
			end tell
			return uid of newEvent
		end tell
	end tell
end run
${MAKE_DATE_HANDLER}
`;

const UPDATE_EVENT = `
on run argv
	set calName to item 1 of argv
	set theUid to item 2 of argv
	set evtSummary to item 3 of argv
	set evtDescription to item 4 of argv
	set y to (item 5 of argv) as integer
	set m to (item 6 of argv) as integer
	set d to (item 7 of argv) as integer

	set startDate to my makeDate(y, m, d)

	tell application "Calendar"
		tell calendar calName
			set matches to (every event whose uid is theUid)
			if (count of matches) is 0 then return "missing"
			tell item 1 of matches
				set summary to evtSummary
				set description to evtDescription
				set allday event to true
				set start date to startDate
				set end date to (startDate + 1 * days)
			end tell
			return "updated"
		end tell
	end tell
end run
${MAKE_DATE_HANDLER}
`;

export interface EventFields {
  summary: string;
  description: string;
  /** "YYYY-MM-DD" */
  date: string;
}

function dateArgs(date: string): string[] {
  const [y, m, d] = date.split("-");
  return [String(Number(y)), String(Number(m)), String(Number(d))];
}

/** Create the calendar if it doesn't already exist. */
export function ensureCalendar(calendarName: string): void {
  runOsa(ENSURE_CALENDAR, [calendarName]);
}

/** All event UIDs currently in the calendar. Empty set if the calendar is gone. */
export function listEventUids(calendarName: string): Set<string> {
  const out = runOsa(LIST_UIDS, [calendarName]);
  if (!out) return new Set();
  return new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
}

/** Create an all-day event with alerts a week before and on the day. Returns its UID. */
export function createEvent(calendarName: string, fields: EventFields): string {
  return runOsa(CREATE_EVENT, [
    calendarName,
    fields.summary,
    fields.description,
    ...dateArgs(fields.date),
  ]);
}

/** Update an existing event in place. Returns false if the UID no longer exists. */
export function updateEvent(calendarName: string, uid: string, fields: EventFields): boolean {
  const result = runOsa(UPDATE_EVENT, [
    calendarName,
    uid,
    fields.summary,
    fields.description,
    ...dateArgs(fields.date),
  ]);
  return result === "updated";
}
