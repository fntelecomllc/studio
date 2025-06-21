/* eslint-disable react/prop-types */
import React, { memo } from 'react';
import { Control } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignFormValues } from "@/lib/schemas/campaignFormSchema";

interface DomainGenerationConfigProps {
  control: Control<CampaignFormValues>;
  totalPossible: number;
  calculationDetails?: {
    pattern: string;
    charSetLength: number;
    prefixLength: number;
    suffixLength: number;
    tldCount: number;
    combinations: number;
  };
  calculationWarning?: string | null;
  isCalculationSafe: boolean;
}

/**
 * Memoized domain generation configuration component
 * Prevents re-renders when form values haven't changed
 */
const DomainGenerationConfig = memo<DomainGenerationConfigProps>(({
  control,
  totalPossible,
  calculationDetails,
  calculationWarning,
  isCalculationSafe
}): React.ReactElement => {
  return (
    <Card className="p-4 pt-2 border-dashed">
      <CardHeader className="p-2">
        <CardTitle className="text-base">Domain Generation Configuration</CardTitle>
        <CardDescription className="text-xs">Configure how domains will be generated.</CardDescription>
      </CardHeader>
      <CardContent className="p-2 space-y-4">
        <FormField control={control} name="generationPattern" render={({ field }) => (
          <FormItem>
            <FormLabel>Generation Pattern</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select pattern" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="prefix_variable">Prefix Variable (e.g., [aaa]constant.com)</SelectItem>
                <SelectItem value="suffix_variable">Suffix Variable (e.g., constant[aaa].com)</SelectItem>
                <SelectItem value="both_variable">Prefix & Suffix Variable (e.g., [aaa]constant[bbb].com)</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={control} name="constantPart" render={({ field }) => (
          <FormItem>
            <FormLabel>Constant Part</FormLabel>
            <FormControl>
              <Input placeholder="e.g., business, tech, shop" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={control} name="allowedCharSet" render={({ field }) => (
          <FormItem>
            <FormLabel>Allowed Character Set</FormLabel>
            <FormControl>
              <Input placeholder="e.g., abcdefghijklmnopqrstuvwxyz0123456789" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={control} name="tldsInput" render={({ field }) => (
          <FormItem>
            <FormLabel>TLDs (comma-separated)</FormLabel>
            <FormControl>
              <Input placeholder="e.g., .com, .net, .org" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={control} name="prefixVariableLength" render={({ field }) => (
            <FormItem>
              <FormLabel>Prefix Variable Length</FormLabel>
              <FormControl>
                <Input type="number" min="0" placeholder="3" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={control} name="suffixVariableLength" render={({ field }) => (
            <FormItem>
              <FormLabel>Suffix Variable Length</FormLabel>
              <FormControl>
                <Input type="number" min="0" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={control} name="maxDomainsToGenerate" render={({ field }) => (
          <FormItem>
            <FormLabel>Maximum Domains to Generate</FormLabel>
            <FormControl>
              <Input type="number" min="1" placeholder="1000" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Performance-aware domain calculation display */}
        {totalPossible > 0 && (
          <div className={`p-3 rounded-md ${isCalculationSafe ? 'bg-muted' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="text-sm font-medium text-muted-foreground">Total Possible Combinations</div>
            <div className={`text-lg font-semibold ${!isCalculationSafe ? 'text-yellow-700' : ''}`}>
              {totalPossible.toLocaleString()} domains
            </div>
            {calculationDetails !== undefined && (
              <div className="text-xs text-muted-foreground mt-1">
                Pattern: {calculationDetails.pattern} • 
                Character set length: {calculationDetails.charSetLength} • 
                {calculationDetails.pattern === 'prefix_variable' && `Prefix length: ${calculationDetails.prefixLength} • `}
                {calculationDetails.pattern === 'suffix_variable' && `Suffix length: ${calculationDetails.suffixLength} • `}
                {calculationDetails.pattern === 'both_variable' && `Prefix: ${calculationDetails.prefixLength}, Suffix: ${calculationDetails.suffixLength} • `}
                TLD count: {calculationDetails.tldCount}
              </div>
            )}
            {calculationWarning !== null && calculationWarning !== undefined && (
              <div className="text-xs text-yellow-700 mt-2 font-medium">
                ⚠️ {calculationWarning}
              </div>
            )}
          </div>
        )}

        {/* Read-only total display for form compatibility */}
        <FormItem>
          <FormLabel>Total Possible Domains</FormLabel>
          <FormControl>
            <Input 
              value={totalPossible.toString()} 
              readOnly 
              placeholder="Calculated total domains"
              className={!isCalculationSafe ? 'border-yellow-300 bg-yellow-50' : ''}
            />
          </FormControl>
        </FormItem>
      </CardContent>
    </Card>
  );
});

DomainGenerationConfig.displayName = 'DomainGenerationConfig';

export default DomainGenerationConfig;