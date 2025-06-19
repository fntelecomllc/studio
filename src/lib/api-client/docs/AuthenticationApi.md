# AuthenticationApi

All URIs are relative to *http://localhost:8080*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**authLoginPost**](#authloginpost) | **POST** /auth/login | User login|
|[**authMeGet**](#authmeget) | **GET** /auth/me | Get current user|

# **authLoginPost**
> ModelsLoginResponseAPI authLoginPost(modelsLoginRequest)

Authenticate a user with email and password

### Example

```typescript
import {
    AuthenticationApi,
    Configuration,
    ModelsLoginRequest
} from '@domainflow/api-client';

const configuration = new Configuration();
const apiInstance = new AuthenticationApi(configuration);

let modelsLoginRequest: ModelsLoginRequest; //Login credentials

const { status, data } = await apiInstance.authLoginPost(
    modelsLoginRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **modelsLoginRequest** | **ModelsLoginRequest**| Login credentials | |


### Return type

**ModelsLoginResponseAPI**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Login successful |  -  |
|**400** | Invalid request format |  -  |
|**401** | Invalid credentials |  -  |
|**403** | Account inactive |  -  |
|**423** | Account locked |  -  |
|**500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authMeGet**
> ModelsUserAPI authMeGet()

Get information about the currently authenticated user

### Example

```typescript
import {
    AuthenticationApi,
    Configuration
} from '@domainflow/api-client';

const configuration = new Configuration();
const apiInstance = new AuthenticationApi(configuration);

const { status, data } = await apiInstance.authMeGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**ModelsUserAPI**

### Authorization

[SessionAuth](../README.md#SessionAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | User information |  -  |
|**401** | Authentication required |  -  |
|**404** | User not found |  -  |
|**500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

