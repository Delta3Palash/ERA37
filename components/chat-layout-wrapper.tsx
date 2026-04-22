"use client";

import { createContext, useContext, useEffect, useState } from "react";

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

  // Lock the document shell so the chat shell can't be pushed around by body
  // scroll. Previous attempt used `position: fixed; inset: 0` on this
  // wrapper; that pinned the header but hid the bottom input under iOS
  // Safari's chrome because `inset-0` computes against the layout viewport
  // (taller than the visible viewport when the address bar is showing).
  //
  // Instead: clamp html + body to 100% height with overflow:hidden while
  // chat/calendar routes are mounted, and let the wrapper use h-dvh which
  // tracks the dynamic visible viewport. The wrapper stays in normal flow,
  // flex sizing works as expected, and the sticky-bottom input renders at
  // the bottom of the visible area instead of behind the tab bar.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
    };
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(!open), close: () => setOpen(false) }}>
      <div className="flex h-screen h-dvh overflow-hidden">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
