"use client";

import { useEffect, useRef, useState } from "react";
import { searchGifs, getTrendingGifs, type GifItem } from "@/lib/tenor";
import { Search, X } from "lucide-react";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending on mount
  useEffect(() => {
    getTrendingGifs(20).then((results) => {
      setGifs(results);
      setLoading(false);
    });
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setLoading(true);
      getTrendingGifs(20).then((results) => {
        setGifs(results);
        setLoading(false);
      });
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchGifs(query.trim(), 20);
      setGifs(results);
      setLoading(false);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid closing on the click that opened the picker
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50"
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-4 h-4 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <button onClick={onClose} className="p-0.5 text-muted hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="h-[280px] overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted">
            Loading...
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted">
            No GIFs found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                className="relative aspect-square overflow-hidden rounded-lg hover:ring-2 hover:ring-accent transition-all"
              >
                <img
                  src={gif.previewUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="px-3 py-1.5 border-t border-border text-center">
        <span className="text-[10px] text-muted">Powered by KLIPY</span>
      </div>
    </div>
  );
}
