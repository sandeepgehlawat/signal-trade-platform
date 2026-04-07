import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function NeoCard({ className = "", children, ...rest }: DivProps) {
  return (
    <div className={`neo-raised p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function NeoStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="neo-raised-sm p-5 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function NeoButton({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`neo-button px-5 py-3 text-sm font-medium text-foreground active:neo-button-active disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function NeoInput({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`neo-pressed w-full px-5 py-3 text-sm text-foreground placeholder:text-muted outline-none ${className}`}
      {...rest}
    />
  );
}

export function NeoBadge({
  tone = "neutral",
  children,
}: {
  tone?: "bull" | "bear" | "neutral";
  children: ReactNode;
}) {
  const color =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-neutral";
  return (
    <span
      className={`neo-raised-sm px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color}`}
    >
      {children}
    </span>
  );
}
