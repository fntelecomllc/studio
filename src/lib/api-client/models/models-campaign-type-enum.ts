/* tslint:disable */
/* eslint-disable */
/**
 * DomainFlow API
 * DomainFlow API for domain generation, validation, and campaign management
 *
 * The version of the OpenAPI document: 1.0
 * Contact: support@domainflow.com
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */



/**
 * 
 * @export
 * @enum {string}
 */

export const ModelsCampaignTypeEnum = {
    CampaignTypeDomainGeneration: 'domain_generation',
    CampaignTypeDNSValidation: 'dns_validation',
    CampaignTypeHTTPKeywordValidation: 'http_keyword_validation'
} as const;

export type ModelsCampaignTypeEnum = typeof ModelsCampaignTypeEnum[keyof typeof ModelsCampaignTypeEnum];



