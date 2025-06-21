"use client";

import PersonaForm from '@/components/personas/PersonaForm';
import PageHeader from '@/components/shared/PageHeader';
import type { Persona, PersonaDetailResponse } from '@/lib/types'; // PersonaDetailResponse added
import { UserCog, Globe, Wifi, AlertCircle } from 'lucide-react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getPersonaById } from '@/lib/services/personaService'; // Updated import
import { useToast } from '@/hooks/use-toast';

function EditPersonaPageContent(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const personaId = params.id as string;
  const personaTypeParam = searchParams.get('type') as 'http' | 'dns' | null; 
  
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (personaId === '') {
      setError("Persona ID is missing from URL.");
      setLoading(false);
      return;
    }
    if (personaTypeParam !== 'http' && personaTypeParam !== 'dns') {
      setError("Invalid or missing persona type specified in URL. Please ensure '?type=http' or '?type=dns' is present.");
      setLoading(false);
      return;
    }
    
    const type = personaTypeParam; 

    async function fetchPersona(): Promise<void> {
      setLoading(true);
      setError(null); 
      try {
        const response: PersonaDetailResponse = await getPersonaById(personaId, type);
        if (response.status === 'success' && response.data !== null && response.data !== undefined) {
          if (response.data.personaType !== type) {
            setError(`Mismatch: Persona ID '${personaId}' found, but it is a '${response.data.personaType}' persona, not '${type}'.`);
            setPersona(null);
            toast({ title: "Type Mismatch", description: `Persona found, but it's not of type '${type}'.`, variant: "destructive" });
          } else {
            setPersona(response.data);
          }
        } else {
          const errorMessage = response.message !== null && response.message !== undefined && response.message !== '' ? response.message : "Persona not found.";
          setError(errorMessage);
          setPersona(null);
          toast({ title: "Error Loading Persona", description: errorMessage, variant: "destructive" });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load persona data.";
        setError(message);
        setPersona(null);
        toast({ title: "Error Loading Persona Data", description: message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    void fetchPersona();
  }, [personaId, personaTypeParam, toast]); // Removed router from deps as it was not used

  if (loading) {
    const typeName = personaTypeParam === 'http' ? "HTTP" : personaTypeParam === 'dns' ? "DNS" : "Persona";
    return (
      <>
        <PageHeader title={`Edit ${typeName} Persona`} icon={UserCog} />
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-10 w-1/2" /> <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" /> <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <div className="flex justify-end gap-2"> <Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div>
        </div>
      </>
    );
  }

  if (error !== null || persona === null) {
    return (
       <div className="text-center py-10">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <PageHeader title="Error Loading Persona" description={error !== null && error !== '' ? error : "Persona data could not be loaded or found."} icon={UserCog} />
        <Button onClick={() => router.push('/personas')} className="mt-6">Back to Personas</Button>
      </div>
    );
  }
  
  const IconToUse = persona.personaType === 'http' ? Globe : Wifi;
  const typeNameDisplay = persona.personaType.toUpperCase();

  return (
    <>
      <PageHeader 
        title={`Edit ${typeNameDisplay} Persona: ${persona.name}`}
        description={`Modify the details for this ${typeNameDisplay} persona.`}
        icon={IconToUse}
      />
      <PersonaForm persona={persona} isEditing={true} personaType={persona.personaType} />
    </>
  );
}

export default function EditPersonaPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading persona editor...<Skeleton className="h-60 w-full mt-4" /></div>}>
      <EditPersonaPageContent />
    </Suspense>
  );
}