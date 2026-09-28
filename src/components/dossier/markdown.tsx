import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Pack-authored markdown. Raw HTML is never rendered (skipHtml), images are
 * disallowed (pack media goes through signed asset URLs instead), and link
 * URLs pass through react-markdown's default protocol allow-list (no
 * javascript:). External links open in a new tab without an opener.
 */
const components: Components = {
  a: ({ href, children }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
        {children}
      </a>
    );
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-dossier", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img", "script", "iframe", "style"]} unwrapDisallowed components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
