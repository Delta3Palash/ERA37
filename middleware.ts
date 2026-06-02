import { NextResponse, type NextRequest } from "next/server";

// =============================================================
// MAINTENANCE MODE
// =============================================================
// This file has been temporarily reduced to return a 503 for every
// request. The normal middleware (Supabase auth gate + TOS gate) is
// preserved in git history — revert the PR that introduced this file
// to bring the app back up. Vercel will redeploy automatically and
// traffic will resume.
//
// All infrastructure (Supabase data, GCP key, env vars, deployments,
// domains, Vercel project) is untouched while paused.

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ERA37 — Be right back</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #0e0e10;
    color: #ededee;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .card { max-width: 480px; text-align: center; }
  h1 {
    margin: 0 0 1rem;
    font-size: 1.75rem;
    font-weight: 700;
    color: #FFA800;
    letter-spacing: -0.01em;
  }
  p { margin: 0.5rem 0; color: #a0a0a8; line-height: 1.5; }
  .quiet { font-size: 0.85rem; color: #6b6b73; margin-top: 1.5rem; }
</style>
</head>
<body>
<div class="card">
  <h1>ERA37 is paused</h1>
  <p>The alliance chat bridge is temporarily offline.</p>
  <p>We'll be back.</p>
  <p class="quiet">If you're a Rohan alliance member and need to reach leadership, message Archer_13 in-game.</p>
</div>
</body>
</html>`;

export function middleware(_request: NextRequest) {
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "86400",
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
