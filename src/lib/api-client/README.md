## @domainflow/api-client@1.0.0

This generator creates TypeScript/JavaScript client that utilizes [axios](https://github.com/axios/axios). The generated Node module can be used in the following environments:

Environment
* Node.js
* Webpack
* Browserify

Language level
* ES5 - you must have a Promises/A+ library installed
* ES6

Module system
* CommonJS
* ES6 module system

It can be used in both TypeScript and JavaScript. In TypeScript, the definition will be automatically resolved via `package.json`. ([Reference](https://www.typescriptlang.org/docs/handbook/declaration-files/consumption.html))

### Building

To build and compile the typescript sources to javascript use:
```
npm install
npm run build
```

### Publishing

First build the package then run `npm publish`

### Consuming

navigate to the folder of your consuming project and run one of the following commands.

_published:_

```
npm install @domainflow/api-client@1.0.0 --save
```

_unPublished (not recommended):_

```
npm install PATH_TO_GENERATED_PACKAGE --save
```

### Documentation for API Endpoints

All URIs are relative to *http://localhost:8080*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*AuthenticationApi* | [**authLoginPost**](docs/AuthenticationApi.md#authloginpost) | **POST** /auth/login | User login
*AuthenticationApi* | [**authMeGet**](docs/AuthenticationApi.md#authmeget) | **GET** /auth/me | Get current user
*CampaignsApi* | [**campaignsGet**](docs/CampaignsApi.md#campaignsget) | **GET** /campaigns | List campaigns
*CampaignsApi* | [**campaignsPost**](docs/CampaignsApi.md#campaignspost) | **POST** /campaigns | Create a new campaign


### Documentation For Models

 - [ErrorResponse](docs/ErrorResponse.md)
 - [ModelsCampaignAPI](docs/ModelsCampaignAPI.md)
 - [ModelsCampaignStatusEnum](docs/ModelsCampaignStatusEnum.md)
 - [ModelsCampaignTypeEnum](docs/ModelsCampaignTypeEnum.md)
 - [ModelsLoginRequest](docs/ModelsLoginRequest.md)
 - [ModelsLoginResponseAPI](docs/ModelsLoginResponseAPI.md)
 - [ModelsUserAPI](docs/ModelsUserAPI.md)
 - [ServicesCreateCampaignRequest](docs/ServicesCreateCampaignRequest.md)
 - [ServicesDnsValidationParams](docs/ServicesDnsValidationParams.md)
 - [ServicesDomainGenerationParams](docs/ServicesDomainGenerationParams.md)
 - [ServicesHttpKeywordParams](docs/ServicesHttpKeywordParams.md)


<a id="documentation-for-authorization"></a>
## Documentation For Authorization


Authentication schemes defined for the API:
<a id="SessionAuth"></a>
### SessionAuth

- **Type**: API key
- **API key parameter name**: session_id
- **Location**: 

