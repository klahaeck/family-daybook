export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "Family Daybook",
    description: "Private, factual family recordkeeping.",
    changeFrequency: "monthly",
    priority: 1,
  },
  {
    path: "/pricing",
    title: "Pricing",
    description: "Family Daybook plans and reviewer access.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/co-parenting-recordkeeping",
    title: "Co-parenting recordkeeping",
    description: "Private recordkeeping for separated and co-parenting families.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/agent-access",
    title: "Agent access",
    description: "Connect an authorized MCP assistant to Family Daybook.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/record-integrity",
    title: "Record integrity",
    description: "How timestamps, finalization, revisions, and hashes preserve context.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/features/report-packages",
    title: "Report packages",
    description: "What Family Daybook report packages contain and how to review them.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/features/reviewer-access",
    title: "Reviewer access",
    description: "Read-only access to finalized family records.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/guides/factual-family-records",
    title: "Factual family records",
    description: "A practical guide to clear, observable family recordkeeping.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/privacy",
    title: "Privacy policy",
    description: "How Family Daybook handles information.",
    changeFrequency: "yearly",
    priority: 0.4,
  },
  {
    path: "/terms",
    title: "Terms of use",
    description: "Terms for using Family Daybook.",
    changeFrequency: "yearly",
    priority: 0.4,
  },
] as const;

export const SUPPORT_PAGE = {
  path: "/support",
  title: "Support",
  description: "Send a private support request to Family Daybook.",
} as const;

export type PublicPagePath = (typeof PUBLIC_PAGES)[number]["path"];
