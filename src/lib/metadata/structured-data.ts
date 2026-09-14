import type { PublicPagePath } from "@/lib/metadata/public-pages";

const publisherId = "/#publisher";
const websiteId = "/#website";
const applicationId = "/#application";

function absolute(siteUrl: URL, path: string): string {
  return new URL(path, siteUrl).toString();
}

export function homeStructuredData(siteUrl: URL) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": absolute(siteUrl, publisherId),
        name: "Family Daybook",
        url: absolute(siteUrl, "/"),
        logo: absolute(siteUrl, "/family-daybook-logo.png"),
      },
      {
        "@type": "WebSite",
        "@id": absolute(siteUrl, websiteId),
        name: "Family Daybook",
        url: absolute(siteUrl, "/"),
        description:
          "A private family recordkeeping app for caregiving, appointments, factual notes, and an organized family timeline.",
        publisher: { "@id": absolute(siteUrl, publisherId) },
      },
      {
        "@type": "SoftwareApplication",
        "@id": absolute(siteUrl, applicationId),
        name: "Family Daybook",
        url: absolute(siteUrl, "/"),
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        description:
          "Private family recordkeeping with factual entries, visible corrections, report packages, reviewer access, and authorized MCP tools.",
        publisher: { "@id": absolute(siteUrl, publisherId) },
      },
    ],
  };
}

export interface BreadcrumbItem {
  name: string;
  path: "/" | PublicPagePath;
}

export function pageStructuredData({
  siteUrl,
  path,
  name,
  description,
  breadcrumbs,
  faqs,
}: {
  siteUrl: URL;
  path: PublicPagePath;
  name: string;
  description: string;
  breadcrumbs: readonly BreadcrumbItem[];
  faqs?: readonly { question: string; answer: string }[];
}) {
  const pageUrl = absolute(siteUrl, path);
  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      name,
      description,
      url: pageUrl,
      isPartOf: { "@id": absolute(siteUrl, websiteId) },
      publisher: { "@id": absolute(siteUrl, publisherId) },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: absolute(siteUrl, item.path),
      })),
    },
  ];

  if (faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
