"use client";

import { createContext, useContext, useState } from "react";

const SidebarContext = createContext({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function ChatLayoutWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(!open), close: () => setOpen(false) }}>
      {/*
        h-dvh (dynamic viewport height) is the fix for iOS Safari: when the
        address bar is visible, 100vh is taller than the visible area and the
        browser scrolls the whole page to reveal more, dragging the chat
        header off-screen. h-dvh locks the shell to exactly what's visible so
        the inner overflow-y-auto owns all scrolling and `sticky top-0` on
        the header actually pins. We keep h-screen as a fallback for browsers
        that don't support dvh yet.
      */}
      <div className="flex h-screen h-dvh overflow-hidden">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
