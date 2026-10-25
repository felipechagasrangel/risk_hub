import { useEffect, useState } from "react";

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const msg = typeof detail.detail === "string" ? detail.detail : `Erro ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

/** Chama a API sempre que `body` muda (com debounce), para os laboratórios reagirem em tempo real. */
export function useCompute<T>(path: string, body: unknown, delay = 250) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(body);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      post<T>(path, body)
        .then((d) => { if (!cancelled) { setData(d); setError(null); } })
        .catch((e: Error) => { if (!cancelled) setError(e.message); });
    }, delay);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, delay]);

  return { data, error };
}
