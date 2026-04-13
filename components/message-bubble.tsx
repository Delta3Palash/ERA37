"use client";

import { useState } from "react";
import { Languages, Check, ArrowRightLeft, Reply } from "lucide-react";
import { format } from "date-fns";
import type { Message } from "@/lib/types";

// Discord-style username colors — deterministic based on name
const USERNAME_COLORS = [
  "#F47B67", // red
  "#E8A55D", // orange
  "#E5D05C", // yellow
  "#5DC27A", // green
  "#54B9C9", // teal
  "#5A9BED", // blue
  "#8D7AED", // purple
  "#E278A3", // pink
  "#E09656", // amber
  "#58C9B9", // mint
  "#7B8CE0", // periwinkle
  "#C27ADB", // violet
];

function getUsernameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  preferredLanguage: string;
  showHeader?: boolean;
  replyToMessage?: Message | null;
  onReply?: (message: Message) => void;
}

export function MessageBubble({ message, currentUserId, preferredLanguage, showHeader = true, replyToMessage, onReply }: MessageBubbleProps) {
  const [translatedText, setTranslatedText] = useState(message.translated_content);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const isOutgoing = message.direction === "outgoing" && message.sent_by === currentUserId;
  const isBridged = message.direction === "bridged";
  const senderName = isOutgoing ? "You" : message.sender_name;

  async function handleTranslate() {
    if (translatedText) {
      setShowTranslation(!showTranslation);
      setTranslateError(null);
      return;
    }

    setTranslating(true);
    setTranslateError(null);
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
      } else {
        const data = await res.json().catch(() => ({ error: "Translation failed" }));
        setTranslateError(data.error || "Translation failed");
      }
    } catch {
      setTranslateError("Network error — could not translate");
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
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{
                backgroundColor: isOutgoing ? "rgba(255,168,0,0.15)" : `${getUsernameColor(senderName || "?")}20`,
                color: isOutgoing ? "var(--accent)" : getUsernameColor(senderName || "?"),
              }}
            >
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
            <span
              className="text-sm font-semibold"
              style={{ color: isOutgoing ? "var(--accent)" : getUsernameColor(senderName || "Unknown") }}
            >
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

        {/* Reply preview */}
        {replyToMessage && (
          <div className="mt-1 mb-0.5 flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-foreground/70 transition-colors">
            <Reply className="w-3 h-3 flex-shrink-0 scale-x-[-1]" />
            <span
              className="font-semibold"
              style={{ color: getUsernameColor(replyToMessage.sender_name || "Unknown") }}
            >
              {replyToMessage.sender_name || "Unknown"}
            </span>
            <span className="truncate max-w-[300px] text-muted">
              {replyToMessage.content || (replyToMessage.image_url ? "Image" : "Message")}
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

        {/* Translation error */}
        {translateError && (
          <p className="text-xs text-red-400 mt-1">{translateError}</p>
        )}

        {/* Action buttons — show on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex items-center gap-3">
          {onReply && (
            <button
              onClick={() => onReply(message)}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors"
              title="Reply"
            >
              <Reply className="w-3 h-3 scale-x-[-1]" />
              <span>Reply</span>
            </button>
          )}
          {message.content && (
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
          )}
        </div>
      </div>
    </div>
  );
}
