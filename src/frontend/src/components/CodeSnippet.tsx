import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { useEffect, useState } from "react";
import { get } from "../api";
import { Icon } from "./icons";

hljs.registerLanguage("python", python);

type Source = { name: string; module: string; code: string };

/**
 * Mostra o código Python de uma função do backend. O código vem da própria API (inspect.getsource),
 * então é sempre o mesmo que calcula os números do laboratório.
 */
export function CodeSnippet({ name, caption, open = false }: { name: string; caption?: string; open?: boolean }) {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    get<Source>(`/source/${name}`).then(setSource).catch((e: Error) => setError(e.message));
  }, [name]);

  const copy = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem permissão de área de transferência: o usuário ainda pode selecionar o texto
    }
  };

  return (
    <details className="snippet" open={open}>
      <summary>
        <Icon name="code" size={16} />
        <span className="snippet-title"><code>{name}()</code>{caption && <span className="muted"> — {caption}</span>}</span>
        <span className="snippet-module">{source?.module}</span>
      </summary>
      {error && <p className="error" style={{ padding: "0 16px" }}>{error}</p>}
      {source && (
        <div className="snippet-body">
          <button className="snippet-copy" onClick={copy}>{copied ? "Copiado ✓" : "Copiar"}</button>
          <pre><code className="hljs" dangerouslySetInnerHTML={{
            __html: hljs.highlight(source.code, { language: "python" }).value,
          }} /></pre>
        </div>
      )}
    </details>
  );
}
