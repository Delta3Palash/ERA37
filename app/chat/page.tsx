import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted">
      <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
      <p className="text-lg">Select a conversation</p>
      <p className="text-sm mt-1">
        Or connect a platform in{" "}
        <a href="/settings" className="text-accent hover:underline">Settings</a>
      </p>
    </div>
  );
}
