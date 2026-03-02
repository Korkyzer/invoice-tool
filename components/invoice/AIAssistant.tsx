"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceAssistantPatch, InvoiceFormState } from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AIAssistantProps {
  state: InvoiceFormState;
  onPatch: (patch: InvoiceAssistantPatch) => void;
}

export function AIAssistant({ state, onPatch }: AIAssistantProps) {
  const [input, setInput] = useState("");
  const [queuedPrompt, setQueuedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const visibleMessages = useMemo(() => messages.slice(-4), [messages]);

  useEffect(() => {
    if (!queuedPrompt) return;

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/ai/fill-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentInvoiceState: state, userInput: queuedPrompt }),
        });

        if (!response.ok) throw new Error("ai_error");
        const result = (await response.json()) as { patch: InvoiceAssistantPatch };
        const patch = result.patch;

        if (!patch || Object.keys(patch).length === 0) {
          toast.error("Je n'ai pas compris, reformule ta demande");
          setMessages((prev) => [...prev, { role: "assistant", text: "Je n'ai pas compris." }]);
        } else {
          onPatch(patch);
          setMessages((prev) => [...prev, { role: "assistant", text: "Modification appliquée." }]);
        }
      } catch {
        toast.error("Je n'ai pas compris, reformule ta demande");
        setMessages((prev) => [...prev, { role: "assistant", text: "Je n'ai pas compris." }]);
      } finally {
        setQueuedPrompt("");
        setLoading(false);
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [onPatch, queuedPrompt, state]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() || loading || queuedPrompt) return;

    const prompt = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    setQueuedPrompt(prompt);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-600" />
        <h3 className="text-sm font-semibold">Assistant IA</h3>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
        {visibleMessages.length === 0 ? (
          <p className="text-xs text-slate-500">
            Exemple: “3 jours de conseil à 600€/jour TVA 20%”
          </p>
        ) : null}
        {visibleMessages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-xs ${
              message.role === "user"
                ? "ml-auto w-fit bg-indigo-600 text-white"
                : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {message.text}
          </div>
        ))}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            IA en train de réfléchir...
          </div>
        ) : null}
      </div>

      <form className="mt-3 space-y-2" onSubmit={handleSubmit}>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Décris les modifications à faire"
          className="min-h-20"
          disabled={loading || Boolean(queuedPrompt)}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={!input.trim() || loading || Boolean(queuedPrompt)}
        >
          Appliquer avec IA
        </Button>
      </form>
    </div>
  );
}
