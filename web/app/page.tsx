import Link from "next/link";
import { NeoCard, NeoButton } from "@/components/Neo";
import { InstallSkillButton } from "./InstallSkillButton";

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="neo-raised-sm p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full neo-pressed flex items-center justify-center text-xs font-semibold text-accent">
          {n}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="neo-raised-sm p-5 flex flex-col gap-3">
      <span className="text-2xl">{icon}</span>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function VenueCard({ name, type, icon }: { name: string; type: string; icon: string }) {
  return (
    <div className="neo-raised-sm p-4 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="font-medium text-sm">{name}</p>
        <p className="text-xs text-muted">{type}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8 sm:gap-10">
      {/* Hero Section */}
      <section className="neo-raised p-6 sm:p-10 flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <span className="neo-raised-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent">
            AI Skill
          </span>
          <span className="text-xs text-muted">
            Claude Code · Opencode · any LLM CLI
          </span>
        </div>
        <div className="flex flex-col gap-3 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Extract trading signals from any content with AI.
          </h1>
          <p className="text-sm sm:text-base text-muted leading-relaxed">
            Signal Trade is an AI skill that analyzes tweets, YouTube videos, and articles
            to extract trading theses. It identifies direction, assets, confidence levels,
            and routes signals to the right venue — Hyperliquid perps, Polymarket predictions,
            or OKX X Layer spot swaps.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/feeds">
            <NeoButton>View Live Signals</NeoButton>
          </Link>
          <Link href="/pricing">
            <NeoButton>Get API Access</NeoButton>
          </Link>
        </div>

        {/* Works In Section */}
        <div className="flex flex-col items-center gap-4 py-6 border-t border-b border-muted/20">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-1">Install the Skill</h3>
            <p className="text-sm text-muted">Works in Claude Code, Opencode, Codex, and any LLM CLI</p>
          </div>
          <InstallSkillButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <HowStep n="1" title="Extract" body="Paste any URL or text. Content is fetched and parsed automatically." />
          <HowStep n="2" title="Analyze" body="AI extracts trading theses with direction, assets, and confidence scores." />
          <HowStep n="3" title="Route" body="Signals route to perps, prediction markets, or spot based on thesis type." />
        </div>
      </section>

      {/* Supported Venues */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold">Supported Venues</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <VenueCard
            name="Hyperliquid"
            type="Perpetual Futures"
            icon="📈"
          />
          <VenueCard
            name="Polymarket"
            type="Prediction Markets"
            icon="🎯"
          />
          <VenueCard
            name="OKX X Layer"
            type="DEX Spot Swaps"
            icon="⭕"
          />
        </div>
      </section>

      {/* Features */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            icon="🐦"
            title="Multi-Source Extraction"
            body="Extract signals from Twitter/X, YouTube videos, articles, PDFs, and plain text."
          />
          <FeatureCard
            icon="🧠"
            title="AI-Powered Analysis"
            body="LLM identifies bullish/bearish direction, target assets, confidence levels, and time horizons."
          />
          <FeatureCard
            icon="🔀"
            title="Smart Routing"
            body="Automatically routes each thesis to the best venue based on signal type and asset."
          />
          <FeatureCard
            icon="⚡"
            title="Real-Time Signals"
            body="Pro subscribers get instant signal delivery via SSE stream. Free tier has 5-minute delay."
          />
          <FeatureCard
            icon="🔑"
            title="API Access"
            body="Connect your trading bots with our REST API and real-time SSE feed endpoints."
          />
          <FeatureCard
            icon="🛡️"
            title="Risk Filters"
            body="Built-in confidence thresholds, author tracking, and signal quality scoring."
          />
        </div>
      </section>

      {/* Supported Sources */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold">Supported Content Sources</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <NeoCard className="p-4 text-center">
            <span className="text-2xl mb-2 block">🐦</span>
            <p className="text-sm font-medium">Twitter/X</p>
          </NeoCard>
          <NeoCard className="p-4 text-center">
            <span className="text-2xl mb-2 block">📺</span>
            <p className="text-sm font-medium">YouTube</p>
          </NeoCard>
          <NeoCard className="p-4 text-center">
            <span className="text-2xl mb-2 block">📰</span>
            <p className="text-sm font-medium">Articles</p>
          </NeoCard>
          <NeoCard className="p-4 text-center">
            <span className="text-2xl mb-2 block">📝</span>
            <p className="text-sm font-medium">Plain Text</p>
          </NeoCard>
        </div>
      </section>

      {/* CTA */}
      <section className="neo-raised p-6 sm:p-8 text-center flex flex-col gap-4 items-center">
        <h2 className="text-2xl font-semibold">Ready to extract signals?</h2>
        <p className="text-muted max-w-md">
          Install the skill in your LLM CLI and start extracting trading signals from any content.
        </p>
        <div className="flex gap-3">
          <Link href="/feeds">
            <NeoButton>View Live Feed</NeoButton>
          </Link>
          <Link href="/pricing">
            <NeoButton>See Pricing</NeoButton>
          </Link>
        </div>
      </section>
    </div>
  );
}
