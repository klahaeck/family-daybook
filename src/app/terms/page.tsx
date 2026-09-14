import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that govern access to and use of Family Daybook.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using the service"
      title="Terms of use"
      description="These terms describe the responsibilities and boundaries that apply when you create an account or use Family Daybook."
    >
      <LegalSection title="1. Agreement to these terms">
        <p>
          These Terms of Use are an agreement between you and Family Daybook (“Family Daybook,” “we,” “us,” or “our”). By accessing or using Family Daybook, you agree to these terms and our <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4">Privacy Policy</Link>. If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility">
        <p>You must be at least 18 years old and able to enter into a binding agreement to use Family Daybook. The service is for adults and is not directed to children.</p>
      </LegalSection>

      <LegalSection title="3. Accounts and security">
        <p>You must provide accurate account information, keep it current, and protect your sign-in credentials and devices. You are responsible for activity under your account and for enabling available multi-factor authentication where appropriate.</p>
        <p>Notify us promptly through the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">support form</Link> if you suspect unauthorized access. We may restrict access when reasonably necessary to protect users, information, or the service.</p>
      </LegalSection>

      <LegalSection title="4. Plans and billing">
        <p>The workspace owner is responsible for maintaining an eligible paid Plan. Free accounts cannot access a private workspace. Invited reviewers use the owner’s workspace access and do not need a separate paid Subscription.</p>
        <p>Available Plans, prices, billing periods, and renewal terms are presented before checkout. By starting a paid Subscription, you authorize Clerk and its payment processor to collect the displayed recurring charges until you cancel or change the Subscription. You can manage or cancel a paid Subscription through your Clerk account profile.</p>
        <p>Plan changes, cancellations, failed payments, and the end of an eligible Plan may change access to the private workspace. Any refund rights or cancellation rights required by applicable law remain unaffected.</p>
      </LegalSection>

      <LegalSection title="5. Authorized use of family information">
        <p>You may enter information only when you have a lawful and appropriate basis to do so. You are responsible for the accuracy, relevance, and lawfulness of the information you submit, the people you invite, and any reports or files you download or share.</p>
        <p>Family Daybook does not independently verify user-entered events, identities, relationships, or attachments.</p>
      </LegalSection>

      <LegalSection title="6. Your content">
        <p>You retain ownership of content you submit to Family Daybook. You grant us a limited, non-exclusive license to host, copy, process, transmit, and format that content only as reasonably necessary to operate, secure, support, and improve the service or comply with applicable requirements.</p>
        <p>You represent that you have the rights and permissions needed to submit the content and grant this limited license.</p>
      </LegalSection>

      <LegalSection title="7. Reviewers and shared access">
        <p>Workspace owners may invite reviewers. Reviewers receive limited access based on the service’s current permissions. Owners are responsible for verifying each reviewer’s identity and email address, deciding what access is appropriate, and revoking access when it is no longer needed.</p>
        <p>Downloaded copies are outside Family Daybook’s technical control and cannot be revoked by removing a reviewer.</p>
      </LegalSection>

      <LegalSection title="8. Acceptable use">
        <p>You may not use Family Daybook to:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li>violate law, privacy, intellectual property, confidentiality, or another person’s rights;</li>
          <li>harass, threaten, impersonate, defame, exploit, or endanger another person;</li>
          <li>conduct hidden surveillance or upload material obtained unlawfully;</li>
          <li>upload malware, executable content, or files intended to disrupt or bypass service controls;</li>
          <li>probe, scrape, reverse engineer, overload, or gain unauthorized access to the service or another workspace; or</li>
          <li>misrepresent altered, incomplete, or fabricated information as verified by Family Daybook.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Recordkeeping features and limitations">
        <p>Family Daybook is a factual recordkeeping aid. Server timestamps, linked hashes, append-only corrections, reports, and audit information are designed to improve organization and make quiet changes easier to detect. They do not make the service tamper-proof, independently verify content, or guarantee that a record will be accepted or produce any particular outcome.</p>
        <p>Family Daybook does not provide legal, medical, mental health, safety, or other professional advice and is not an emergency service. Seek qualified assistance when you need professional guidance or immediate help.</p>
      </LegalSection>

      <LegalSection title="10. Privacy">
        <p>Our <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4">Privacy Policy</Link> explains how we collect, use, store, and share information. You agree that we may process information as described there.</p>
      </LegalSection>

      <LegalSection title="11. Service availability and changes">
        <p>We work to provide a reliable service, but we do not guarantee uninterrupted, error-free, or permanent availability. Features may change, be suspended, or be discontinued. You are responsible for keeping appropriate copies of information you need and for reviewing exported files before relying on them.</p>
      </LegalSection>

      <LegalSection title="12. Deletion and termination">
        <p>You may stop using the service at any time. Use the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">support form</Link> for account-level deletion requests. We may suspend or terminate access for material violations, security risks, unlawful use, or where required to protect the service or others.</p>
        <p>Deleting active content does not revoke copies already downloaded by you or an authorized reviewer. Content-free audit tombstones and temporary provider backups may remain as described in the Privacy Policy.</p>
      </LegalSection>

      <LegalSection title="13. Disclaimers">
        <p>To the fullest extent permitted by law, Family Daybook is provided “as is” and “as available.” We disclaim implied warranties, including merchantability, fitness for a particular purpose, non-infringement, and any warranty arising from a course of dealing. We do not warrant the accuracy of user content or that the service will meet every recordkeeping need.</p>
      </LegalSection>

      <LegalSection title="14. Limitation of liability">
        <p>To the fullest extent permitted by law, Family Daybook and its service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, use, goodwill, or opportunity arising from the service.</p>
        <p>Where liability cannot be excluded, our total liability for claims relating to the service will not exceed the greater of amounts you paid us during the 12 months before the claim or 100 US dollars, unless applicable law requires a different result.</p>
      </LegalSection>

      <LegalSection title="15. Indemnity">
        <p>To the extent permitted by law, you agree to defend and indemnify Family Daybook from claims, losses, and expenses arising from your content, your misuse of the service, your violation of these terms, or your violation of another person’s rights.</p>
      </LegalSection>

      <LegalSection title="16. Changes to these terms">
        <p>We may update these terms as the service changes. We will post revised terms with a new effective date and provide additional notice when appropriate. Continued use after revised terms take effect means you accept them.</p>
      </LegalSection>

      <LegalSection title="17. Questions">
        <p>Send questions about these terms through the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">private support form</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
