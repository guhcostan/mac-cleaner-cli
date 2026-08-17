/**
 * Matches characters that must never be written raw to a terminal:
 * C0/C1 control codes (including ESC, which starts ANSI sequences),
 * DEL, and bidi/zero-width formatting characters.
 */
const UNSAFE_DISPLAY_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Makes filesystem-derived text safe to print in the terminal UI.
 *
 * File names are attacker-controllable (anything downloaded or unpacked can
 * carry ANSI escapes, newlines or bidi overrides in its name) and the UI drives
 * destructive choices, so a crafted name could otherwise repaint rows, hide
 * entries or disguise what a selection is about to delete.
 */
export function sanitizeDisplayName(text: string): string {
  return text.replace(UNSAFE_DISPLAY_CHARS, '\uFFFD');
}
