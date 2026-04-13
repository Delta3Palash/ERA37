"use client";

import { useState } from "react";
import { Languages, Check, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  preferredLanguage: string;
  showHeader?: boolean;
}

export function MessageBubble({ message, currentUserId, preferredLanguage, showHeader = true }: MessageBubbleProps) {
  const [translatedText, setTranslatedText] = useState(message.translated_content);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);

  const isOutgoing = message.direction === "outgoing" && message.sent_by === currentUserId;
  const isBridged = message.direction === "bridged";
  const senderName = isOutgoing ? "You" : message.sender_name;

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

  const timestamp = format(new Date(message.created_at), "h:mm a");

  return (
    <div className={`group flex gap-3 px-4 py-0.5 hover:bg-surface-hover/50 ${showHeader ? "mt-3" : ""}`}>
      {/* Avatar column */}
      <div className="w-10 flex-shrink-0">
        {showHeader ? (
          message.sender_avatar ? (
            <img src={message.sender_avatar} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
              isOutgoing ? "bg-accent/20 text-accent" : "bg-surface border border-border text-muted"
            }`}>
              {(senderName || "?")[0].toUpperCase()}
            </div>
          )
        ) : (
          <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity leading-[1.375rem] block text-right">
            {format(new Date(message.created_at), "h:mm")}
          </span>
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${isOutgoing ? "text-accent" : "text-foreground"}`}>
              {senderName || "Unknown"}
            </span>
            {isBridged && (message.metadata as any)?.source_platform && (
              <span className="text-[10px] text-muted flex items-center gap-0.5">
                <ArrowRightLeft className="w-2.5 h-2.5 inline" />
                via {(message.metadata as any).source_platform}
              </span>
            )}
            <span className="text-[10px] text-muted">
              {timestamp}
            </span>
          </div>
        )}

        {/* Image */}
        {message.image_url && (
          <div className="mt-1">
            <img
              src={message.image_url}
              alt=""
              className="rounded-lg max-w-sm max-h-72 object-contain cursor-pointer"
              onClick={() => window.open(message.image_url!, "_blank")}
            />
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Translation */}
        {showTranslation && translatedText && (
          <div className="mt-1 pl-3 border-l-2 border-accent/40">
            <p className="text-xs text-muted mb-0.5 flex items-center gap-1">
              <Check className="w-3 h-3" /> Translated
            </p>
            <p className="text-sm whitespace-pre-wrap break-words text-foreground/70">
              {translatedText}
            </p>
          </div>
        )}

        {/* Translate button — shows on hover */}
        {message.content && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
            <button
              onClick={handleTranslate}
              disabled={translating}
              className={`flex items-center gap-1 text-[10px] transition-colors ${
                showTranslation ? "text-accent" : "text-muted hover:text-accent"
              }`}
              title="Translate"
            >
              <Languages className={`w-3 h-3 ${translating ? "animate-pulse" : ""}`} />
              <span>{showTranslation ? "Hide" : "Translate"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
