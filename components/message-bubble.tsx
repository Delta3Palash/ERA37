"use client";

import { useState } from "react";
import { Languages, Check, ArrowRightLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  preferredLanguage: string;
}

export function MessageBubble({ message, currentUserId, preferredLanguage }: MessageBubbleProps) {
  const [translatedText, setTranslatedText] = useState(message.translated_content);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);

  const isOutgoing = message.direction === "outgoing" && message.sent_by === currentUserId;
  const isBridged = message.direction === "bridged";

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
      {/* Sender name + avatar for incoming/bridged */}
      {!isOutgoing && message.sender_name && (
        <div className="flex items-center gap-1.5 ml-1 mb-0.5">
          {isBridged && (
            <ArrowRightLeft className="w-3 h-3 text-muted" />
          )}
          {message.sender_avatar && (
            <img src={message.sender_avatar} alt="" className="w-4 h-4 rounded-full" />
          )}
          <span className="text-xs text-muted">
            {message.sender_name}
            {isBridged && (message.metadata as any)?.source_platform && (
              <span className="opacity-60"> via {(message.metadata as any).source_platform}</span>
            )}
          </span>
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isOutgoing
            ? "bg-accent text-black rounded-br-md"
            : "bg-surface border border-border rounded-bl-md"
        }`}
      >
        {/* Image */}
        {message.image_url && (
          <div className="mb-2">
            <img
              src={message.image_url}
              alt="Shared image"
              className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer"
              onClick={() => window.open(message.image_url!, "_blank")}
            />
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

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

      {/* Meta: time + translate */}
      <div className="flex items-center gap-2 mt-0.5 mx-1">
        <span className="text-[10px] text-muted">
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </span>
        {message.content && (
          <button
            onClick={handleTranslate}
            disabled={translating}
            className={`flex items-center gap-0.5 text-[10px] transition-colors ${
              showTranslation ? "text-accent" : "text-muted hover:text-accent"
            }`}
            title="Translate"
          >
            <Languages className={`w-3.5 h-3.5 ${translating ? "animate-pulse" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
}
