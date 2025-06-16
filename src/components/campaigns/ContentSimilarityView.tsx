
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, UserCheck, Percent, Link as LinkIcon, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import type { Campaign, ExtractedContentItem, AnalyzeContentInput } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { analyzeContent as analyzeContentService } from '@/lib/services/campaignService.production';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';

interface ContentSimilarityViewProps {
  campaign: Campaign;
  onAnalysisComplete?: (updatedCampaign: Campaign) => void; // Callback to update parent campaign state
}

const getSimilarityBadgeVariant = (score: number) => {
  if (score > 75) return "default"; 
  if (score > 50) return "secondary";
  if (score > 25) return "outline"; 
  return "destructive"; 
};

export default function ContentSimilarityView({ campaign, onAnalysisComplete }: ContentSimilarityViewProps) {
  const { extractedContent = [], leads = [] } = campaign;
  const { toast } = useToast();
  const [analyzingContentId, setAnalyzingContentId] = useState<string | null>(null);

  const handleAnalyzeContent = async (item: ExtractedContentItem) => {
    if (!campaign) return;
    setAnalyzingContentId(item.id);
    try {
      const analysisInput: AnalyzeContentInput = {
        textContent: item.text,
        existingKeywords: item.text.toLowerCase().split(/\s+/).filter(kw => kw.length > 3).slice(0, 5), // Simple existing keywords
        campaignContext: campaign.name,
      };
      // The service will update the mock store, and polling will update the campaign prop
      await analyzeContentService(analysisInput, campaign.id, item.id); 
      
      toast({
        title: "AI Analysis Complete",
        description: `Advanced analysis for content from ${item.sourceUrl || 'source'} finished.`,
      });
       if (onAnalysisComplete) {
           // This callback is less critical now that the service updates the store,
           // but can be kept if parent needs an explicit signal.
           // onAnalysisComplete(updatedCampaignData); 
       }

    } catch (error: unknown) {
      toast({
        title: "AI Analysis Failed",
        description: error instanceof Error ? error.message : "Could not complete AI analysis.",
        variant: "destructive",
      });
    } finally {
      setAnalyzingContentId(null);
    }
  };


  if (extractedContent.length === 0 && leads.length === 0 && campaign.currentPhase !== 'LeadGeneration' && campaign.phaseStatus !== 'InProgress') {
    return (
      <Card className="shadow-md mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            Content & Lead Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No content or lead data available for this campaign yet. This information will appear after the Lead Generation phase completes.</p>
        </CardContent>
      </Card>
    );
  }
   if (extractedContent.length === 0 && leads.length === 0 && campaign.currentPhase === 'LeadGeneration' && campaign.phaseStatus === 'InProgress') {
     return (
      <Card className="shadow-md mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="mr-2 h-5 w-5 text-primary animate-spin" />
            Analyzing Content & Generating Leads...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-4">Real-time results will appear here as leads are identified.</p>
        </CardContent>
      </Card>
    );
   }


  return (
    <Card className="shadow-xl mt-6">
       <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Content & Lead Analysis Results
        </CardTitle>
        <CardDescription>
          Review extracted content snippets and generated leads, along with their similarity to previously discovered information and AI-powered analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="content">
              <FileText className="mr-2 h-4 w-4"/> Extracted Content ({extractedContent.length})
            </TabsTrigger>
            <TabsTrigger value="leads">
              <UserCheck className="mr-2 h-4 w-4"/> Generated Leads ({leads.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="content" className="mt-4">
            {extractedContent.length > 0 ? (
            <ScrollArea className="h-[400px] pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[45%]">Content Snippet / Summary</TableHead>
                    <TableHead>Keywords / Categories</TableHead>
                    <TableHead><Percent className="inline mr-1 h-4 w-4"/>Sim.</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Source / Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractedContent.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-xs">
                        <p className="font-medium truncate" title={item.text}>{item.text.substring(0,100)}{item.text.length > 100 ? "..." : ""}</p>
                        {item.advancedAnalysis?.summary && <p className="text-xs text-muted-foreground italic mt-1">AI Summary: {item.advancedAnalysis.summary}</p>}
                      </TableCell>
                       <TableCell className="text-xs">
                        {item.advancedAnalysis?.advancedKeywords && item.advancedAnalysis.advancedKeywords.length > 0 && (
                          <div>
                            <strong className="block text-sky-600">AI Keywords:</strong>
                            {item.advancedAnalysis.advancedKeywords.join(', ')}
                          </div>
                        )}
                        {item.advancedAnalysis?.categories && item.advancedAnalysis.categories.length > 0 && (
                          <div className="mt-1">
                            <strong className="block text-purple-600">AI Categories:</strong>
                            {item.advancedAnalysis.categories.join(', ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSimilarityBadgeVariant(item.similarityScore)}>
                          {item.similarityScore}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                         {item.advancedAnalysis?.sentiment && item.advancedAnalysis.sentiment !== 'N/A' ? (
                           <Badge variant={
                               item.advancedAnalysis.sentiment === 'Positive' ? 'default' : 
                               item.advancedAnalysis.sentiment === 'Negative' ? 'destructive' : 'secondary'
                           } className="text-xs">
                             {item.advancedAnalysis.sentiment}
                           </Badge>
                         ) : item.advancedAnalysis ? <Badge variant="outline" className="text-xs">N/A</Badge> : null}
                      </TableCell>
                      <TableCell>
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center text-xs mb-1">
                            View Source <ExternalLink className="ml-1 h-3 w-3 opacity-70"/>
                          </a>
                        ) : <span className="text-xs text-muted-foreground mb-1 block">N/A</span>}
                        {item.previousCampaignId && <span className="block text-xs text-muted-foreground mb-2">vs C-{item.previousCampaignId.substring(0,4)}</span>}
                        {!item.advancedAnalysis && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleAnalyzeContent(item)}
                            disabled={analyzingContentId === item.id}
                          >
                            {analyzingContentId === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Sparkles className="mr-1 h-3 w-3"/>}
                            Analyze
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-sm p-4 text-center">No extracted content for this campaign.</p>
            )}
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            {leads.length > 0 ? (
            <ScrollArea className="h-[400px] pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name/Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead><Percent className="inline mr-1 h-4 w-4"/>Similarity</TableHead>
                    <TableHead><LinkIcon className="inline mr-1 h-4 w-4"/>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <p className="font-medium">{lead.name || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">{lead.email || 'N/A'}</p>
                      </TableCell>
                      <TableCell>{lead.company || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={getSimilarityBadgeVariant(lead.similarityScore)}>
                          {lead.similarityScore}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {lead.sourceUrl ? (
                           <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center text-xs">
                            View Source <ExternalLink className="ml-1 h-3 w-3 opacity-70"/>
                          </a>
                        ) : 'N/A'}
                        {lead.previousCampaignId && <span className="block text-xs text-muted-foreground">vs C-{lead.previousCampaignId.substring(0,4)}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-sm p-4 text-center">No leads generated for this campaign.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
