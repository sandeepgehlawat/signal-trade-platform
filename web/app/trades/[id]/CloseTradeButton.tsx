"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NeoButton } from "@/components/Neo";
import { api } from "@/lib/api";

export function CloseTradeButton({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (busy) return;
    if (!confirm("Close this trade?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.closeTrade(tradeId);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <NeoButton onClick={close} disabled={busy}>
        {busy ? "Closing…" : "Close trade"}
      </NeoButton>
      {error && <span className="text-xs text-bear">{error}</span>}
    </div>
  );
}
