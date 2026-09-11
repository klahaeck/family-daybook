import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DaybookLink({
  signedIn,
  className,
  compactLabel,
  signedOutLabel = "Start your daybook",
}: {
  signedIn: boolean;
  className?: string;
  compactLabel?: string;
  signedOutLabel?: string;
}) {
  const label = signedIn ? "View your daybook" : signedOutLabel;

  return (
    <Link
      href={signedIn ? "/app" : "/sign-up"}
      className={cn(buttonVariants({ size: "lg" }), className)}
      aria-label={compactLabel ? label : undefined}
    >
      {compactLabel ? (
        <>
          <span className="sm:hidden">{compactLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
