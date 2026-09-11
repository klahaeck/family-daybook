import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/family-daybook-logo.svg"
      alt={decorative ? "" : "Family Daybook"}
      aria-hidden={decorative || undefined}
      width={760}
      height={180}
      className={cn("h-auto dark:brightness-200 dark:saturate-150", className)}
    />
  );
}
