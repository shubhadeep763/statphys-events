// Weekly event updater: asks Claude (with web search) for new statmech events,
// validates them, merges into src/events.json, and prunes events that ended
// more than PRUNE_AFTER_DAYS ago. Run by .github/workflows/update-events.yml.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = path.join(__dirname, "..", "src", "events.json");

const PRUNE_AFTER_DAYS = 180; // delete events that ended > 6 months ago
const MAX_NEW_EVENTS = 20;

// Must stay in sync with CATEGORIES / TYPES in src/App.jsx
const CATEGORIES = ["non-equilibrium", "active matter", "hydrodynamics", "classical statmech", "quantum non-equilibrium", "quantum information", "machine learning", "soft matter", "stochastic", "biophysics"];
const TYPES = ["Conference", "School", "Workshop", "Program"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const keyOf = (e) => (e.name || "").toLowerCase().trim() + "|" + (e.start || "");

const todayISO = new Date().toISOString().slice(0, 10);
const cutoffISO = new Date(Date.now() - PRUNE_AFTER_DAYS * 86400000)
  .toISOString()
  .slice(0, 10);

function prettyRange(start, end) {
  const fmt = (iso) =>
    new Date(iso + "T00:00:00Z").toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  if (!start) return "TBA";
  if (!end || end === start) return fmt(start);
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return (
      s.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) +
      ` ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`
    );
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const start = typeof raw.start === "string" ? raw.start.trim() : "";
  if (!name || !/^https?:\/\//.test(url) || !ISO_DATE.test(start)) return null;
  if (start < todayISO) return null; // only add future events
  const end = typeof raw.end === "string" && ISO_DATE.test(raw.end.trim()) ? raw.end.trim() : "";
  const deadline =
    typeof raw.deadline === "string" && ISO_DATE.test(raw.deadline.trim())
      ? raw.deadline.trim()
      : "";
  const type = TYPES.includes(raw.type) ? raw.type : "Workshop";
  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter((c) => CATEGORIES.includes(c))
    : [];
  const blurb = typeof raw.blurb === "string" ? raw.blurb.trim().slice(0, 300) : "";
  const location = typeof raw.location === "string" ? raw.location.trim() : "";
  const event = {
    name,
    url,
    dateDisplay:
      typeof raw.dateDisplay === "string" && raw.dateDisplay.trim()
        ? raw.dateDisplay.trim()
        : prettyRange(start, end),
    start,
    location,
    type,
    categories,
    blurb,
  };
  if (end) event.end = end;
  if (deadline) event.deadline = deadline;
  return event;
}

function extractJsonArray(text) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("No JSON array found in model output:\n" + text.slice(0, 500));
  }
  return JSON.parse(text.slice(first, last + 1));
}

async function findNewEvents(existing) {
  const client = new Anthropic();
  const existingList = existing
    .map((e) => `- ${e.name} | ${e.start || "TBA"}`)
    .join("\n");

  const prompt = `You maintain the event database for statphys-events.vercel.app, a curated listing of statistical physics conferences, schools, workshops, and programs.

Today's date is ${todayISO}.

Search the web for NEW upcoming events in statistical physics that are NOT already in the database below. Focus on these topics: ${CATEGORIES.join(", ")}.

Good sources to check (search these and beyond):
- ICTS-TIFR Bengaluru upcoming programs, KITP Santa Barbara, MPI-PKS Dresden, Galileo Galilei Institute Florence, Les Houches School of Physics, Boulder Summer School, ICTP Trieste scientific calendar, ICTP-SAIFR, Aspen Center for Physics, Lake Como School
- The Frey group conference list (LMU Munich), KOMET Mainz conference blackboard, GDR MePhy, CECAM workshops, IUPAP StatPhys
- General web searches for statistical physics / active matter / stochastic thermodynamics / soft matter conferences and schools in ${todayISO.slice(0, 4)} and ${Number(todayISO.slice(0, 4)) + 1}

Requirements for each event you report:
- It must have a confirmed start date within the next 18 months, an official event webpage (use that page's URL), and be clearly within statistical physics broadly construed.
- It must NOT already be in the database (check name and dates carefully — the same event may be phrased slightly differently).
- Report at most ${MAX_NEW_EVENTS} events. Quality over quantity: only include events you actually verified on their official page during this search. Do not invent or guess dates.

Existing database (name | start date):
${existingList}

Output format: after your research, your final message must be ONLY a JSON array (no markdown fences, no commentary). Each element:
{
  "name": "string, official event title",
  "url": "https://... official event page",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD (omit if single day or unknown)",
  "deadline": "YYYY-MM-DD application/registration deadline (omit if none found)",
  "location": "City, Country (or 'Online')",
  "type": one of ${JSON.stringify(TYPES)},
  "categories": array drawn only from ${JSON.stringify(CATEGORIES)},
  "blurb": "one sentence describing the event"
}
If you find no new events, output [].`;

  let messages = [{ role: "user", content: prompt }];
  let response;
  for (let attempt = 0; attempt < 8; attempt++) {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 25 }],
      messages,
    });
    response = await stream.finalMessage();
    if (response.stop_reason !== "pause_turn") break;
    // server-side tool loop paused; resume where it left off
    messages = [...messages, { role: "assistant", content: response.content }];
  }

  if (response.stop_reason === "refusal") {
    throw new Error("Model refused the request: " + JSON.stringify(response.stop_details));
  }
  if (response.stop_reason === "pause_turn") {
    throw new Error("Search did not finish after maximum continuations.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return extractJsonArray(text);
}

async function main() {
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf8"));

  const kept = events.filter((e) => {
    const ref = e.end || e.start;
    return !ref || ref >= cutoffISO;
  });
  const prunedCount = events.length - kept.length;

  const found = await findNewEvents(kept);
  const existingKeys = new Set(kept.map(keyOf));
  const fresh = [];
  for (const raw of found) {
    const event = sanitize(raw);
    if (!event) {
      console.log("Skipping invalid entry:", JSON.stringify(raw).slice(0, 200));
      continue;
    }
    if (existingKeys.has(keyOf(event))) continue;
    existingKeys.add(keyOf(event));
    fresh.push(event);
  }

  console.log(`Pruned ${prunedCount} old event(s); adding ${fresh.length} new event(s).`);
  fresh.forEach((e) => console.log(`  + ${e.name} (${e.dateDisplay})`));

  if (prunedCount === 0 && fresh.length === 0) {
    console.log("No changes to events.json.");
    return;
  }

  const merged = [...kept, ...fresh].sort((a, b) =>
    (a.start || "").localeCompare(b.start || "")
  );
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Wrote ${merged.length} events to src/events.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
