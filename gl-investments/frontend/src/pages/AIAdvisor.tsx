import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader } from "lucide-react";
import { aiApi, type ChatMessage } from "../services/api";

const STARTER_PROMPTS = [
  "What are the best ETFs for long-term growth?",
  "Explain options trading risk management",
  "Compare Bitcoin vs gold as an inflation hedge",
  "How should I diversify a $10k portfolio?",
];

export default function AIAdvisor() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your G&L Investments AI advisor, running locally on your machine via Ollama. Ask me anything about stocks, crypto, ETFs, derivatives, or investing strategy.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data } = await aiApi.chat(next);
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't reach the AI engine. Make sure Ollama is running (`ollama serve`) and the `llama3.1:8b` model is pulled.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-2xl font-semibold">AI Advisor</h2>
        <p className="text-gray-500 text-sm mt-1">
          Powered by Ollama llama3.1:8b — 100% local, no data leaves your machine
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                m.role === "assistant" ? "bg-brand-600" : "bg-gray-700"
              }`}
            >
              {m.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "assistant"
                  ? "bg-gray-900 border border-gray-800"
                  : "bg-brand-600"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3">
              <Loader size={16} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full px-3 py-1.5 text-gray-300 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="p-4 border-t border-gray-800 flex gap-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any investment..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
