"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PageHeader from '@/components/shared/PageHeader';
import { Target, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { CAMPAIGN_SELECTED_TYPES } from "@/lib/constants";
import type { Campaign, CampaignSelectedType, CreateCampaignPayload, CampaignPhase, DomainGenerationPattern } from '@/lib/types';
import { createCampaign } from "@/lib/services/campaignService.production";
import { 
  campaignFormSchema, 
  CampaignFormConstants, 
  CampaignFormValues, 
  getDefaultSourceMode, 
  needsHttpPersona, 
  needsDnsPersona 
} from "@/lib/schemas/campaignFormSchema";
import React, { useCallback, useMemo, useState } from "react";
import { FormErrorSummary } from '@/components/ui/form-field-error';
import { extractFieldErrors, createUserFriendlyError, type FormErrorState } from '@/lib/utils/errorHandling';

// Performance-optimized hooks
import { useDomainCalculation } from "@/lib/hooks/useDomainCalculation";
import { useCampaignFormData } from "@/lib/hooks/useCampaignFormData";

// Memoized sub-components
import DomainGenerationConfig from "./form/DomainGenerationConfig";
import DomainSourceConfig from "./form/DomainSourceConfig";
import KeywordConfig from "./form/KeywordConfig";
import OperationalAssignments from "./form/OperationalAssignments";

interface CampaignFormProps {
  campaignToEdit?: Campaign;
  isEditing?: boolean;
}

/**
 * Performance-optimized CampaignFormV2 component
 * 
 * Key optimizations implemented:
 * 1. Domain calculation uses debounced useMemo with performance safeguards
 * 2. Async data loading optimized with proper error handling and caching
 * 3. Component split into memoized sub-components to reduce re-renders
 * 4. Form validation optimized to reduce computation overhead
 * 5. React concurrent features best practices implemented
 */
export default function CampaignFormV2({ campaignToEdit, isEditing = false }: CampaignFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // Enhanced error handling state
  const [formFieldErrors, setFormFieldErrors] = useState<FormErrorState>({});
  const [formMainError, setFormMainError] = useState<string | null>(null);

  // Optimized data loading with improved error handling and caching
  const {
    httpPersonas,
    dnsPersonas,
    sourceCampaigns,
    isLoading: loadingSelectData,
    error: dataLoadError
  } = useCampaignFormData(isEditing);

  const preselectedType = !isEditing ? (searchParams.get('type') as CampaignSelectedType | null) : null;

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: isEditing && campaignToEdit ? campaignToEdit.name : "",
      description: isEditing && campaignToEdit ? (campaignToEdit.description || "") : "",
      selectedType: isEditing && campaignToEdit ? campaignToEdit.selectedType : (preselectedType && Object.values(CAMPAIGN_SELECTED_TYPES).includes(preselectedType) ? preselectedType : undefined),
      domainSourceSelectionMode: isEditing && campaignToEdit ? 
        (campaignToEdit.domainSourceConfig?.type === 'current_campaign_output' ? 'campaign_output' as const : (campaignToEdit.domainSourceConfig?.type as any || getDefaultSourceMode(campaignToEdit.selectedType))) : 
        getDefaultSourceMode(preselectedType),
      sourceCampaignId: isEditing && campaignToEdit ? (campaignToEdit.domainSourceConfig?.sourceCampaignId || CampaignFormConstants.NONE_VALUE_PLACEHOLDER) : CampaignFormConstants.NONE_VALUE_PLACEHOLDER,
      sourcePhase: isEditing && campaignToEdit ? (campaignToEdit.domainSourceConfig?.sourcePhase as CampaignPhase) : undefined,
      uploadedDomainsFile: null,
      uploadedDomainsContentCache: isEditing && campaignToEdit ? (campaignToEdit.domainSourceConfig?.type === 'upload' ? campaignToEdit.domainSourceConfig.uploadedDomains : []) : [],
      initialDomainsToProcessCount: isEditing && campaignToEdit ? campaignToEdit.initialDomainsToProcessCount : 100,
      
      generationPattern: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.generationPattern as DomainGenerationPattern || "prefix_variable") : "prefix_variable",
      constantPart: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.constantPart || "") : "business",
      allowedCharSet: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.allowedCharSet || "abcdefghijklmnopqrstuvwxyz0123456789") : "abcdefghijklmnopqrstuvwxyz0123456789",
      tldsInput: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.tlds?.join(', ') || ".com") : ".com",
      prefixVariableLength: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.prefixVariableLength === undefined ? undefined : Number(campaignToEdit.domainGenerationConfig.prefixVariableLength)) : 3,
      suffixVariableLength: isEditing && campaignToEdit ? (campaignToEdit.domainGenerationConfig?.suffixVariableLength === undefined ? undefined : Number(campaignToEdit.domainGenerationConfig.suffixVariableLength)) : 0,
      maxDomainsToGenerate: isEditing && campaignToEdit ? campaignToEdit.domainGenerationConfig?.maxDomainsToGenerate : 1000,
      
      targetKeywordsInput: isEditing && campaignToEdit ? (campaignToEdit.leadGenerationSpecificConfig?.targetKeywords?.join(', ') || "") : "telecom, voip, saas",
      scrapingRateLimitRequests: isEditing && campaignToEdit ? campaignToEdit.leadGenerationSpecificConfig?.scrapingRateLimit?.requests : 1,
      scrapingRateLimitPer: isEditing && campaignToEdit ? (campaignToEdit.leadGenerationSpecificConfig?.scrapingRateLimit?.per as "second" | "minute" || 'second') : 'second',
      requiresJavaScriptRendering: isEditing && campaignToEdit ? (campaignToEdit.leadGenerationSpecificConfig?.requiresJavaScriptRendering || false) : false,
      
      assignedHttpPersonaId: isEditing && campaignToEdit ? (campaignToEdit.assignedHttpPersonaId || CampaignFormConstants.NONE_VALUE_PLACEHOLDER) : CampaignFormConstants.NONE_VALUE_PLACEHOLDER,
      assignedDnsPersonaId: isEditing && campaignToEdit ? (campaignToEdit.assignedDnsPersonaId || CampaignFormConstants.NONE_VALUE_PLACEHOLDER) : CampaignFormConstants.NONE_VALUE_PLACEHOLDER,
      proxyAssignmentMode: isEditing && campaignToEdit ? (campaignToEdit.proxyAssignment?.mode as "none" | "single" | "rotate_active" || 'none') : 'none',
      assignedProxyId: isEditing && campaignToEdit ? ((campaignToEdit.proxyAssignment?.mode === 'single' && campaignToEdit.proxyAssignment.proxyId) ? campaignToEdit.proxyAssignment.proxyId : CampaignFormConstants.NONE_VALUE_PLACEHOLDER) : CampaignFormConstants.NONE_VALUE_PLACEHOLDER,
    },
    mode: "onChange"
  });

  const { control, formState: { isSubmitting }, watch, setValue } = form;
  const typedControl = control as any; // Workaround for TypeScript inference issue
  const selectedCampaignType = watch("selectedType");

  // Performance-optimized domain calculation with debouncing and safeguards
  const generationPattern = watch("generationPattern");
  const allowedCharSet = watch("allowedCharSet");
  const prefixVariableLength = watch("prefixVariableLength");
  const suffixVariableLength = watch("suffixVariableLength");
  const tldsInput = watch("tldsInput");

  const domainCalculation = useDomainCalculation(
    selectedCampaignType,
    generationPattern,
    allowedCharSet,
    prefixVariableLength,
    suffixVariableLength,
    tldsInput
  );

  // Memoized form submission handler to prevent unnecessary re-creates
  const onSubmit = useCallback(async (data: CampaignFormValues) => {
    try {
      // Build campaign payload based on campaign type
      const campaignPayload: CreateCampaignPayload = {
        name: data.name,
        campaignType: data.selectedType,
      };

      // Add domain generation config for domain_generation campaigns
      if (data.selectedType === 'domain_generation') {
        // Validate required fields
        if (!data.generationPattern) {
          toast({
            title: "Validation Error",
            description: "Generation pattern is required for domain generation campaigns.",
            variant: "destructive"
          });
          return;
        }
        
        if (!data.constantPart || data.constantPart.trim() === '') {
          toast({
            title: "Validation Error",
            description: "Constant part is required and cannot be empty.",
            variant: "destructive"
          });
          return;
        }
        
        // Parse TLDs from comma-separated input
        const tlds = data.tldsInput ? data.tldsInput.split(',').map(tld => {
          const trimmed = tld.trim();
          return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
        }).filter(tld => tld.length > 1) : ['.com'];

        // Ensure numeric values are properly converted
        const prefixLength = data.prefixVariableLength !== undefined ? Number(data.prefixVariableLength) : 3;
        const suffixLength = data.suffixVariableLength !== undefined ? Number(data.suffixVariableLength) : 0;
        const maxDomains = data.maxDomainsToGenerate !== undefined ? Number(data.maxDomainsToGenerate) : 1000;
        
        // Validate numeric values
        if (isNaN(prefixLength) || prefixLength < 0) {
          toast({
            title: "Validation Error",
            description: "Prefix variable length must be a valid non-negative number.",
            variant: "destructive"
          });
          return;
        }
        
        if (isNaN(suffixLength) || suffixLength < 0) {
          toast({
            title: "Validation Error",
            description: "Suffix variable length must be a valid non-negative number.",
            variant: "destructive"
          });
          return;
        }
        
        if (isNaN(maxDomains) || maxDomains < 1) {
          toast({
            title: "Validation Error",
            description: "Maximum domains to generate must be at least 1.",
            variant: "destructive"
          });
          return;
        }

        campaignPayload.domainGenerationParams = {
          patternType: data.generationPattern,
          constantString: data.constantPart.trim(),
          characterSet: data.allowedCharSet || 'abcdefghijklmnopqrstuvwxyz0123456789',
          tld: tlds[0] || '.com', // Use first TLD as primary
          variableLength: prefixLength,
          numDomainsToGenerate: maxDomains,
          totalPossibleCombinations: maxDomains,
          currentOffset: 0,
        };
      }

      // Add domain source config for validation campaigns
      if (data.selectedType === 'dns_validation' || data.selectedType === 'http_keyword_validation') {
        campaignPayload.dnsValidationParams = {
          sourceGenerationCampaignId: data.sourceCampaignId !== CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? data.sourceCampaignId : undefined,
          personaIds: data.assignedDnsPersonaId && data.assignedDnsPersonaId !== CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? [data.assignedDnsPersonaId] : [],
          rotationIntervalSeconds: 300,
          processingSpeedPerMinute: 60,
          batchSize: 10,
          retryAttempts: 3,
          metadata: {}
        };
      }

      // Add lead generation config for HTTP keyword validation
      if (data.selectedType === 'http_keyword_validation') {
        campaignPayload.httpKeywordValidationParams = {
          sourceCampaignId: data.sourceCampaignId && data.sourceCampaignId !== CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? data.sourceCampaignId : '',
          keywordSetIds: [],
          adHocKeywords: data.targetKeywordsInput ? data.targetKeywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0) : [],
          personaIds: data.assignedHttpPersonaId && data.assignedHttpPersonaId !== CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? [data.assignedHttpPersonaId] : [],
          proxyIds: data.assignedProxyId && data.assignedProxyId !== CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? [data.assignedProxyId] : undefined,
          rotationIntervalSeconds: 300,
          processingSpeedPerMinute: 60,
          batchSize: 10,
          retryAttempts: 3,
          targetHttpPorts: [80, 443],
          sourceType: 'campaign_output',
          metadata: {}
        };
      }

      // Handle campaign creation
      if (isEditing && campaignToEdit) {
        // In production API, campaigns are immutable after creation
        toast({
          title: "Campaign Editing Not Supported",
          description: "Please create a new campaign with the desired settings. Campaigns cannot be edited after creation.",
          variant: "destructive"
        });
        return;
      } else {
        const response = await createCampaign(campaignPayload);

        if (response.status === 'success' && response.data) {
          toast({
            title: "Campaign Created Successfully",
            description: `Campaign "${response.data.name}" has been created.`,
            variant: "default"
          });
          
          // Redirect to campaign detail page
          router.push(`/campaigns/${response.data.id}`);
          router.refresh();
        } else {
          console.error('[CampaignForm] Campaign creation failed:', response);
          
          // Handle API response errors with field details
          if (response.status === 'error') {
            const fieldErrors = extractFieldErrors(response);
            const mainError = createUserFriendlyError(response);
            
            if (Object.keys(fieldErrors).length > 0) {
              setFormFieldErrors(fieldErrors);
              setFormMainError('Please correct the highlighted fields.');
            } else {
              setFormFieldErrors({});
              setFormMainError(mainError);
            }
            
            // Still show toast for immediate feedback
            toast({
              title: "Error Creating Campaign",
              description: mainError,
              variant: "destructive"
            });
          } else {
            const errorMessage = response.message || "Failed to create campaign. Please check your inputs and try again.";
            setFormMainError(errorMessage);
            setFormFieldErrors({});
            
            toast({
              title: "Error Creating Campaign",
              description: errorMessage,
              variant: "destructive"
            });
          }
        }
      }
    } catch (error: unknown) {
      console.error('[CampaignForm] Campaign creation error:', error);
      
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('Authentication failed')) {
          toast({
            title: "Authentication Error",
            description: "Your session has expired. Please log in again.",
            variant: "destructive"
          });
          router.push('/login');
        } else if (error.message.includes('Validation error')) {
          toast({
            title: "Validation Error",
            description: error.message,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error Creating Campaign",
            description: error.message || "An unexpected error occurred. Please try again.",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Error Creating Campaign",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive"
        });
      }
    }
  }, [toast, router, isEditing, campaignToEdit]);

  // Clear errors when form values change
  const clearFormErrors = useCallback(() => {
    if (Object.keys(formFieldErrors).length > 0 || formMainError) {
      setFormFieldErrors({});
      setFormMainError(null);
    }
  }, [formFieldErrors, formMainError]);

  // Watch for form changes to clear errors
  React.useEffect(() => {
    const subscription = form.watch(() => {
      clearFormErrors();
    });
    return () => subscription.unsubscribe();
  }, [form, clearFormErrors]);

  // Memoized persona requirements to prevent unnecessary recalculations
  const needsHttp = useMemo(() => needsHttpPersona(selectedCampaignType), [selectedCampaignType]);
  const needsDns = useMemo(() => needsDnsPersona(selectedCampaignType), [selectedCampaignType]);

  // Memoized page header props
  const pageHeaderProps = useMemo(() => ({
    title: isEditing
      ? `Edit Campaign: ${campaignToEdit?.name || ''}`
      : selectedCampaignType
      ? `Create New ${selectedCampaignType} Campaign`
      : "Create New Campaign",
    description: isEditing
      ? "Modify the details and configuration for this campaign."
      : "Configure and launch your domain intelligence or lead generation initiative.",
  }), [isEditing, campaignToEdit?.name, selectedCampaignType]);

  // Show data loading error if critical data failed to load
  if (dataLoadError) {
    return (
      <Card className="max-w-2xl mx-auto shadow-xl">
        <CardContent className="p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Form Data</h3>
            <p className="text-muted-foreground mb-4">{dataLoadError}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Reload Page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {!isEditing && (
        <PageHeader
          title={pageHeaderProps.title}
          description={pageHeaderProps.description}
          icon={Target}
        />
      )}
      <Card className="max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle>{isEditing ? "Edit Campaign Details" : "Campaign Configuration"}</CardTitle>
          <CardDescription>
            {isEditing ? `Modifying: ${campaignToEdit?.name}` : "Define settings for your new campaign."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Form Error Summary */}
              <FormErrorSummary 
                errors={formFieldErrors}
                mainError={formMainError}
                className="mb-6"
              />
              
              {/* Basic Campaign Information */}
              <FormField control={typedControl} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Q3 Tech Outreach" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={typedControl} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe goals or targets." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={typedControl} name="selectedType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Type</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    setValue("domainSourceSelectionMode", getDefaultSourceMode(value as CampaignSelectedType));
                  }} value={field.value} disabled={isEditing}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(CAMPAIGN_SELECTED_TYPES).map((type: string) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Performance-optimized Domain Generation Configuration */}
              {selectedCampaignType === 'domain_generation' && (
                <DomainGenerationConfig
                  control={typedControl}
                  totalPossible={domainCalculation.total}
                  calculationDetails={domainCalculation.details}
                  calculationWarning={domainCalculation.warning}
                  isCalculationSafe={domainCalculation.isSafe}
                />
              )}

              {/* Optimized Domain Source Configuration */}
              {(selectedCampaignType === 'dns_validation' || selectedCampaignType === 'http_keyword_validation') && (
                <DomainSourceConfig
                  control={typedControl}
                  watch={watch}
                  sourceCampaigns={sourceCampaigns}
                  isLoading={loadingSelectData}
                />
              )}

              {/* Optimized Keyword Configuration */}
              {selectedCampaignType === 'http_keyword_validation' && (
                <KeywordConfig control={typedControl} />
              )}

              {/* Optimized Operational Assignments */}
              {(needsHttp || needsDns) && (
                <OperationalAssignments
                  control={typedControl}
                  needsHttp={needsHttp}
                  needsDns={needsDns}
                  httpPersonas={httpPersonas}
                  dnsPersonas={dnsPersonas}
                  isLoading={loadingSelectData}
                />
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || loadingSelectData}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isSubmitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Campaign")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}