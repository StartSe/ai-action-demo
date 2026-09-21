"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Note } from "@/lib/types";
export function Markdown({
  content,
  notes,
  open,
}: {
  content: string;
  notes: Note[];
  open: (n: Note) => void;
}) {
  const text = content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, title, label) => {
      const n = notes.find(
        (n) => n.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
      );
      return n ? `[${label || title}](#memory-${n.id})` : `${label || title}`;
    },
  );
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#memory-") ? (
              <button
                className="wiki-link"
                onClick={() => {
                  const n = notes.find((n) => n.id === href.slice(8));
                  if (n) open(n);
                }}
              >
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
