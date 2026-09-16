import { PUBLIC_PAGES } from "../src/lib/metadata/public-pages";
import { getSiteUrl } from "../src/lib/metadata/site-url";

const keyPattern = /^[A-Za-z0-9-]{8,128}$/;
const submit = process.argv.includes("--submit");
const siteUrl = getSiteUrl({
  APP_ENV: "production",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
const key = process.env.INDEXNOW_KEY?.trim();

if (!key || !keyPattern.test(key)) {
  throw new Error("INDEXNOW_KEY must contain 8 to 128 letters, numbers, or hyphens.");
}

const urlList = [
  ...PUBLIC_PAGES.map((page) => new URL(page.path, siteUrl).toString()),
  new URL("/agent-capabilities.json", siteUrl).toString(),
  new URL("/llms.txt", siteUrl).toString(),
];
const payload = {
  host: siteUrl.hostname,
  key,
  keyLocation: new URL("/indexnow-key.txt", siteUrl).toString(),
  urlList,
};

if (!submit) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        endpoint: "https://api.indexnow.org/indexnow",
        host: payload.host,
        keyLocation: payload.keyLocation,
        urlList: payload.urlList,
      },
      null,
      2,
    ),
  );
  console.log("No request sent. Pass --submit after the canonical deployment is verified.");
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

if (response.status !== 200 && response.status !== 202) {
  throw new Error(`IndexNow submission failed with HTTP ${response.status}.`);
}

console.log(`IndexNow accepted ${urlList.length} canonical URLs (HTTP ${response.status}).`);
