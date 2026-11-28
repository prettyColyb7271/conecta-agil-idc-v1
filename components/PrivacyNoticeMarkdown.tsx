import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\[CONFIRMAR[^\]]*\]|\[ACTUALIZAR[^\]]*\]|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("[CONFIRMAR") || token.startsWith("[ACTUALIZAR")) {
      return <mark key={key} className="rounded bg-yellow-200 px-1 font-semibold text-yellow-950">{token}</mark>;
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{inline(token.slice(2, -2), key)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={key}>{inline(token.slice(1, -1), key)}</em>;
    }
    return <span key={key}>{token}</span>;
  });
}

function startsBlock(line: string): boolean {
  return /^#{1,2}\s|^>\s|^[-*]\s|^\d+\.\s|^---$/.test(line);
}

export default function PrivacyNoticeMarkdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || line === "---") {
      index += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(<h1 key={`h1-${index}`} className="text-2xl font-extrabold text-[#0d1f33]">{inline(line.slice(2), `h1-${index}`)}</h1>);
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={`h2-${index}`} className="border-b border-slate-200 pb-1 text-lg font-bold text-[#0d1f33]">{inline(line.slice(3), `h2-${index}`)}</h2>);
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`} className="rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">{inline(quote.join(" "), `quote-${index}`)}</blockquote>);
      continue;
    }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].trim();
        const matches = ordered ? /^\d+\.\s/ : /^[-*]\s/;
        if (!matches.test(item)) break;
        items.push(<li key={`item-${index}`}>{inline(item.replace(matches, ""), `item-${index}`)}</li>);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`space-y-1 pl-6 text-sm leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`}>{items}</List>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`} className="text-sm leading-relaxed text-slate-800">{inline(paragraph.join(" "), `p-${index}`)}</p>);
  }

  return <div className="space-y-4">{blocks}</div>;
}
