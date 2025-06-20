import * as fs from 'fs';
import * as path from 'path';

interface ExtractedContracts {
  models: Record<string, any>;
  enums: Record<string, any>;
  [key: string]: any;
}

// Configuration for enum casing preservation
const ENUM_CASING_MAP: Record<string, Record<string, string>> = {
  CampaignStatus: {
    pending: 'Pending',
    queued: 'Queued',
    running: 'Running',
    pausing: 'Pausing',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
    archived: 'Archived',
    cancelled: 'Cancelled'
  },
  PersonaType: {
    dns: 'DNS',
    http: 'HTTP'
  },
  CampaignType: {
    domain_generation: 'DomainGeneration',
    dns_validation: 'DNSValidation',
    http_keyword_validation: 'HTTPKeywordValidation'
  }
};

// Configuration for int64 field mappings
const INT64_FIELD_MAPPINGS: Record<string, string[]> = {
  CampaignAPI: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'],
  Campaign: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'],
  AuthAuditLog: ['id'],
  RateLimit: ['id'],
  DomainGenerationCampaignParams: ['totalPossibleCombinations', 'currentOffset'],
  DomainGenerationConfigState: ['lastOffset'],
  GeneratedDomain: ['offsetIndex']
};

// Configuration for branded type fields
const BRANDED_TYPE_FIELDS: Record<string, Record<string, string>> = {
  User: { id: 'UUID', lastLoginIp: 'IPAddress' },
  UserAPI: { id: 'UUID' },
  Campaign: { id: 'UUID', userId: 'UUID' },
  CampaignAPI: { id: 'UUID', userId: 'UUID' },
  Persona: { id: 'UUID' },
  Proxy: { id: 'UUID' },
  KeywordSet: { id: 'UUID' },
  KeywordRule: { id: 'UUID', keywordSetId: 'UUID' },
  Role: { id: 'UUID' },
  Permission: { id: 'UUID' },
  UserRole: { userId: 'UUID', roleId: 'UUID', assignedBy: 'UUID' },
  RolePermission: { roleId: 'UUID', permissionId: 'UUID' },
  Session: { userId: 'UUID' },
  AuditLog: { id: 'UUID', userId: 'UUID', entityId: 'UUID' },
  DomainGenerationCampaignParams: {},
  DNSValidationCampaignParams: { sourceGenerationCampaignId: 'UUID' },
  HTTPKeywordCampaignParams: { sourceCampaignId: 'UUID' },
  GeneratedDomain: { id: 'UUID', generationCampaignId: 'UUID' },
  DNSValidationResult: { id: 'UUID', dnsCampaignId: 'UUID', generatedDomainId: 'UUID', validatedByPersonaId: 'UUID' },
  HTTPKeywordResult: { id: 'UUID', httpKeywordCampaignId: 'UUID', dnsResultId: 'UUID', validatedByPersonaId: 'UUID', usedProxyId: 'UUID' },
  CampaignJob: { id: 'UUID', campaignId: 'UUID' },
  ProxyPool: { id: 'UUID' },
  ProxyPoolMembership: { poolId: 'UUID', proxyId: 'UUID' }
};

export function fixContracts(contractsPath: string): void {
  console.log(`🔨 Fixing contracts at: ${contractsPath}`);
  
  // Read the extracted contracts
  const contracts: ExtractedContracts = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
  
  // Fix enum casing - enums are stored as an array
  if (contracts.enums && Array.isArray(contracts.enums)) {
    contracts.enums.forEach((enumDef: any) => {
      const casingMap = ENUM_CASING_MAP[enumDef.name];
      if (casingMap) {
        // Map the enum values to PascalCase
        enumDef.values = enumDef.values.map((value: string) => {
          return casingMap[value] || value;
        });
      }
    });
    
    // Add missing enum values
    const campaignStatusEnum = contracts.enums.find((e: any) => e.name === 'CampaignStatus');
    if (campaignStatusEnum && !campaignStatusEnum.values.includes('Archived')) {
      campaignStatusEnum.values.push('Archived');
    }
  }
  
  // Fix missing fields in models
  if (contracts.models && Array.isArray(contracts.models)) {
    // Fix DomainGenerationCampaignParams
    const domainGenModel = contracts.models.find((m: any) => m.name === 'DomainGenerationCampaignParams');
    if (domainGenModel) {
      const fields = domainGenModel.fields;
      if (!fields.find((f: any) => f.name === 'TotalPossibleCombinations')) {
        fields.push({
          name: 'TotalPossibleCombinations',
          type: 'int64',
          jsonTag: 'totalPossibleCombinations',
          dbTag: 'total_possible_combinations',
          required: true,
          isPointer: false
        });
      }
      if (!fields.find((f: any) => f.name === 'CurrentOffset')) {
        fields.push({
          name: 'CurrentOffset',
          type: 'int64',
          jsonTag: 'currentOffset',
          dbTag: 'current_offset',
          required: true,
          isPointer: false
        });
      }
    }
    
    // Fix HTTPKeywordCampaignParams
    const httpKeywordModel = contracts.models.find((m: any) => m.name === 'HTTPKeywordCampaignParams');
    if (httpKeywordModel) {
      const fields = httpKeywordModel.fields;
      if (!fields.find((f: any) => f.name === 'SourceType')) {
        fields.push({
          name: 'SourceType',
          type: 'string',
          jsonTag: 'sourceType',
          dbTag: 'source_type',
          required: true,
          isPointer: false
        });
      }
    }
  }
  
  // Write the fixed contracts back
  fs.writeFileSync(contractsPath, JSON.stringify(contracts, null, 2));
  console.log(`✅ Fixed contracts written to: ${contractsPath}`);
  
  // Also update the TypeScript declaration file
  const dtsPath = contractsPath.replace('.json', '.d.ts');
  const dtsContent = `// Auto-generated TypeScript declarations for extracted contracts
declare module './extracted-contracts.json' {
  const contracts: any;
  export default contracts;
}
`;
  fs.writeFileSync(dtsPath, dtsContent);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const contractsPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'extracted-contracts.json');
  fixContracts(contractsPath);
}