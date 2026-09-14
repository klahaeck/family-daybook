import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Family Daybook collects, uses, protects, and shares information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your information"
      title="Privacy policy"
      description="Family Daybook is designed for sensitive family information. This policy explains what we collect, why we use it, and the choices available to you."
    >
      <LegalSection title="1. About this service">
        <p>
          Family Daybook (“Family Daybook,” “we,” “us,” or “our”) provides the Family Daybook website, application, and related services. This policy applies when you use those services.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>We collect information that you provide, information created while you use the service, and limited technical information needed to operate it.</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li><strong>Account and subscription information:</strong> name, email address, authentication identifiers, account status, security settings, Plan, Subscription status, statements, and payment history supplied through Clerk. Payment card details are handled by Clerk and its payment processor and are not stored in Family Daybook’s application database.</li>
          <li><strong>Family and workspace information:</strong> workspace name, timezone, adult caregiver labels, reviewer names and emails, child display names or labels, and birthdates entered by an adult account holder.</li>
          <li><strong>Daybook content:</strong> routines, caregiving entries, appointment information, factual incident notes, timestamps, people present, observations, outcomes, corrections, and other details you choose to record.</li>
          <li><strong>Files and reports:</strong> images, PDFs, other supported attachments, generated reports, manifests, and checksums.</li>
          <li><strong>Activity and integrity information:</strong> server timestamps, revision history, audit events, download activity, record hashes, invitation activity, and deletion tombstones.</li>
          <li><strong>Essential technical information:</strong> authentication cookies, request information, and operational logs needed to secure, troubleshoot, and deliver the service.</li>
          <li><strong>Analytics information:</strong> Google Analytics may collect page views, session activity, approximate location, browser and device information, referring source, and a pseudonymous client identifier stored in a first-party analytics cookie.</li>
          <li><strong>Support correspondence:</strong> the name, reply email, topic, message, and related details that you choose to submit through the support form.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>We use information to provide and maintain Family Daybook, including to:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li>authenticate users and create isolated private workspaces;</li>
          <li>save, organize, search, correct, and display daybook records;</li>
          <li>store private attachments and generate requested report packages;</li>
          <li>apply owner and reviewer permissions;</li>
          <li>protect the service, investigate misuse, and maintain record integrity features;</li>
          <li>measure website and application usage, understand navigation patterns, and improve the service;</li>
          <li>respond to support, privacy, and security requests; and</li>
          <li>comply with applicable obligations and enforce our terms.</li>
        </ul>
        <p>We use Google Analytics for the limited measurement purposes described below. We do not configure Google Analytics to collect daybook entries, child information, attachments, or report content, and we do not sell personal information.</p>
      </LegalSection>

      <LegalSection title="4. When information is shared">
        <p>We share information only as needed to operate the service, at your direction, or where required. Recipients may include:</p>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li><strong>Service providers:</strong> Clerk for authentication and subscription billing, Stripe for payment processing, MongoDB Atlas for database hosting, Vercel for application hosting, private file storage, and background workflows, Google for website and application analytics, Resend for delivering support correspondence, and Cloudflare Turnstile for support-form abuse prevention. These providers process information under their own contractual and security commitments.</li>
          <li><strong>Authorized reviewers:</strong> people an owner invites to a workspace. Reviewers receive read-only access determined by the service’s current permissions. Owners are responsible for choosing reviewers carefully and revoking access when appropriate.</li>
          <li><strong>Legal and safety recipients:</strong> authorities, advisers, or other parties when we reasonably believe disclosure is required by law, necessary to protect rights or safety, or needed to investigate fraud or abuse.</li>
          <li><strong>Business transfers:</strong> a successor or involved advisers during a merger, acquisition, financing, reorganization, or sale of assets, subject to appropriate confidentiality protections.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Cookies and similar technology">
        <p>Family Daybook and Clerk use cookies and similar browser storage that are necessary to sign users in, maintain sessions, prevent abuse, and operate account features. We also use Google Analytics 4, provided by Google, to measure visits and usage. Google Analytics uses the Google tag and may set first-party cookies, including <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">_ga</code>, to distinguish pseudonymous users and sessions.</p>
        <p>Google Analytics may receive the page or route visited, session and page-view activity, approximate location, browser and device information, referring source, and related technical information. Google states that Google Analytics 4 uses IP addresses at collection time to derive approximate location and discards them before the addresses are logged.</p>
        <p>
          Learn more about <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-4">how Google uses information from sites that use its services</a>. You can manage or delete cookies through your browser settings or use the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-4">Google Analytics opt-out browser add-on</a> to prevent Google Analytics from using data from your browser.
        </p>
      </LegalSection>

      <LegalSection title="6. Information about children">
        <p>Family Daybook is intended for adults and is not directed to children. Adult users may choose to enter information relating to children as part of a private family workspace. The adult account holder is responsible for having appropriate authority to enter, use, invite access to, and disclose that information.</p>
        <p>If you believe a child provided personal information directly to us without appropriate adult involvement, use the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">support form</Link> so we can review the request.</p>
      </LegalSection>

      <LegalSection title="7. Storage and security">
        <p>We use administrative, technical, and organizational safeguards intended to reduce the risk of unauthorized access, loss, misuse, or alteration. These include authenticated access, workspace and role checks, private file routes, file-type validation, server-controlled timestamps, and tamper-evident revision history.</p>
        <p>No service can guarantee absolute security. You are responsible for protecting your account, using a strong password, enabling available multi-factor authentication, keeping devices secure, and promptly reporting suspected unauthorized access.</p>
      </LegalSection>

      <LegalSection title="8. Retention and deletion">
        <p>We retain account and workspace information while the service is active and as reasonably needed to provide the service, maintain security and audit history, resolve disputes, or meet applicable obligations.</p>
        <p>Records ordinarily remain until an authorized owner deletes them. Permanent record deletion is disabled by default and can be enabled by an owner in workspace settings. A permanent purge requires a reason and typed confirmation, and removes active record content, attachments, and stored reports containing that record while retaining a content-free deletion tombstone.</p>
        <p>Downloaded copies cannot be revoked. Residual copies may remain in provider backups until those backups expire under the provider’s configured retention schedule.</p>
      </LegalSection>

      <LegalSection title="9. Your choices and requests">
        <p>Depending on your location, you may have rights to request access, correction, deletion, restriction, portability, or information about how personal information is used. The application also provides tools to review records, append corrections, export reports, manage reviewers, and—when enabled—permanently purge individual records.</p>
        <p>Use the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">support form</Link> to submit an account-level or privacy request. We may need to verify your identity and authority before completing a request.</p>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>We may update this policy as the service or applicable requirements change. We will post the revised policy with a new effective date and provide additional notice when appropriate.</p>
      </LegalSection>

      <LegalSection title="11. Questions and requests">
        <p>Send questions or requests through the <Link href="/support" className="font-semibold text-primary underline underline-offset-4">private support form</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
