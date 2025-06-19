# ModelsLoginResponseAPI


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**error** | **string** |  | [optional] [default to undefined]
**expiresAt** | **string** |  | [optional] [default to undefined]
**requires_captcha** | **boolean** |  | [optional] [default to undefined]
**sessionId** | **string** |  | [optional] [default to undefined]
**success** | **boolean** |  | [optional] [default to undefined]
**user** | [**ModelsUserAPI**](ModelsUserAPI.md) |  | [optional] [default to undefined]

## Example

```typescript
import { ModelsLoginResponseAPI } from '@domainflow/api-client';

const instance: ModelsLoginResponseAPI = {
    error,
    expiresAt,
    requires_captcha,
    sessionId,
    success,
    user,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
