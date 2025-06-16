"use client"; // This page uses hooks like useSearchParams which require client components

import { Suspense } from 'react';
import CampaignFormV2 from '@/components/campaigns/CampaignFormV2';
import { Loader2 } from 'lucide-react';
// PageHeader is now rendered internally by CampaignForm for new campaigns
// import PageHeader from '@/components/shared/PageHeader';
// import { Target } from 'lucide-react';

function CampaignFormWithSuspense() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading campaign form...</span>
      </div>
    }>
      <CampaignFormV2 />
    </Suspense>
  );
}

export default function NewCampaignPage() {
  return (
    <>
      {/*
        PageHeader is now handled by CampaignForm itself when !isEditing
        This allows CampaignForm to dynamically update the title based on selectedType
      */}
      <CampaignFormWithSuspense />
    </>
  );
}
