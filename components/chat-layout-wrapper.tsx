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
        Lock the chat shell to the viewport edges. Root layout has
        `body.min-h-full flex flex-col` which lets body grow past the
        viewport on some mobile layouts — when that happens the whole page
        scrolls and drags the chat header offscreen, even with h-dvh +
        sticky. Going `fixed inset-0` here takes the shell out of body
        flow entirely so no amount of body growth can push it around.
        h-dvh is retained as a hint for browsers that need it.
      */}
      <div className="fixed inset-0 flex h-screen h-dvh overflow-hidden">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
