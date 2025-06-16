
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Proxy, CreateProxyPayload, UpdateProxyPayload, ProxyProtocol, ProxyStatus } from '@/lib/types';
import { createProxy, updateProxy } from '@/lib/services/proxyService.production';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from "lucide-react";

const PROXY_PROTOCOLS: ProxyProtocol[] = ['http', 'https', 'socks4', 'socks5'];
const INITIAL_PROXY_STATUSES: ProxyStatus[] = ['Active', 'Disabled']; // For creating new proxy

const proxyFormSchema = z.object({
  address: z.string().min(7, { message: "Proxy address must be at least 7 characters (e.g., 1.2.3.4:80)." }),
  protocol: z.enum(PROXY_PROTOCOLS as [ProxyProtocol, ...ProxyProtocol[]], { required_error: "Protocol is required." }),
  notes: z.string().optional(),
  initialStatus: z.enum(INITIAL_PROXY_STATUSES as [ProxyStatus, ...ProxyStatus[]]).optional(),
});

type ProxyFormValues = z.infer<typeof proxyFormSchema>;

interface ProxyFormProps {
  proxyToEdit?: Proxy | null;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export default function ProxyForm({ proxyToEdit, onSaveSuccess, onCancel }: ProxyFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditing = !!proxyToEdit;

  const form = useForm<ProxyFormValues>({
    resolver: zodResolver(proxyFormSchema),
    defaultValues: isEditing && proxyToEdit ? {
      address: proxyToEdit.address,
      protocol: proxyToEdit.protocol,
      notes: proxyToEdit.notes || "",
      // initialStatus is not used for editing, status is managed by test/toggle
    } : {
      address: "",
      protocol: 'http',
      notes: "",
      initialStatus: 'Disabled',
    },
    mode: "onChange",
  });

  async function onSubmit(data: ProxyFormValues) {
    if (!user) {
      toast({ title: "Authentication Required", description: "Please log in to create or edit proxies.", variant: "destructive" });
      return;
    }

    try {
      let response;
      if (isEditing && proxyToEdit) {
        const payload: UpdateProxyPayload = {
          address: data.address,
          protocol: data.protocol,
          notes: data.notes,
          // Status is generally not updated via this form directly in edit mode
        };
        response = await updateProxy(proxyToEdit.id, payload);
      } else {
        const payload: CreateProxyPayload = {
          address: data.address,
          protocol: data.protocol,
          notes: data.notes,
          initialStatus: data.initialStatus || 'Disabled',
        };
        response = await createProxy(payload);
      }

      if (response.status === 'success' && response.data) {
        onSaveSuccess();
      } else {
        toast({ title: `Error ${isEditing ? "Updating" : "Creating"} Proxy`, description: response.message, variant: "destructive" });
        if (response.errors) {
          response.errors.forEach((err: unknown) => {
            const error = err as { field?: string; message?: string };
            if (error.field) {
              form.setError(error.field as keyof ProxyFormValues, { type: "manual", message: error.message || "Validation error" });
            }
          });
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({ title: "Operation Failed", description: errorMessage, variant: "destructive" });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proxy Address</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 127.0.0.1:8080 or socks5://user:pass@host:port" {...field} />
              </FormControl>
              <FormDescription>
                Include IP/hostname and port. For authenticated proxies, use format: protocol://user:password@host:port
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="protocol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Protocol</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a protocol" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PROXY_PROTOCOLS.map(protocol => (
                    <SelectItem key={protocol} value={protocol}>{protocol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Any notes about this proxy (e.g., provider, location)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!isEditing && (
            <FormField
            control={form.control}
            name="initialStatus"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Initial Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select initial status" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    {INITIAL_PROXY_STATUSES.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                <FormDescription>Set the initial status for this new proxy. It&apos;s recommended to start as &apos;Disabled&apos; until tested.</FormDescription>
                <FormMessage />
                </FormItem>
            )}
            />
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Add Proxy'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
