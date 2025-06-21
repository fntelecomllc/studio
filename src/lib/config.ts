/**
 * @fileOverview Legacy configuration compatibility layer
 * Provides backward compatibility while transitioning to the new environment system
 */

import { getApiConfig, setApiBaseUrlOverride as setEnvApiOverride } from './config/environment';
import { logger } from '@/lib/utils/logger';

interface AppConfig {
  apiBaseUrl: string;
}

let loadedConfig: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

// Fallback API base URL if config.json is missing or invalid.
const FALLBACK_API_BASE_URL = '/api';

async function fetchAppConfig(): Promise<AppConfig> {
  if (loadedConfig) {
    return loadedConfig;
  }

  // If a fetch is already in progress, return that promise
  if (configPromise) {
    return configPromise;
  }

  configPromise = (async () => {
    try {
      // First try the new environment configuration
      const envConfig = getApiConfig();
      if (envConfig.baseUrl) {
        loadedConfig = { apiBaseUrl: envConfig.baseUrl };
        return loadedConfig;
      }

      // Fallback to legacy config.json approach
      const response = await fetch('/config.json');
      if (!response.ok) {
        logger.warn('Failed to load configuration file', {
          status: response.status,
          fallbackUrl: FALLBACK_API_BASE_URL,
          component: 'AppConfig'
        });
        return { apiBaseUrl: FALLBACK_API_BASE_URL };
      }
      const config = await response.json();
      if (typeof config.apiBaseUrl !== 'string' || config.apiBaseUrl.trim() === '') {
        logger.warn('Invalid API base URL in configuration', {
          configApiUrl: config.apiBaseUrl,
          fallbackUrl: FALLBACK_API_BASE_URL,
          component: 'AppConfig'
        });
        return { apiBaseUrl: FALLBACK_API_BASE_URL };
      }
      loadedConfig = config;
      return config;
    } catch (error: unknown) {
      logger.warn('Configuration fetch error', {
        error: error instanceof Error ? error.message : String(error),
        fallbackUrl: FALLBACK_API_BASE_URL,
        component: 'AppConfig'
      });
      return { apiBaseUrl: FALLBACK_API_BASE_URL };
    } finally {
      configPromise = null;
    }
  })();
  return configPromise;
}

/**
 * Retrieves the API base URL.
 * Now uses the new environment configuration system with legacy fallback
 * @returns {Promise<string>} The determined API base URL.
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    // Use new environment configuration system
    const apiConfig = getApiConfig();
    return apiConfig.baseUrl;
  } catch (error: unknown) {
    logger.warn('Environment config fallback to legacy method', {
      error: error instanceof Error ? error.message : String(error),
      component: 'AppConfig'
    });
    
    // Fallback to legacy method
    const config = await fetchAppConfig();
    return config.apiBaseUrl;
  }
}

/**
 * Sets or clears the API base URL override in localStorage.
 * Now delegates to the new environment configuration system
 * @param {string | null} url The URL to set, or null to remove the override.
 */
export function setApiBaseUrlOverride(url: string | null): void {
  // Use new environment configuration system
  setEnvApiOverride(url);
  
  // Also clear legacy cache
  loadedConfig = null;
}
