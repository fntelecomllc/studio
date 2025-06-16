import React, { memo } from 'react';
import { Control } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { CampaignFormValues } from "@/lib/schemas/campaignFormSchema";

interface KeywordConfigProps {
  control: Control<CampaignFormValues>;
}

/**
 * Memoized keyword configuration component
 * Handles keyword settings for HTTP validation campaigns
 */
const KeywordConfig = memo<KeywordConfigProps>(({ control }) => {
  return (
    <Card className="p-4 pt-2 border-dashed">
      <CardHeader className="p-2">
        <CardTitle className="text-base">Keyword Configuration</CardTitle>
        <CardDescription className="text-xs">Configure keywords to search for during HTTP validation.</CardDescription>
      </CardHeader>
      <CardContent className="p-2 space-y-4">
        <FormField control={control} name="targetKeywordsInput" render={({ field }) => (
          <FormItem>
            <FormLabel>Target Keywords (comma-separated)</FormLabel>
            <FormControl>
              <Textarea placeholder="e.g., telecom, voip, saas, technology" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </CardContent>
    </Card>
  );
});

KeywordConfig.displayName = 'KeywordConfig';

export default KeywordConfig;