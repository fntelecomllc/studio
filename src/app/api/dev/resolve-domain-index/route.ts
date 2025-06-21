
import { NextResponse } from 'next/server';
import type { GenerateDomainsInput } from '@/ai/flows/generate-domains-flow';

interface ResolveDomainIndexResponse {
  index: number | null;
  iterations: number;
  found: boolean;
  searchLimitReached: boolean;
  totalPossibleInConfig: number;
  inputUsed: GenerateDomainsInput;
  errorMessage?: string;
  message?: string; // For general messages
}

// const DEV_RESOLVER_SEARCH_LIMIT = 2000000; // Cap iterations for this dev tool // Commented out as core logic is removed

export function POST(): NextResponse {
  try {
    // const body: ResolveDomainIndexRequest = await request.json();
    // const { domainToFind, config: partialConfig } = body;

    // if (!domainToFind) {
    //   return NextResponse.json({ errorMessage: "domainToFind is required." }, { status: 400 });
    // }

    // const fullInputForValidation: Partial<GenerateDomainsInput> = {
    //     ...partialConfig,
    //     offset: 0, 
    //     count: 1,  
    //     generationPattern: partialConfig.generationPattern,
    //     constantPart: partialConfig.constantPart,
    //     allowedCharSet: partialConfig.allowedCharSet,
    //     tlds: partialConfig.tlds,
    //     prefixVariableLength: partialConfig.prefixVariableLength,
    //     suffixVariableLength: partialConfig.suffixVariableLength,
    // };

    // const validationResult = GenerateDomainsInputSchema.safeParse(fullInputForValidation);

    // if (!validationResult.success) {
    //   return NextResponse.json({
    //     errorMessage: "Invalid input configuration.",
    //     errors: validationResult.error.flatten().fieldErrors,
    //   }, { status: 400 });
    // }
    // const validatedInput = validationResult.data;

    // const uniqueCharSetArray = Array.from(new Set(validatedInput.allowedCharSet.split('')));
    
    // if (uniqueCharSetArray.length === 0 && (validatedInput.prefixVariableLength > 0 || validatedInput.suffixVariableLength > 0)) {
    //      return NextResponse.json({ errorMessage: "Allowed character set is effectively empty." }, { status: 400 });
    // }
    // if (validatedInput.tlds.length === 0) {
    //      return NextResponse.json({ errorMessage: "No TLDs provided in config." }, { status: 400 });
    // }

    // const maxSldCombos = calculateMaxSldCombinations(
    //      {
    //         generationPattern: validatedInput.generationPattern,
    //         prefixVariableLength: validatedInput.prefixVariableLength,
    //         suffixVariableLength: validatedInput.suffixVariableLength,
    //     },
    //     uniqueCharSetArray.length
    // );
    // const totalPossibleInConfig = maxSldCombos * validatedInput.tlds.length;

    // let foundIndex: number | null = null;
    // let iterations = 0;
    // let searchLimitReached = false;

    // const searchCap = Math.min(totalPossibleInConfig, DEV_RESOLVER_SEARCH_LIMIT);

    // for (let i = 0; i < searchCap; i++) {
    //   iterations++;
    //   // const domain = domainFromIndex(i, validatedInput, uniqueCharSetArray, maxSldCombos); // Logic removed
    //   // if (domain === domainToFind) {
    //   //   foundIndex = i;
    //   //   break;
    //   // }
    // }

    // if (foundIndex === null && iterations >= searchCap && totalPossibleInConfig > DEV_RESOLVER_SEARCH_LIMIT) {
    //   searchLimitReached = true;
    // }
    
    // const response: ResolveDomainIndexResponse = {
    //   index: foundIndex,
    //   iterations,
    //   found: foundIndex !== null,
    //   searchLimitReached,
    //   totalPossibleInConfig,
    //   inputUsed: validatedInput,
    // };

    // if (searchLimitReached) {
    //     response.errorMessage = `Domain not found within search limit of ${DEV_RESOLVER_SEARCH_LIMIT} iterations. Total possible for config: ${totalPossibleInConfig}.`;
    // }

    const response: ResolveDomainIndexResponse = {
        index: null,
        iterations: 0,
        found: false,
        searchLimitReached: false,
        totalPossibleInConfig: 0,
        inputUsed: {} as GenerateDomainsInput, // Placeholder
        message: "Domain index resolution is now handled by the backend.",
        errorMessage: "This frontend developer utility endpoint is deprecated. Use backend tools for index resolution.",
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: unknown) {
    console.error("/api/dev/resolve-domain-index error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ errorMessage }, { status: 500 });
  }
}

// Basic OPTIONS handler for CORS preflight if needed by frontend dev tools
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
