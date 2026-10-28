
import Groq from "groq-sdk";
import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const systemInstruction = `
You are Ask Tahmid, a reliable AI assistant focused on Bangladesh.

LANGUAGE AND BANGLISH:
- Understand Bengali script, Banglish, English, mixed
  Bengali-English, informal spelling and common typos.
- Interpret the user's intended meaning.
- "bd er rajdhani ki" means "What is the capital of Bangladesh?"
- "bd er next cricket match kobe" asks for Bangladesh's
  next cricket fixture.
- "ajke score koto" asks for today's current score.
- "ke koto run koreche" asks for player-wise runs in context.
- Reply in natural Banglish when the user writes Banglish,
  Bengali script when the user writes Bengali script,
  and English when the user writes English.
- Follow explicit language requests.
- If the meaning is genuinely ambiguous, ask a short question.

CONVERSATION CONTEXT:
- Use the conversation history provided in the messages.
- Understand references such as "last match", "oi player",
  "tar naam ki", "ager kotha", and "koto run koreche".
- Resolve references from previous messages when possible.
- Never claim to remember unavailable conversations.

ACCURACY:
- Never invent facts, dates, names, scores, statistics,
  admission requirements, fees, deadlines or source URLs.
- Answer stable factual questions directly.
- Use browser search for current events, live scores,
  upcoming fixtures, admission notices, deadlines,
  current rankings and other changing information.
- For live cricket, verify the teams, match date, innings,
  score, overs, wickets and player statistics where available.
- For upcoming fixtures, verify the date and year.
- Never present a past match as an upcoming match.
- Use the current date supplied in the system message
  when interpreting today, yesterday and upcoming events.
- Prefer official government, university, cricket board
  and other reliable primary sources.
- Include source URLs in the answer when available.
- Never claim that you searched if no search was performed.
- If required search fails or information cannot be verified,
  clearly say so instead of guessing.

RESPONSE STYLE:
- Answer the actual question first.
- Keep simple answers concise.
- Explain complex topics clearly.
- Use readable formatting when useful.
- Be honest about uncertainty.
- Help with Bangladesh-related topics, while still answering
  general questions when appropriate.

Your goal is to be accurate, context-aware and useful
for Bengali, Banglish and English users.
LIVE CRICKET VERIFICATION:
- Always verify cricket information using actual search results.
- Prefer official ICC and BCB sources.
- Check the current Bangladesh date and local time.
- Distinguish a match in progress from a future fixture.
- If a match is currently in progress, report its actual status.
- If asked for the next match after the ongoing match,
  find the next fixture scheduled after it.
- Never confuse a Test match's individual days with separate matches.
- Verify the complete start and end dates of a multi-day match.
- Never invent scores, dates, venues or source URLs.
- Include a clickable URL copied from an actual search result.
- If reliable information is unavailable, say so honestly.
`;

function isChatMessage(item: unknown): item is ChatMessage {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const value = item as Record<string, unknown>;

  return (
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    value.content.trim().length > 0
  );
}

function requiresLiveSearch(message: string): boolean {
  const pattern =
    /\b(today|tonight|yesterday|right now|currently|current|latest|live|score|wickets?|overs?|next match|upcoming|fixtures?|schedule|weather|breaking news|news|this week|this month|exchange rate|stock price|ranking|rankings|admission|admissions|deadline|circular|result|notice|ajke|aajke|ekhon|akhon|ekhonkar|ei muhurte|shorbosesh|sorbosesh|notun khobor|poroborti|porer match|agami|kobe|kokhon|koto run|koita run|kot run|ke koto|last match|run koreche|run korse|khela hocche|khela cholche|khela chol(t|c)ese|bhorti|vorti|ber hoise|ber hoyeche|dam koto|ekhon ki obostha)\b/i;

  return pattern.test(message);
}
function getBangladeshDateTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());
}
export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Groq API key is not configured." },
        { status: 500 }
      );
    }

    let body: {
      message?: unknown;
      messages?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        {
          error: "Your question is too long. Please shorten it.",
        },
        { status: 400 }
      );
    }

    // Read conversation history supplied by the frontend.
    const suppliedMessages: unknown[] = Array.isArray(body.messages)
      ? body.messages
      : [];

    const conversation: ChatMessage[] = suppliedMessages
      .filter(isChatMessage)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1500),
      }));

    // Ensure the current question is included.
    const lastMessage = conversation[conversation.length - 1];

    if (
      lastMessage?.role !== "user" ||
      lastMessage.content !== message
    ) {
      conversation.push({
        role: "user",
        content: message,
      });
    }

    // Limit context to the latest eight messages.
    const recentConversation = conversation.slice(-8);

    // Decide whether this question needs current information.
    const mustSearch = requiresLiveSearch(message);

    // Get the current date in Bangladesh at request time.
    const currentDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const contextualSystemInstruction = `
${systemInstruction}

CURRENT DATE:
Today in Bangladesh is ${currentDate} (Asia/Dhaka timezone).

For questions about current or upcoming events:
- Use browser search when required.
- Check dates against the current date above.
- Verify the year, not just the day and month.
- Never guess if reliable current information is unavailable.
- Provide source URLs when available.
`;

    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
  role: "system",
  content: `${systemInstruction}

CURRENT DATE AND TIME IN BANGLADESH:
${getBangladeshDateTime()}

Use this date and time when interpreting today, tomorrow,
yesterday, live events and upcoming cricket matches.
Never treat an old fixture as upcoming without checking
its date against the current Bangladesh date.`,
},
        ...recentConversation,
      ],

      tools: [
        {
          type: "browser_search",
        },
      ],

      // Current questions require search; ordinary questions
      // can be answered directly when appropriate.
      tool_choice: mustSearch ? "required" : "auto",
      search_settings: /\b(cricket|test match|odi|t20|t20i|innings|wicket|score|run|fixture|bangladesh|west indies|icc|bcb|khela|match|kobe|ajke|porer match|poroborti match)\b/i.test(message)
  ? {
      include_domains: [
        "icc-cricket.com",
        "tigercricket.com.bd"
      ]
    }
  : undefined,

      reasoning_effort: "low",

      temperature: 1,

      max_completion_tokens: 2048,
    });

    const answer = completion.choices[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json(
        {
          error: "No answer was returned. Please try again.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      answer: answer.trim(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("Ask Tahmid API error:", errorMessage);

    if (
      /rate_limit_exceeded|rate limit|tokens per day|429/i.test(
        errorMessage
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Ask Tahmid has reached its API usage limit. Please try again after the limit resets.",
        },
        { status: 429 }
      );
    }

    if (
      /tool choice is required|tool_use_failed|browser_search/i.test(
        errorMessage
      )
    ) {
      return NextResponse.json(
        {
          error:
            "I could not verify the latest information right now. Please try again shortly.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to generate an answer right now. Please try again.",
      },
      { status: 500 }
    );
  }
}
