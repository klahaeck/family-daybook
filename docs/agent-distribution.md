# Agent discovery and indexing runbook

These are post-deployment operations. They intentionally do not run during builds or CI.

## 1. Production verification

Set `APP_ENV=production` and `NEXT_PUBLIC_APP_URL=https://www.myfamilydaybook.com` only for the production deployment. Preview and staging deployments are intentionally excluded from indexing. Confirm:

```sh
curl -I https://myfamilydaybook.com/agent-access
curl -I https://www.myfamilydaybook.com/agent-access
curl https://www.myfamilydaybook.com/robots.txt
curl https://www.myfamilydaybook.com/sitemap.xml
curl https://www.myfamilydaybook.com/agent-capabilities.json
curl https://www.myfamilydaybook.com/llms.txt
curl -I https://www.myfamilydaybook.com/.well-known/oauth-protected-resource/mcp
curl -I https://www.myfamilydaybook.com/mcp
```

The apex request must permanently redirect to `www`; public pages and discovery files must return successfully; and unauthenticated MCP access must return an OAuth challenge rather than HTML.

Configure the support variables and complete one support-form delivery test. Confirm that request content is absent from application logs.

## 2. Search engines

1. Add a Google Search Console domain property for `myfamilydaybook.com` through DNS verification.
2. Submit `https://www.myfamilydaybook.com/sitemap.xml`.
3. Inspect and request indexing for `/`, `/agent-access`, the three feature pages, and the factual-records guide.
4. Add the site to Bing Webmaster Tools and submit the same sitemap.
5. Configure `INDEXNOW_KEY`, verify `/indexnow-key.txt`, and preview the URL submission:

   ```sh
   APP_ENV=production NEXT_PUBLIC_APP_URL=https://www.myfamilydaybook.com INDEXNOW_KEY=REPLACE_ME npm run search:notify
   ```

6. After reviewing the dry run, send it explicitly:

   ```sh
   APP_ENV=production NEXT_PUBLIC_APP_URL=https://www.myfamilydaybook.com INDEXNOW_KEY=REPLACE_ME npm run search:notify -- --submit
   ```

Do not automate indexing submissions from a build. Use them after a verified deployment or meaningful public-content update.

## 3. Official MCP Registry preview

The registry is a preview service and published versions are immutable. Review `server.json` immediately before each publish.

```sh
mcp-publisher validate
mcp-publisher login dns --domain myfamilydaybook.com --private-key REPLACE_WITH_PRIVATE_KEY
mcp-publisher publish
```

Create the required DNS proof through the publisher’s documented key-generation flow and keep the private key outside the repository. Use the DNS-authenticated `com.myfamilydaybook/family-daybook` namespace only. If registry validation or DNS requirements differ from the reviewed schema, stop and update the metadata deliberately rather than switching namespaces.

## 4. OpenAI plugin directory

1. Complete business identity verification so the displayed publisher identity is **Family Daybook**.
2. Configure `OPENAI_APPS_CHALLENGE_TOKEN` with the exact portal token and verify that `/.well-known/openai-apps-challenge` returns only that token.
3. Create a **With MCP** draft using the fields and tests in `openai-plugin-submission.md`.
4. Choose a Universal MCP URL, configure OAuth, run Scan Tools, and review all eleven tools and their annotations.
5. Supply the synthetic review account privately and submit five positive and three negative tests.
6. Submit for review only when public website, support, privacy, and terms URLs are live and consistent.
7. After approval, publish from the portal. Add a directory link to `/agent-access` only after a stable public listing URL exists.

If OpenAI cannot verify Family Daybook without publishing an individual identity or other prohibited details, defer the submission.

## 5. Monitoring

- Review Search Console and Bing indexing coverage after launch and after major content updates.
- Track impressions and clicks for the homepage, agent-access page, feature pages, and factual-records guide.
- Review Vercel request logs for crawl failures and OAuth discovery errors without logging family content or support messages.
- A crawler user-agent string is not proof of identity. If WAF rules are introduced, validate requests against the crawler operator’s currently published IP ranges.
