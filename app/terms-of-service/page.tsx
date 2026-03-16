import Link from "next/link";

const sections = [
  {
    title: "1. Eligibility",
    paragraphs: [
      "You must be at least 18 years old and legally able to enter into a binding agreement to use Omegpt. By using the service, you confirm that you meet these requirements.",
    ],
  },
  {
    title: "2. Your Account",
    paragraphs: [
      "You are responsible for your account credentials, device security, and any activity that occurs through your account. You agree to provide accurate information and keep your account information reasonably current.",
    ],
  },
  {
    title: "3. Acceptable Use",
    paragraphs: [
      "You may not use Omegpt for harassment, hate speech, nudity where prohibited, exploitation, scams, impersonation, spam, illegal conduct, ban evasion, or any behavior that harms other users or the operation of the platform.",
      "We may remove content, limit features, suspend accounts, or permanently ban users who violate these rules.",
    ],
  },
  {
    title: "4. Video Chat and User Content",
    paragraphs: [
      "You are responsible for any profile information, photos, messages, and live interactions you create, upload, or transmit through Omegpt.",
      "You represent that you have the necessary rights to share your content and that your content does not violate law, third-party rights, or these Terms.",
    ],
  },
  {
    title: "5. Safety and Moderation",
    paragraphs: [
      "To protect users, Omegpt may review reports, screenshots, moderation history, and associated account activity. We may investigate abuse, fraud, unsafe conduct, or policy violations using automated tools and, where appropriate, trained human review.",
    ],
  },
  {
    title: "6. Paid Features and Gems",
    paragraphs: [
      "Omegpt may offer Gems or other digital features. These items are licensed for use inside the service only, have no cash value, and may not be transferred, resold, or redeemed outside the platform except where required by law.",
    ],
  },
  {
    title: "7. Termination",
    paragraphs: [
      "You may stop using Omegpt at any time. We may suspend or terminate access where necessary to protect users, investigate misconduct, enforce our policies, or comply with legal obligations.",
    ],
  },
  {
    title: "8. Disclaimers",
    paragraphs: [
      "Omegpt is provided on an \"as is\" and \"as available\" basis. We do not guarantee uninterrupted availability, successful matches, or that every interaction will be safe, lawful, or satisfactory.",
    ],
  },
  {
    title: "9. Limitation of Liability",
    paragraphs: [
      "To the fullest extent permitted by law, Omegpt and its affiliates are not liable for indirect, incidental, special, consequential, or punitive damages arising out of your use of the service.",
    ],
  },
  {
    title: "10. Changes and Contact",
    paragraphs: [
      "We may update these Terms from time to time. If you continue using Omegpt after an update becomes effective, the revised Terms will apply.",
      "Questions about these Terms may be sent to support@omegpt.com.",
    ],
  },
];

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
            These Terms govern your use of Omegpt across the web and mobile apps.
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
