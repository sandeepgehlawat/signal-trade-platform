import Link from "next/link";
import { NeoCard, NeoButton } from "@/components/Neo";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with delayed signals",
    features: [
      "5 minute signal delay",
      "1 connection limit",
      "50 signals per day",
      "Basic signal data",
      "Community support",
    ],
    cta: "Get Started",
    href: "/feeds",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$5",
    period: "per week",
    description: "Real-time signals for serious traders",
    features: [
      "Real-time signals (no delay)",
      "5 concurrent connections",
      "Unlimited signals",
      "Full signal metadata",
      "Execution priority hints",
      "API access",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    href: "/feeds",
    highlighted: true,
  },
];

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      {/* Header */}
      <div className="text-center flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Back
          </Link>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold">Simple Pricing</h1>
        <p className="text-muted max-w-xl mx-auto">
          Start free with delayed signals. Upgrade for real-time access and unlimited connections.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {TIERS.map((tier) => (
          <NeoCard
            key={tier.name}
            className={`p-6 flex flex-col gap-6 ${
              tier.highlighted ? "ring-2 ring-accent" : ""
            }`}
          >
            {tier.highlighted && (
              <span className="neo-raised-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent self-start">
                Most Popular
              </span>
            )}

            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-muted">/{tier.period}</span>
              </div>
              <p className="text-sm text-muted">{tier.description}</p>
            </div>

            <ul className="flex flex-col gap-3 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <CheckIcon />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Link href={tier.href}>
              <NeoButton className="w-full justify-center">
                {tier.cta}
              </NeoButton>
            </Link>
          </NeoCard>
        ))}
      </div>

      {/* FAQ Section */}
      <div className="flex flex-col gap-6 mt-8">
        <h2 className="text-xl font-semibold text-center">Frequently Asked Questions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">What sources do you support?</h3>
            <p className="text-sm text-muted">
              We extract signals from Twitter/X, YouTube, news articles, and direct text input.
              Our AI analyzes content and extracts actionable trading theses.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">How does execution priority work?</h3>
            <p className="text-sm text-muted">
              Signals include recommended execution venues: OKX OnchainOS for spot,
              Hyperliquid for perps, and Polymarket for prediction markets.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
            <p className="text-sm text-muted">
              Yes! Pro subscriptions are billed weekly and you can cancel anytime.
              Your access continues until the end of the billing period.
            </p>
          </NeoCard>

          <NeoCard className="p-4">
            <h3 className="font-semibold mb-2">What's the signal delay?</h3>
            <p className="text-sm text-muted">
              Free tier signals are delayed by 5 minutes. Pro subscribers receive
              signals instantly as they're published.
            </p>
          </NeoCard>
        </div>
      </div>

      {/* Live Sources Section */}
      <div className="flex flex-col gap-4 mt-4">
        <h2 className="text-xl font-semibold text-center">Signal Sources</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {["Twitter/X", "YouTube", "CoinDesk", "The Block", "Decrypt", "CoinTelegraph", "Custom URLs"].map((source) => (
            <span key={source} className="neo-raised-sm px-4 py-2 text-sm">
              {source}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted text-center">
          Signals are extracted from top crypto influencers and news sources in real-time.
        </p>
      </div>
    </div>
  );
}
