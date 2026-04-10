import { Suspense } from "react";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen items-center justify-center px-4">
          <div className="text-muted">Loading...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
