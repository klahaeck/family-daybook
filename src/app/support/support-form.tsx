"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  initialSupportFormState,
  submitSupportRequest,
} from "@/app/support/actions";
import { SUPPORT_TOPICS } from "@/app/support/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          callback(token: string): void;
          "expired-callback"(): void;
          "error-callback"(): void;
        },
      ): string;
      reset(widgetId: string): void;
      remove(widgetId: string): void;
    };
  }
}

const topicLabels: Record<(typeof SUPPORT_TOPICS)[number], string> = {
  account: "Account",
  billing: "Billing",
  privacy: "Privacy",
  security: "Security",
  mcp: "MCP and agent access",
  other: "Other",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-sm text-destructive">{messages[0]}</p>;
}

export function SupportForm({ siteKey }: { siteKey: string }) {
  const [state, action, pending] = useActionState(
    submitSupportRequest,
    initialSupportFormState,
  );
  const [token, setToken] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function renderTurnstile() {
    if (
      !window.turnstile ||
      !turnstileContainerRef.current ||
      widgetIdRef.current
    ) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(
      turnstileContainerRef.current,
      {
        sitekey: siteKey,
        action: "support_form",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      },
    );
  }

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    window.queueMicrotask(() => setToken(""));
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [state.status]);

  useEffect(
    () => () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    },
    [],
  );

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderTurnstile}
      />
      <form ref={formRef} action={action} className="space-y-6" noValidate>
        <div className="absolute -left-[10000px] top-auto size-px overflow-hidden" aria-hidden="true">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-name">Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input
            id="support-name"
            name="name"
            maxLength={100}
            autoComplete="name"
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-email">Reply email</Label>
          <Input
            id="support-email"
            name="replyEmail"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.replyEmail)}
          />
          <p className="text-sm text-muted-foreground">Used only to respond to this request.</p>
          <FieldError messages={state.fieldErrors?.replyEmail} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-topic">Topic</Label>
          <select
            id="support-topic"
            name="topic"
            required
            defaultValue=""
            aria-invalid={Boolean(state.fieldErrors?.topic)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          >
            <option value="" disabled>Choose a topic</option>
            {SUPPORT_TOPICS.map((topic) => (
              <option key={topic} value={topic}>{topicLabels[topic]}</option>
            ))}
          </select>
          <FieldError messages={state.fieldErrors?.topic} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-message">Message</Label>
          <Textarea
            id="support-message"
            name="message"
            minLength={10}
            maxLength={4000}
            rows={8}
            required
            aria-invalid={Boolean(state.fieldErrors?.message)}
          />
          <FieldError messages={state.fieldErrors?.message} />
        </div>

        <div className="space-y-2">
          <div ref={turnstileContainerRef} />
          <input type="hidden" name="turnstileToken" value={token} />
          <FieldError messages={state.fieldErrors?.turnstileToken} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" disabled={pending || !token}>
            {pending ? "Sending…" : "Send support request"}
          </Button>
          <p
            className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            aria-live="polite"
          >
            {state.message}
          </p>
        </div>
      </form>
    </>
  );
}
