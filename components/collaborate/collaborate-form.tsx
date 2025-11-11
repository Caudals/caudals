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
          toast.error("Por favor revisa los campos destacados.");
          return;
        }

        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "")
            : "No pudimos enviar tu mensaje.";

        throw new Error(message || "Request failed");
      }

      setIsComplete(true);
      toast.success("Gracias por escribirnos. Respondemos en menos de 48h.");
      form.reset(defaultValues);
    } catch (error) {
      console.error("Failed to submit collaboration form", error);
      toast.error("No pudimos enviar tu mensaje. Inténtalo de nuevo.");
    }
  }

  if (isComplete) {
    return (
      <Card className="border border-border/70 bg-white/90 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            ¡Mensaje enviado!
          </CardTitle>
          <CardDescription>
            Nuestro equipo de partnerships te responderá en las próximas 48 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si quieres compartir más detalles mientras tanto, escríbenos directamente a
            <Button variant="link" className="px-1 text-base" asChild>
              <a href="mailto:contact@caudals.com">contact@caudals.com</a>
            </Button>
          </p>
          <Button variant="outline" onClick={() => setIsComplete(false)}>
            Enviar otro mensaje
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/70 bg-white/90 shadow-xl backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl">Comparte tu iniciativa</CardTitle>
        <CardDescription>
          Cuéntanos qué estás construyendo para diseñar un plan de colaboración a medida.
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
                    <FormLabel>Nombre completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Andrea Gómez" {...field} />
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
                    <FormLabel>Email de trabajo</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="andrea@empresa.com" {...field} />
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
                  <FormLabel>Empresa o entidad</FormLabel>
                  <FormControl>
                    <Input placeholder="Caudals Labs" {...field} />
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
                  <FormLabel>Website (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://caudals.com" {...field} />
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
                    <FormLabel>Tipo de colaboración</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el foco" />
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
                    <FormLabel>Tamaño del equipo (opcional)</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(value) => field.onChange(value === "" ? undefined : value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un rango" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Prefiero no decirlo</SelectItem>
                        {collaborationTeamSizes.map((size) => (
                          <SelectItem key={size} value={size}>
                            {size} personas
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
                  <FormLabel>Contexto y próximos pasos</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Cuéntanos sobre tu iniciativa, objetivos y cómo te gustaría colaborar con Caudals."
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
                  Enviando...
                </>
              ) : (
                <>
                  Enviar mensaje
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
