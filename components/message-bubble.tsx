"use client";

import { useState } from "react";
import { Languages, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  preferredLanguage: string;
}

export function MessageBubble({ message, preferredLanguage }: MessageBubbleProps) {
  const [translatedText, setTranslatedText] = useState(message.translated_content);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);

  const isOutgoing = message.direction === "outgoing";

  async function handleTranslate() {
    if (translatedText) {
      setShowTranslation(!showTranslation);
      return;
    }

    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message.id,
          text: message.content,
          targetLanguage: preferredLanguage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTranslatedText(data.translatedText);
        setShowTranslation(true);
      }
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"} mb-2`}>
      {/* Sender name for incoming */}
      {!isOutgoing && message.sender_name && (
        <span className="text-xs text-muted ml-1 mb-0.5">
          {message.sender_name}
        </span>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isOutgoing
            ? "bg-accent text-black rounded-br-md"
            : "bg-surface border border-border rounded-bl-md"
        }`}
      >
        {/* Original content */}
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {/* Translation */}
        {showTranslation && translatedText && (
          <div className={`mt-2 pt-2 border-t ${
            isOutgoing ? "border-black/20" : "border-border"
          }`}>
            <p className="text-xs text-muted mb-0.5 flex items-center gap-1">
              <Check className="w-3 h-3" /> Translated
            </p>
            <p className="text-sm whitespace-pre-wrap break-words opacity-80">
              {translatedText}
            </p>
          </div>
        )}
      </div>

      {/* Meta row: time + translate */}
      <div className="flex items-center gap-2 mt-0.5 mx-1">
        <span className="text-[10px] text-muted">
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </span>
        {message.content && !isOutgoing && (
          <button
            onClick={handleTranslate}
            disabled={translating}
            className={`text-muted hover:text-accent transition-colors ${
              showTranslation ? "text-accent" : ""
            }`}
            title="Translate"
          >
            <Languages className={`w-3 h-3 ${translating ? "animate-pulse" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
}
