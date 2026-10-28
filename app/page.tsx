
"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = "ask-tahmid-conversations";

const suggestions = [
  {
    title: "History of Bangladesh",
    description: "Explore our history and independence.",
    prompt: "Explain the history of Bangladesh and its independence.",
    icon: "📚",
  },
  {
    title: "Universities & Admission",
    description: "Find admission requirements and deadlines.",
    prompt: "Tell me about NSU admission requirements in Bangladesh.",
    icon: "🎓",
  },
  {
    title: "Explore Bangladesh",
    description: "Discover places, cities and landmarks.",
    prompt: "Tell me about interesting places to visit in Bangladesh.",
    icon: "📍",
  },
  {
    title: "Latest News",
    description: "Learn about current events in Bangladesh.",
    prompt: "Tell me about the latest news in Bangladesh.",
    icon: "📰",
  },
];

function cleanAnswer(text: string) {
  return text
    .replace(/【\s*\d+†L\d+(?:-L?\d+)?\s*】/g, "")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldRefocusInput = useRef(false);

  // Load saved conversations when the app opens.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is Conversation =>
              typeof item?.id === "string" &&
              typeof item?.title === "string" &&
              Array.isArray(item?.messages) &&
              typeof item?.updatedAt === "number"
          );

          valid.sort((a, b) => b.updatedAt - a.updatedAt);

          setConversations(valid);

          if (valid.length > 0) {
            setActiveConversationId(valid[0].id);
            setMessages(valid[0].messages);
          }
        }
      }
    } catch (error) {
      console.error("Could not load saved chats:", error);
    }

    setIsHydrated(true);
  }, []);

  // Save conversations whenever they change.
  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(conversations)
      );
    } catch (error) {
      console.error("Could not save conversations:", error);
    }
  }, [conversations, isHydrated]);

  // Automatically scroll to the newest message.
  useEffect(() => {
    const container = chatScrollRef.current;

    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading]);

  // Focus the input after the AI finishes answering.
  useEffect(() => {
    if (!isLoading && shouldRefocusInput.current) {
      textareaRef.current?.focus();
      shouldRefocusInput.current = false;
    }
  }, [isLoading, messages]);

  function openConversation(conversation: Conversation) {
    if (isLoading) return;

    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput("");
  }

  function startNewChat() {
    if (isLoading) return;

    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }

  function deleteConversation(
    event: React.MouseEvent<HTMLButtonElement>,
    conversationId: string
  ) {
    event.stopPropagation();

    if (isLoading) return;

    const remaining = conversations.filter(
      (chat) => chat.id !== conversationId
    );

    setConversations(remaining);

    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setInput("");
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const question = input.trim();

    if (!question || isLoading) return;

    const conversationId =
      activeConversationId ?? crypto.randomUUID();

    const existing = conversations.find(
      (chat) => chat.id === conversationId
    );

    const title = existing?.title ??
      (question.length > 42
        ? question.slice(0, 42) + "..."
        : question);

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: question },
    ];

    shouldRefocusInput.current = true;

    setActiveConversationId(conversationId);
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const updatedConversation: Conversation = {
      id: conversationId,
      title,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    setConversations((previous) =>
      [
        updatedConversation,
        ...previous.filter(
          (chat) => chat.id !== conversationId
        ),
      ]
    );

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
          messages: updatedMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to get an answer. Please try again."
        );
      }

      const answer =
        typeof data.answer === "string"
          ? cleanAnswer(data.answer)
          : "";

      if (!answer) {
        throw new Error("The AI returned an empty answer.");
      }

      const finalMessages: Message[] = [
        ...updatedMessages,
        { role: "assistant", content: answer },
      ];

      setMessages(finalMessages);

      setConversations((previous) => {
        const updated: Conversation = {
          id: conversationId,
          title,
          messages: finalMessages,
          updatedAt: Date.now(),
        };

        return [
          updated,
          ...previous.filter(
            (chat) => chat.id !== conversationId
          ),
        ];
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      const errorMessages: Message[] = [
        ...updatedMessages,
        {
          role: "assistant",
          content: `Sorry, I couldn't answer your question. ${errorMessage}`,
        },
      ];

      setMessages(errorMessages);

      setConversations((previous) => [
        {
          id: conversationId,
          title,
          messages: errorMessages,
          updatedAt: Date.now(),
        },
        ...previous.filter(
          (chat) => chat.id !== conversationId
        ),
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex h-dvh w-full overflow-hidden bg-white text-slate-900">

      {/* Sidebar */}
      <aside className="hidden h-dvh w-72 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50 p-4 md:flex">

        <div className="mb-7 flex shrink-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-bold text-white">
            A
          </div>

          <div>
            <h1 className="text-lg font-bold">Ask Tahmid</h1>
            <p className="text-xs text-slate-500">
              Bangladesh AI Assistant
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startNewChat}
          disabled={isLoading}
          className="mb-7 flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-emerald-50 disabled:opacity-50"
        >
          <span className="text-lg">+</span>
          New conversation
        </button>

        {/* Independently scrollable chat history */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Chat history
          </p>

          {!isHydrated ? (
            <p className="px-2 py-3 text-sm text-slate-400">
              Loading conversations...
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-sm leading-6 text-slate-400">
              Your previous conversations will appear here.
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-center gap-1 rounded-xl transition ${
                    activeConversationId === conversation.id
                      ? "bg-emerald-100"
                      : "hover:bg-slate-200/70"
                  }`}
                >
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => openConversation(conversation)}
                    title={conversation.title}
                    className="min-w-0 flex-1 px-3 py-3 text-left text-sm disabled:opacity-50"
                  >
                    <span className="block truncate font-medium">
                      {conversation.title}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={(event) =>
                      deleteConversation(event, conversation.id)
                    }
                    aria-label={`Delete ${conversation.title}`}
                    title="Delete conversation"
                    className="mr-1 rounded-lg px-2 py-2 text-slate-400 opacity-100 transition hover:bg-white hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 disabled:hidden"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pinned at the bottom of the sidebar */}
        <div className="shrink-0 border-t border-slate-200 pt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold">Built by Tahmid</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              An AI project focused on Bangladesh.
            </p>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <section className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        <header className="z-10 flex h-[76px] shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white md:hidden">
              A
            </div>

            <div>
              <h2 className="font-semibold">Ask Tahmid</h2>
              <p className="text-xs text-slate-500">
                Your Bangladesh AI assistant
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Bangladesh focused
          </div>
        </header>

        {/* Scrollable conversation */}
        <div
          ref={chatScrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-5 py-8 sm:px-8">

            {messages.length === 0 ? (
              <div className="my-auto py-6">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-700 text-3xl text-white shadow-lg shadow-emerald-100">
                  🇧🇩
                </div>

                <p className="mb-3 text-sm font-semibold text-emerald-700">
                  YOUR BANGLADESH AI ASSISTANT
                </p>

                <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  Hello, what would you like to{" "}
                  <span className="text-emerald-700">
                    know about Bangladesh?
                  </span>
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-500">
                  Explore Bangladesh&apos;s history, universities,
                  culture, geography and current affairs — all in one place.
                </p>

                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setInput(item.prompt)}
                      className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <h3 className="mt-4 text-sm font-semibold">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {item.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {messages.map((message, index) => (
                  <div
                    key={`${index}-${message.role}`}
                    className={`flex gap-3 ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">
                        A
                      </div>
                    )}

                    <div
                      className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[85%] ${
                        message.role === "user"
                          ? "bg-emerald-700 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">
                      A
                    </div>
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                    >
                      Ask Tahmid is thinking...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Fixed message input */}
        <footer className="z-10 shrink-0 border-t border-slate-100 bg-white px-4 pb-3 pt-4 sm:px-8">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-4xl items-end gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-emerald-400"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask anything about Bangladesh..."
              aria-label="Your question"
              rows={1}
              disabled={isLoading}
              className="max-h-32 min-h-11 flex-1 resize-y bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-400 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-xl text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? "…" : "↑"}
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-slate-400">
            Ask Tahmid · Bangladesh-focused AI project
          </p>
        </footer>
      </section>
    </main>
  );
}
