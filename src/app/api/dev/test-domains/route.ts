
import { NextResponse } from 'next/server';
import type { GenerateDomainsInput } from '@/ai/flows/generate-domains-flow';
import { logger } from '@/lib/utils/logger';

interface TestDomainsResponse {
  domains: string[];
  totalAvailableInConfig: number;
  exhausted: boolean;
  inputUsed: GenerateDomainsInput; 
  errorMessage?: string;
  message?: string; 
}

export async function POST() {
  try {
    // const body: TestDomainsRequest = await request.json();
    // const { offset, count, config: partialConfig } = body;

    // const fullInputForValidation: Partial<GenerateDomainsInput> = {
    //     ...partialConfig, 
    //     offset: offset,
    //     count: count,
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
    
    // const domains: string[] = [];
    // const uniqueCharSetArray = Array.from(new Set(validatedInput.allowedCharSet.split('')));

    // if (uniqueCharSetArray.length === 0 && (validatedInput.prefixVariableLength > 0 || validatedInput.suffixVariableLength > 0)) {
    //      return NextResponse.json({
    //         domains: [],
    //         totalAvailableInConfig: 0,
    //         exhausted: true,
    //         inputUsed: validatedInput,
    //         errorMessage: "Allowed character set is effectively empty, cannot generate variable parts."
    //     }, { status: 200 });
    // }
    //  if (validatedInput.tlds.length === 0) {
    //      return NextResponse.json({
    //         domains: [],
    //         totalAvailableInConfig: 0,
    //         exhausted: true,
    //         inputUsed: validatedInput,
    //         errorMessage: "No TLDs provided, cannot generate domains."
    //     }, { status: 200 });
    // }

    // const maxSldCombos = calculateMaxSldCombinations(
    //     {
    //         generationPattern: validatedInput.generationPattern,
    //         prefixVariableLength: validatedInput.prefixVariableLength,
    //         suffixVariableLength: validatedInput.suffixVariableLength,
    //     },
    //     uniqueCharSetArray.length
    // );
    // const totalAvailableInConfig = maxSldCombos * validatedInput.tlds.length;

    // let yieldedCount = 0;
    // let currentOverallIndex = validatedInput.offset;
    // let iterations = 0; 

    // const devToolIterationLimit = Math.min(totalAvailableInConfig, validatedInput.offset + (validatedInput.count * 10) + 5000);

    // while (yieldedCount < validatedInput.count && currentOverallIndex < totalAvailableInConfig && currentOverallIndex < devToolIterationLimit) {
    //   // const domain = domainFromIndex(currentOverallIndex, validatedInput, uniqueCharSetArray, maxSldCombos); // Logic removed
    //   // if (domain) {
    //   //   domains.push(domain);
    //   //   yieldedCount++;
    //   // }
    //   currentOverallIndex++;
    //   iterations++;
    // }
    
    // const exhausted = validatedInput.offset + yieldedCount >= totalAvailableInConfig;

    const response: TestDomainsResponse = {
        domains: [],
        totalAvailableInConfig: 0,
        exhausted: true,
        inputUsed: {} as GenerateDomainsInput, // Placeholder
        message: "Domain generation testing is now handled by the backend.",
        errorMessage: "This frontend developer utility endpoint is deprecated. Use backend tools for domain generation testing.",
    };
    // if (iterations >= devToolIterationLimit && yieldedCount < validatedInput.count) {
    //     response.errorMessage = `Iteration limit (${devToolIterationLimit}) reached. Check for overly restrictive DNS rules or very large charsets/lengths.`;
    // }

    return NextResponse.json(response, { status: 200 });

  } catch (error: unknown) {
    logger.error("API route error", {
      route: "/api/dev/test-domains",
      error: error instanceof Error ? error.message : String(error),
      component: 'DevTestDomainsAPI'
    });
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ errorMessage }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
