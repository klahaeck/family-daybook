import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { AppShellSkeleton } from "@/components/app/page-skeleton";
import { getPageRequestContext } from "@/lib/repository";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const context = await getPageRequestContext();
  return (
    <AppShell workspace={context.workspace} member={context.member}>
      {children}
    </AppShell>
  );
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
