import { Suspense } from "react";
import { JoinForm } from "@/components/join-form";

export const dynamic = "force-dynamic";

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen items-center justify-center">
          <span className="text-muted">Loading...</span>
        </div>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
