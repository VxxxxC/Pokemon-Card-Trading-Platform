type ChatUnreadDotProps = {
  className?: string;
  glow?: boolean;
};

export function ChatUnreadDot({
  className = "",
  glow = false,
}: ChatUnreadDotProps) {
  return (
    <span
      data-testid="chat-unread-dot"
      className={`absolute top-1.5 right-1.5 w-2 h-2 bg-[#10b981] rounded-full shrink-0 ${
        glow ? "shadow-[0_0_8px_#10b981]" : ""
      } ${className}`.trim()}
      aria-hidden
    />
  );
}

export function ChatUnreadDotInline({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="chat-unread-dot"
      className={`w-1.5 h-1.5 bg-[#10b981] rounded-full shrink-0 ${className}`.trim()}
      aria-hidden
    />
  );
}
