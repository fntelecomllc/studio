import React, { memo } from 'react';
import { Control, UseFormWatch } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignFormValues, CampaignFormConstants } from "@/lib/schemas/campaignFormSchema";
import type { Campaign } from '@/lib/types';

interface DomainSourceConfigProps {
  control: Control<CampaignFormValues>;
  watch: UseFormWatch<CampaignFormValues>;
  sourceCampaigns: Campaign[];
  isLoading: boolean;
}

/**
 * Memoized domain source configuration component
 * Handles domain source selection for validation campaigns
 */
const DomainSourceConfig = memo<DomainSourceConfigProps>(({
  control,
  watch,
  sourceCampaigns,
  isLoading
}) => {
  const domainSourceMode = watch("domainSourceSelectionMode");

  return (
    <Card className="p-4 pt-2 border-dashed">
      <CardHeader className="p-2">
        <CardTitle className="text-base">Domain Source Configuration</CardTitle>
        <CardDescription className="text-xs">Select source of domains to validate.</CardDescription>
      </CardHeader>
      <CardContent className="p-2 space-y-4">
        <FormField control={control} name="domainSourceSelectionMode" render={({ field }) => (
          <FormItem>
            <FormLabel>Domain Source</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="upload">Upload File</SelectItem>
                <SelectItem value="campaign_output">Use Output from Previous Campaign</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        {domainSourceMode === "campaign_output" && (
          <FormField control={control} name="sourceCampaignId" render={({ field }) => (
            <FormItem>
              <FormLabel>Source Campaign</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Loading campaigns..." : "Select campaign"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={CampaignFormConstants.NONE_VALUE_PLACEHOLDER}>Select a campaign...</SelectItem>
                  {sourceCampaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name} ({campaign.selectedType || campaign.campaignType})
                    </SelectItem>
                  ))}
                  {sourceCampaigns.length === 0 && !isLoading && (
                    <SelectItem value="no-source-campaigns" disabled>
                      No campaigns available as source
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        )}
      </CardContent>
    </Card>
  );
});

DomainSourceConfig.displayName = 'DomainSourceConfig';

export default DomainSourceConfig;