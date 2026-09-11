import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/app/brand-logo";
import { ThemeToggle } from "@/components/theme-switcher";
import { clerkConfigured } from "@/lib/auth/identity";

export const metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  if (!clerkConfigured()) redirect("/app");
  return (
    <main className="relative grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,var(--surface-glow),transparent_34rem)] p-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="space-y-5 text-center">
        <div>
          <BrandLogo className="mx-auto w-64" />
          <p className="mt-1 text-sm text-muted-foreground">
            Create your private family workspace
          </p>
        </div>
        <SignUp fallbackRedirectUrl="/app" />
      </div>
    </main>
  );
}
