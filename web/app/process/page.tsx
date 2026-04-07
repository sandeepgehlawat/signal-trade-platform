"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NeoCard, NeoButton, NeoInput, NeoBadge } from "@/components/Neo";
import { api, type StreamEvent } from "@/lib/api";

export default function ProcessPage() {
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    setEvents([]);
    setRunId(null);
    esRef.current?.close();

    try {
      const { run_id } = await api.process(input.trim());
      setRunId(run_id);

      const es = new EventSource(api.streamUrl(run_id));
      esRef.current = es;
      es.onmessage = (ev) => {
        try {
          const parsed: StreamEvent = JSON.parse(ev.data);
          setEvents((prev) => [...prev, parsed]);
          if (parsed.type === "source_complete" || parsed.type === "error") {
            es.close();
            setBusy(false);
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        setBusy(false);
      };
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New Signal</h1>
        <p className="text-sm text-muted mt-1">
          Paste a tweet, YouTube link, article URL, or raw text.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <NeoInput
          placeholder="https://x.com/... or paste any text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <div className="flex items-center gap-3">
          <NeoButton type="submit" disabled={busy || !input.trim()}>
            {busy ? "Processing…" : "Process Signal"}
          </NeoButton>
          {runId && <span className="text-xs text-muted">run: {runId}</span>}
        </div>
      </form>

      {error && (
        <NeoCard className="text-bear text-sm">{error}</NeoCard>
      )}

      {events.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Live stream</h2>
          <NeoCard className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            {events.map((ev, i) => (
              <EventRow key={i} ev={ev} />
            ))}
          </NeoCard>
          {events.some((e) => e.type === "trade_posted") && (
            <Link href="/trades" className="text-sm text-muted hover:text-foreground">
              View trades →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: StreamEvent }) {
  const tone =
    ev.type === "error"
      ? "bear"
      : ev.type === "trade_posted" || ev.type === "source_complete"
      ? "bull"
      : "neutral";
  return (
    <div className="flex items-start gap-3 text-sm">
      <NeoBadge tone={tone}>{ev.type.replace(/_/g, " ")}</NeoBadge>
      <pre className="flex-1 text-xs text-muted whitespace-pre-wrap break-words font-mono">
        {ev.data ? JSON.stringify(ev.data, null, 0) : ""}
      </pre>
    </div>
  );
}
