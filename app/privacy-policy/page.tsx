import Link from "next/link";

const sections = [
  {
    title: "1. Who We Are",
    paragraphs: [
      "This Privacy Policy explains how Omegpt, omegpt.com, and the Omegpt mobile application collect, use, store, share, and protect information when you use our video chat, messaging, matching, moderation, and virtual currency features.",
      "If you have any questions about this Privacy Policy or your personal information, you can contact us at support@omegpt.com.",
    ],
  },
  {
    title: "2. Information We Collect",
    paragraphs: [
      "We collect information you provide directly, including account details, profile content, messages, photos, support requests, preferences, and other information you choose to share inside Omegpt.",
      "We also collect technical and usage data such as IP address, device type, operating system, language, timestamps, approximate location inferred from network information, session activity, purchases, and moderation-related records.",
      "When you use camera, microphone, photo, or video features, Omegpt processes that access only to provide the relevant functionality.",
    ],
  },
  {
    title: "3. How We Use Information",
    paragraphs: [
      "We use your information to create and maintain your account, deliver video chat and messaging features, improve matching quality, process purchases, manage Gems balances, respond to support requests, and keep the platform stable and secure.",
      "We also use data to detect abuse, enforce our rules, investigate reports, prevent fraud, and comply with legal obligations.",
    ],
  },
  {
    title: "4. Safety and Moderation",
    paragraphs: [
      "Because Omegpt is a real-time video chat service, we use automated systems, moderation tooling, trust and safety processes, and, when necessary, trained human review to investigate harmful behavior, abuse reports, fraud, ban evasion, and other violations.",
      "This may include review of screenshots, metadata, account activity, moderation history, reports, and content shared within the service where reasonably necessary to protect users and enforce our rules.",
    ],
  },
  {
    title: "5. Sharing of Information",
    paragraphs: [
      "We may share information with service providers who help us operate Omegpt, including infrastructure, analytics, customer support, billing, fraud prevention, and moderation partners.",
      "We may also disclose information to professional advisers, corporate transaction counterparties, law enforcement, or competent authorities where required by law or reasonably necessary to protect our users, rights, or the service.",
    ],
  },
  {
    title: "6. Legal Bases and Retention",
    paragraphs: [
      "Where applicable, we process information to perform our contract with you, pursue legitimate interests such as safety and product improvement, comply with legal obligations, and in limited situations rely on your consent.",
      "We keep data for as long as reasonably necessary to provide the service, resolve disputes, maintain safety records, investigate abuse, complete financial reporting, and comply with applicable law.",
    ],
  },
  {
    title: "7. Your Rights",
    paragraphs: [
      "Depending on your location, you may have rights to request access, correction, deletion, restriction, objection, or portability of certain personal information.",
      "To exercise these rights, contact support@omegpt.com. We may need to verify your identity before processing certain requests.",
    ],
  },
  {
    title: "8. Children’s Privacy",
    paragraphs: [
      "Omegpt is intended only for adults who are at least 18 years old. We do not knowingly permit minors to use the service.",
    ],
  },
  {
    title: "9. International Use and Updates",
    paragraphs: [
      "Your information may be processed in countries other than your own. When this happens, we take reasonable steps to apply appropriate safeguards consistent with applicable law.",
      "We may update this Privacy Policy from time to time. Continued use of Omegpt after an updated version becomes effective means the revised policy will apply from that date.",
    ],
  },
];

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
            This policy describes how Omegpt handles personal information across
            omegpt.com and the Omegpt mobile application.
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
