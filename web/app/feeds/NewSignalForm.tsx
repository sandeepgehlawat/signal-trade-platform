"use client";

import { useState } from "react";
import { NeoButton } from "@/components/Neo";
import { api } from "@/lib/api";

export function NewSignalForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setStatus("processing");
    setMessage("Extracting signal...");

    try {
      const result = await api.process(url);
      setStatus("success");
      setMessage(`Signal processed! Run ID: ${result.run_id}`);
      setUrl("");

      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false);
        setStatus("idle");
        setMessage("");
        // Refresh page to show new signal
        window.location.reload();
      }, 2000);
    } catch (err) {
      setStatus("error");
      setMessage("Failed to process. Please check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="neo-button px-4 py-2 text-sm font-medium flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Signal
      </button>
    );
  }

  return (
    <div className="neo-raised p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Submit Custom Signal</h3>
        <button
          onClick={() => {
            setIsOpen(false);
            setStatus("idle");
            setMessage("");
          }}
          className="text-muted hover:text-foreground"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted">Paste URL or text with trading signal</label>
          <textarea
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://twitter.com/... or paste article text"
            className="neo-pressed p-3 text-sm min-h-[100px] resize-none bg-transparent outline-none"
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Supported:</span>
          <span className="neo-raised-sm px-2 py-0.5">Twitter/X</span>
          <span className="neo-raised-sm px-2 py-0.5">YouTube</span>
          <span className="neo-raised-sm px-2 py-0.5">Articles</span>
          <span className="neo-raised-sm px-2 py-0.5">Text</span>
        </div>

        {status !== "idle" && (
          <div
            className={`text-sm p-3 rounded-lg ${
              status === "processing"
                ? "bg-blue-500/10 text-blue-400"
                : status === "success"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {status === "processing" && (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {message}
              </span>
            )}
            {status !== "processing" && message}
          </div>
        )}

        <div className="flex gap-2">
          <NeoButton type="submit" disabled={loading || !url.trim()}>
            {loading ? "Processing..." : "Extract Signal"}
          </NeoButton>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setStatus("idle");
              setMessage("");
            }}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
