import { Highlight, themes, type PrismTheme } from "prism-react-renderer";
import { useClipboard } from "../../hooks/useClipboard";

// фон делаем прозрачным: его задаёт контейнер
const theme: PrismTheme = {
  ...themes.vsDark,
  plain: { ...themes.vsDark.plain, backgroundColor: "transparent" },
};

// короткие имена, которых нет среди алиасов Prism
const ALIASES: Record<string, string> = {
  rs: "rust",
  golang: "go",
  "c++": "cpp",
  jsonc: "json",
  json5: "json",
  htm: "markup",
};

function normalizeLang(lang: string | null): string {
  if (!lang) return "plain";
  const l = lang.toLowerCase();
  return ALIASES[l] ?? l;
}

interface Props {
  code: string;
  lang: string | null;
}

export function CodeBlock({ code, lang }: Props) {
  const { copied, copy } = useClipboard();

  return (
    <div className="my-2 rounded border border-white/10 bg-black/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/5 text-[10px] uppercase tracking-widest text-gray-500">
        <span>{lang ?? "code"}</span>
        <button
          type="button"
          onClick={() => copy(code)}
          className="hover:text-potion-glow transition-colors cursor-pointer"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <Highlight theme={theme} code={code} language={normalizeLang(lang)}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="p-3 overflow-x-auto text-sm whitespace-pre">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, k) => (
                  <span key={k} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}