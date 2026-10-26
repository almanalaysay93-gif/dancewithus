// Talks to the Apps Script web app. A text/plain POST is a CORS "simple" request,
// so the browser can read Apps Script's JSON reply without a preflight.
import { STEPFIT } from "./config.js";

// Dev uses the local copy of Code.gs (/api) so testing never writes to the real Sheet.
// Run `VITE_LIVE_API=1 npm run dev` to develop against the live web app instead.
const endpoint = import.meta.env.DEV && !import.meta.env.VITE_LIVE_API ? "/api" : STEPFIT.scriptUrl;

export async function api(action, data = {}) {
  if (!endpoint) return { ok: false, error: "offline" };
  const res = await fetch(endpoint, { method: "POST", body: JSON.stringify({ action, ...data }) });
  if (!res.ok) throw new Error("http " + res.status);
  return res.json();
}

const DAY = { weekday: "long", month: "short", day: "numeric", year: "numeric" };

export function formatDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", DAY);
}

function clock(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return { text: (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : ""), pm: h >= 12 };
}

/** "18:00","19:00" → "6–7PM"; "11:00","13:00" → "11AM–1PM" */
export function formatTimeRange(start, end) {
  const a = clock(start);
  const b = clock(end);
  const tail = b.pm ? "PM" : "AM";
  return a.pm === b.pm ? `${a.text}–${b.text}${tail}` : `${a.text}${a.pm ? "PM" : "AM"}–${b.text}${tail}`;
}
