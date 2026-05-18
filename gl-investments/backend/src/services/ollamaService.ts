import axios from "axios";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const SYSTEM_PROMPT = `You are an expert financial advisor AI for G&L Investments, a self-hosted investment platform.
You provide clear, data-driven insights on stocks, cryptocurrencies, ETFs, and derivatives.
You explain complex financial concepts in accessible terms.
Always remind users that your analysis is for educational purposes and not professional financial advice.
Be concise but thorough. Format numbers clearly. Use bullet points for lists.`;

export async function chat(messages: ChatMessage[]): Promise<string> {
  const payload = {
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    stream: false,
  };

  const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, payload, {
    timeout: 120_000,
  });

  return response.data.message?.content ?? "No response from model.";
}

export async function isAvailable(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
