# CampaignsApi

All URIs are relative to *http://localhost:8080*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**campaignsGet**](#campaignsget) | **GET** /campaigns | List campaigns|
|[**campaignsPost**](#campaignspost) | **POST** /campaigns | Create a new campaign|

# **campaignsGet**
> Array<ModelsCampaignAPI> campaignsGet()

Retrieve a list of campaigns with optional filtering and pagination

### Example

```typescript
import {
    CampaignsApi,
    Configuration
} from '@domainflow/api-client';

const configuration = new Configuration();
const apiInstance = new CampaignsApi(configuration);

let limit: number; //Maximum number of campaigns to return (1-100) (optional) (default to 20)
let offset: number; //Number of campaigns to skip (optional) (default to 0)
let type: 'domain_generation' | 'dns_validation' | 'http_keyword_validation'; //Filter by campaign type (optional) (default to undefined)
let status: 'pending' | 'queued' | 'running' | 'pausing' | 'paused' | 'completed' | 'failed' | 'archived' | 'cancelled'; //Filter by campaign status (optional) (default to undefined)

const { status, data } = await apiInstance.campaignsGet(
    limit,
    offset,
    type,
    status
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **limit** | [**number**] | Maximum number of campaigns to return (1-100) | (optional) defaults to 20|
| **offset** | [**number**] | Number of campaigns to skip | (optional) defaults to 0|
| **type** | [**&#39;domain_generation&#39; | &#39;dns_validation&#39; | &#39;http_keyword_validation&#39;**]**Array<&#39;domain_generation&#39; &#124; &#39;dns_validation&#39; &#124; &#39;http_keyword_validation&#39;>** | Filter by campaign type | (optional) defaults to undefined|
| **status** | [**&#39;pending&#39; | &#39;queued&#39; | &#39;running&#39; | &#39;pausing&#39; | &#39;paused&#39; | &#39;completed&#39; | &#39;failed&#39; | &#39;archived&#39; | &#39;cancelled&#39;**]**Array<&#39;pending&#39; &#124; &#39;queued&#39; &#124; &#39;running&#39; &#124; &#39;pausing&#39; &#124; &#39;paused&#39; &#124; &#39;completed&#39; &#124; &#39;failed&#39; &#124; &#39;archived&#39; &#124; &#39;cancelled&#39;>** | Filter by campaign status | (optional) defaults to undefined|


### Return type

**Array<ModelsCampaignAPI>**

### Authorization

[SessionAuth](../README.md#SessionAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | List of campaigns |  -  |
|**400** | Invalid query parameters |  -  |
|**401** | Authentication required |  -  |
|**403** | Insufficient permissions |  -  |
|**500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **campaignsPost**
> ModelsCampaignAPI campaignsPost(servicesCreateCampaignRequest)

Create a new campaign with specified type and parameters

### Example

```typescript
import {
    CampaignsApi,
    Configuration,
    ServicesCreateCampaignRequest
} from '@domainflow/api-client';

const configuration = new Configuration();
const apiInstance = new CampaignsApi(configuration);

let servicesCreateCampaignRequest: ServicesCreateCampaignRequest; //Campaign creation request

const { status, data } = await apiInstance.campaignsPost(
    servicesCreateCampaignRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **servicesCreateCampaignRequest** | **ServicesCreateCampaignRequest**| Campaign creation request | |


### Return type

**ModelsCampaignAPI**

### Authorization

[SessionAuth](../README.md#SessionAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Campaign created successfully |  -  |
|**400** | Invalid request payload |  -  |
|**401** | Authentication required |  -  |
|**403** | Insufficient permissions |  -  |
|**500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

