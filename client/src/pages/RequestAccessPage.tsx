import { useMemo, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiRequestError } from "@/lib/api";

const requestAccessSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(254),
  dealership: z.string().trim().min(1, "Dealership is required").max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  // Honeypot: should stay empty
  website: z.string().optional().or(z.literal("")),
});

type RequestAccessForm = z.infer<typeof requestAccessSchema>;

export default function RequestAccessPage() {
  const [form, setForm] = useState<RequestAccessForm>({
    name: "",
    email: "",
    dealership: "",
    phone: "",
    website: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => requestAccessSchema.safeParse(form), [form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = requestAccessSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please check the form.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiPost<{ ok: true }>("/api/public/request-access", {
        name: parsed.data.name,
        email: parsed.data.email,
        dealership: parsed.data.dealership,
        phone: parsed.data.phone || undefined,
        website: parsed.data.website || undefined,
      });

      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.body?.error || err.message);
      } else {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-lg border-gray-200">
          <CardHeader>
            <CardTitle className="text-2xl text-[#022d60]">Request received</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-600">
              Thanks — we’ll reach out shortly with next steps.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/">
                <Button className="bg-[#022d60] hover:bg-[#022d60]/90 text-white">Back to home</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline">Sign in</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-white px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[#022d60] tracking-tight">Request access</h1>
          <p className="mt-3 text-gray-600 text-lg">
            Used car dominance, automated.
          </p>
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl text-[#022d60]">Tell us about your store</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              {/* Honeypot field (hidden) */}
              <div className="hidden" aria-hidden>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  autoComplete="off"
                  tabIndex={-1}
                  value={form.website || ""}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@dealership.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dealership">Dealership</Label>
                <Input
                  id="dealership"
                  value={form.dealership}
                  onChange={(e) => setForm((f) => ({ ...f, dealership: e.target.value }))}
                  placeholder="Olympic Auto Group"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={form.phone || ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(604) 555-0123"
                  autoComplete="tel"
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !validation.success}
                className="w-full bg-[#022d60] hover:bg-[#022d60]/90 text-white"
              >
                {isSubmitting ? "Submitting…" : "Request access"}
              </Button>

              <p className="text-xs text-gray-500">
                By submitting, you agree to be contacted about Lotview.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
