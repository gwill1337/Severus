import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { parseMessage } from "../../utils/parseMessage";
import { CodeBlock } from "./CodeBlock";

const INLINE =
  /(`[^`\n]+`|https?:\/\/[^\s<>`]+|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~)/g;

const count = (s: string, ch: string) => s.split(ch).length - 1;

function splitTrailing(raw: string): [url: string, tail: string] {
  let url = raw;
  let tail = "";
  while (url.length > 0) {
    const last = url[url.length - 1];
    const unbalancedParen = last === ")" && count(url, ")") > count(url, "(");
    if (/[.,;:!?'"]/.test(last) || unbalancedParen) {
      tail = last + tail;
      url = url.slice(0, -1);
    } else {
      break;
    }
  }
  return [url, tail];
}

function toSafeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <button
      type="button"
      title={url}
      onClick={() => openUrl(url).catch((e) => console.error("Open URL failed:", e))}
      className="inline text-sky-400 underline underline-offset-2 hover:text-sky-300 break-all text-left cursor-pointer"
    >
      {label}
    </button>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;

    const key = `${keyPrefix}-${i}`;

    if (part.startsWith("`")) {
      return (
        <code key={key} className="px-1 rounded bg-black/50 text-emerald-300 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("http")) {
      const [raw, tail] = splitTrailing(part);
      const safe = toSafeUrl(raw);
      if (!safe) return part;
      return (
        <span key={key}>
          <ExternalLink url={safe} label={raw} />
          {tail}
        </span>
      );
    }

    if (part.startsWith("**")) {
      return <strong key={key} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("~~")) {
      return <del key={key} className="opacity-60">{part.slice(2, -2)}</del>;
    }
    return <em key={key}>{part.slice(1, -1)}</em>;
  });
}

export function MessageBody({ body }: { body: string }) {
  return (
    <>
      {parseMessage(body).map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} code={seg.code} lang={seg.lang} />
        ) : (
          <span key={i}>{renderInline(seg.text, String(i))}</span>
        )
      )}
    </>
  );
}