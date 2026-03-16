import Link from "next/link";

const sections = [
  {
    title: "1. Digital Purchases",
    paragraphs: [
      "Omegpt may offer Gems, premium filters, private-call features, and other digital features through Apple App Store, Google Play, or other authorized billing channels.",
    ],
  },
  {
    title: "2. Nature of Gems",
    paragraphs: [
      "Gems are a digital in-app item licensed for use only within Omegpt. They are not money, do not earn interest, cannot be transferred between users, and cannot be redeemed for cash except where required by law.",
    ],
  },
  {
    title: "3. Billing and Platform Rules",
    paragraphs: [
      "All billing, subscriptions, and purchase processing are handled by the platform through which the transaction is made. Your purchase may also be subject to the rules, refund policies, and billing terms of Apple, Google, or another authorized storefront.",
    ],
  },
  {
    title: "4. Refund Policy",
    paragraphs: [
      "Except where required by applicable law or platform policy, purchases of Gems and other digital items are non-refundable.",
      "Consumed Gems, partially used digital items, completed premium actions, and promotional balances are generally not eligible for refund.",
    ],
  },
  {
    title: "5. Pricing and Availability",
    paragraphs: [
      "Omegpt may change pricing, available packages, feature eligibility, or the way Gems are used at any time. We may also modify or discontinue paid features as the product evolves.",
    ],
  },
  {
    title: "6. Fraud, Abuse, and Reversals",
    paragraphs: [
      "We may refuse, suspend, reverse, or investigate transactions associated with fraud, chargebacks, abuse, platform misuse, or technical errors. Related accounts may be restricted while a review is underway.",
    ],
  },
  {
    title: "7. Contact",
    paragraphs: [
      "If you need purchase-related support, please contact support@omegpt.com and include your platform, transaction details, and account identifier where possible.",
    ],
  },
];

export default function PurchaseTermsPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-white text-neutral-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 flex items-center justify-between border-b border-neutral-200 pb-5">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-900 transition hover:opacity-70"
          >
            Omegpt
          </Link>
          <Link
            href="/"
            className="text-sm text-neutral-500 transition hover:text-neutral-900"
          >
            Back to Home
          </Link>
        </div>

        <header className="mb-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">
            Legal
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
            Purchase Terms
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
            Purchase terms for Gems and other digital features offered in Omegpt.
          </p>
          <p className="mt-4 text-sm text-neutral-500">Last updated: March 16, 2026</p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-base leading-8 text-neutral-700">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
