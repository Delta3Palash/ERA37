import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { CalendarEventType } from "@/lib/types";

// Admin-only. Feeds a game-calendar screenshot URL to Claude Sonnet with
// vision and asks it to extract every visible event bar as structured JSON.
// Response is INTENTIONALLY a draft list — the UI shows a review modal so a
// human confirms / edits / unchecks before anything hits calendar_events.

const MODEL = "claude-sonnet-4-5";

function buildSystemPrompt(weekStart: string): string {
  return `You are parsing a weekly game event calendar screenshot from Age of Empires Mobile.

CONTEXT: This screenshot is for the week starting Monday ${weekStart}. The
calendar only shows MM-DD day labels (e.g. "MON 04-20"), never a year.
When outputting dates, YOU MUST use the year from the week above — do not
guess, do not default to the current system year. For almost all events
the year will be ${weekStart.slice(0, 4)}; the only time it might differ
is for events that cross into early January of the next year, which you
can infer from the header.

Identify every event bar in the image and return a JSON array. For each event:

{
  "title": "Title Case event name (e.g. \\"Prologue of Dynasty\\")",
  "starts_at_day": "YYYY-MM-DD (the leftmost day the bar spans, from the header labels)",
  "ends_at_day": "YYYY-MM-DD (the rightmost day the bar spans, inclusive)",
  "event_type": "growth | attack | defense | rally (use growth if uncertain)"
}

Rules:
- Use the day labels visible in the calendar header as the source of truth for month/day.
- ALL dates must be anchored to the week starting ${weekStart}.
- Skip events that show only an icon with no readable name.
- Do not invent events you cannot see clearly.
- Return ONLY the JSON array. No markdown, no explanation, no preamble.`;
}

interface ExtractedEventDraft {
  title: string;
  starts_at_day: string;
  ends_at_day: string;
  event_type: CalendarEventType;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;
  if (!auth.ctx.isAdmin) {
    return NextResponse.json(
      { error: "Only superadmins can extract calendar screenshots" },
      { status: 403 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it in Vercel environment settings.",
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const imageUrl = body.image_url;
  const weekStart = body.week_start;
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: "week_start is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(weekStart),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl },
            },
            {
              type: "text",
              text: "Extract every event bar from this calendar. Return the JSON array only.",
            },
          ],
        },
      ],
    });

    // Claude sometimes wraps JSON in ```json ... ``` fences; strip them.
    const textBlock = message.content.find((b) => b.type === "text");
    const raw = (textBlock && "text" in textBlock ? textBlock.text : "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let events: ExtractedEventDraft[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        events = parsed.filter(
          (e): e is ExtractedEventDraft =>
            e &&
            typeof e.title === "string" &&
            typeof e.starts_at_day === "string" &&
            typeof e.ends_at_day === "string" &&
            ["growth", "attack", "defense", "rally"].includes(e.event_type)
        );
      }
    } catch (parseErr) {
      console.error("[calendar.extract] JSON parse failed:", { raw, parseErr });
      return NextResponse.json(
        {
          error:
            "Could not parse the model's response as JSON. The screenshot may be too blurry or unusual — try a cleaner image.",
          raw,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[calendar.extract] Anthropic call failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extract failed" },
      { status: 500 }
    );
  }
}
