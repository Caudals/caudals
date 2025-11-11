"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, SendHorizonal, Sparkles } from "lucide-react";

import {
  collaborationFormSchema,
  type CollaborationFormValues,
  collaborationFocusAreas,
  collaborationTeamSizes,
} from "@/lib/validators/collaboration";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const focusAreaLabels: Record<(typeof collaborationFocusAreas)[number], string> = {
  "data-collection": "Data collection partnership",
  "joint-research": "Joint research or experimentation",
  "co-marketing": "Co-marketing or funding",
  "public-sector": "Public sector or civic initiative",
  other: "Other",
};

const defaultValues: Partial<CollaborationFormValues> = {
  fullName: "",
  workEmail: "",
  organization: "",
  organizationWebsite: "",
  focusArea: undefined,
  teamSize: undefined,
  message: "",
};

export function CollaborateForm() {
  const [isComplete, setIsComplete] = useState(false);
  const form = useForm<CollaborationFormValues>({
    resolver: zodResolver(collaborationFormSchema),
    defaultValues,
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: CollaborationFormValues) {
    try {
      const response = await fetch("/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 422 && payload && typeof payload === "object") {
          const detail = (payload as { details?: { fieldErrors?: Record<string, string[]> } }).details;
          if (detail?.fieldErrors) {
            Object.entries(detail.fieldErrors).forEach(([field, messages]) => {
              if (messages?.length) {
                form.setError(field as keyof CollaborationFormValues, {
                  type: "server",
                  message: messages[0],
                });
              }
            });
          }
          toast.error("Please review the highlighted fields.");
          return;
        }

        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "")
            : "We couldn't send your message.";

        throw new Error(message || "Request failed");
      }

      setIsComplete(true);
      toast.success("Thanks for reaching out. We'll respond within 48 hours.");
      form.reset(defaultValues);
    } catch (error) {
      console.error("Failed to submit collaboration form", error);
      toast.error("We couldn't send your message. Please try again.");
    }
  }

  if (isComplete) {
    return (
      <Card className="border border-border/70 bg-white/90 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Message sent!
          </CardTitle>
          <CardDescription>
            Our partnerships team will respond within 48 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you'd like to share more details in the meantime, reach us directly at
            <Button variant="link" className="px-1 text-base" asChild>
              <a href="mailto:contact@caudals.com">contact@caudals.com</a>
            </Button>
          </p>
          <Button variant="outline" onClick={() => setIsComplete(false)}>
            Send another message
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/70 bg-white/90 shadow-xl backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl">Share your initiative</CardTitle>
        <CardDescription>
          Tell us what you're building so we can design a tailored collaboration plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="organization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company or organization</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corp" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="organizationWebsite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="focusArea"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of collaboration</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select focus area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {collaborationFocusAreas.map((area) => (
                          <SelectItem key={area} value={area}>
                            {focusAreaLabels[area]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="teamSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team size (optional)</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Prefer not to say</SelectItem>
                        {collaborationTeamSizes.map((size) => (
                          <SelectItem key={size} value={size}>
                            {size} people
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Context and next steps</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Tell us about your initiative, goals, and how you'd like to collaborate with Caudals."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send message
                  <SendHorizonal className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
