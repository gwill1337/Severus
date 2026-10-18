export type Segment =
  | { type: "text"; text: string }
  | { type: "code"; lang: string | null; code: string };

const FENCE = /```(?:([\w+-]+)\r?\n)?([\s\S]*?)```/g;

export function parseMessage(body: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const m of body.matchAll(FENCE)) {
    const start = m.index ?? 0;

    if (start > last) {
      segments.push({ type: "text", text: body.slice(last, start) });
    }

    const code = m[2].replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    segments.push({ type: "code", lang: m[1] ?? null, code });

    last = start + m[0].length;
  }

  if (last < body.length) {
    segments.push({ type: "text", text: body.slice(last) });
  }

  return segments;
}