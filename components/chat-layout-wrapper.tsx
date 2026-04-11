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
      <div className="flex h-screen overflow-hidden">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
