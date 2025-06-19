# ServicesCreateCampaignRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**campaignType** | **string** |  | [default to undefined]
**description** | **string** |  | [optional] [default to undefined]
**dnsValidationParams** | [**ServicesDnsValidationParams**](ServicesDnsValidationParams.md) | DNS Validation specific fields | [optional] [default to undefined]
**domainGenerationParams** | [**ServicesDomainGenerationParams**](ServicesDomainGenerationParams.md) | Domain Generation specific fields | [optional] [default to undefined]
**httpKeywordParams** | [**ServicesHttpKeywordParams**](ServicesHttpKeywordParams.md) | HTTP Keyword Validation specific fields | [optional] [default to undefined]
**name** | **string** |  | [default to undefined]
**userId** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { ServicesCreateCampaignRequest } from '@domainflow/api-client';

const instance: ServicesCreateCampaignRequest = {
    campaignType,
    description,
    dnsValidationParams,
    domainGenerationParams,
    httpKeywordParams,
    name,
    userId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
