/**
 * Markdown + math renderer — split into its own lazy chunk.
 *
 * react-markdown + remark-math + rehype-katex + the KaTeX CSS/fonts are the
 * heaviest part of the bundle and are only needed once an assistant reply
 * renders, so they load behind a dynamic import (see message-bubble.tsx).
 * Keep ALL katex/markdown imports inside this module — importing them
 * anywhere in the eager graph would pull them back into the main chunk.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      // remark-gfm: tables, strikethrough, task lists, autolinks —
      // without it GFM tables render as raw pipe text (GFM regression guard).
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Wide tables scroll inside their own wrapper — the bubble/page
        // must never scroll horizontally (375px rule).
        table: (props) => (
          <div className="my-2 max-w-full overflow-x-auto">
            <table {...props} />
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
