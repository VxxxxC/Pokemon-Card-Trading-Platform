export function highlightSensitiveKeywords(text: string): React.ReactNode {
  const regex = /(PayMe|FPS|轉數快|WhatsApp|https?:\/\/\S+|[569]\d{3}[\s-]?\d{4})/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  text.replace(regex, (match, _group, offset) => {
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset));
    }
    parts.push(
      <span
        key={`${offset}-${match}`}
        className="rounded bg-[#ef4444]/10 px-1 text-[#ef4444]"
      >
        {match}
      </span>,
    );
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
