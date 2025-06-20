/**
 * Content Security Policy (CSP) Configuration
 * Implements security headers to prevent XSS and other attacks
 * 
 * Features:
 * - Strict CSP directives
 * - Nonce-based script execution
 * - Report-only mode for testing
 * - Dynamic policy generation
 * - Environment-specific policies
 */

import crypto from 'crypto';

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'frame-src'?: string[];
  'frame-ancestors'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'manifest-src'?: string[];
  'worker-src'?: string[];
  'child-src'?: string[];
  'prefetch-src'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
  'report-uri'?: string;
  'report-to'?: string;
}

export interface CSPConfig {
  directives: CSPDirectives;
  reportOnly?: boolean;
  generateNonce?: boolean;
}

class ContentSecurityPolicy {
  private config: CSPConfig;
  private nonce?: string;

  constructor(config?: Partial<CSPConfig>) {
    this.config = {
      directives: this.getDefaultDirectives(),
      reportOnly: false,
      generateNonce: true,
      ...config
    };

    // Merge custom directives with defaults
    if (config?.directives) {
      this.config.directives = this.mergeDirectives(
        this.getDefaultDirectives(),
        config.directives
      );
    }
  }

  /**
   * Get default CSP directives
   */
  private getDefaultDirectives(): CSPDirectives {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

    const directives: CSPDirectives = {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'nonce-{nonce}'",
        isDevelopment ? "'unsafe-eval'" : '', // Allow eval in development for HMR
      ].filter(Boolean),
      'style-src': [
        "'self'",
        "'nonce-{nonce}'",
        "'unsafe-inline'", // Required for some UI libraries
      ],
      'img-src': [
        "'self'",
        'data:',
        'blob:',
        'https:',
      ],
      'font-src': [
        "'self'",
        'data:',
      ],
      'connect-src': [
        "'self'",
        apiUrl,
        wsUrl,
        isDevelopment ? 'ws://localhost:*' : '', // WebSocket for HMR in dev
        'https://vitals.vercel-insights.com', // Vercel analytics
      ].filter(Boolean),
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'manifest-src': ["'self'"],
      'worker-src': ["'self'", 'blob:'],
      'upgrade-insecure-requests': !isDevelopment,
      'block-all-mixed-content': !isDevelopment,
    };

    // Add reporting endpoint if configured
    if (process.env.NEXT_PUBLIC_CSP_REPORT_URI) {
      directives['report-uri'] = process.env.NEXT_PUBLIC_CSP_REPORT_URI;
      directives['report-to'] = 'csp-endpoint';
    }

    return directives;
  }

  /**
   * Merge two sets of directives
   */
  private mergeDirectives(base: CSPDirectives, custom: CSPDirectives): CSPDirectives {
    const merged = { ...base };

    for (const [key, value] of Object.entries(custom)) {
      if (Array.isArray(value) && Array.isArray(merged[key as keyof CSPDirectives])) {
        // Merge arrays, removing duplicates
        const mergedValue = [
          ...new Set([...(merged[key as keyof CSPDirectives] as string[]), ...value])
        ];
        (merged as Record<string, unknown>)[key] = mergedValue;
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }

    return merged;
  }

  /**
   * Generate a new nonce
   */
  generateNonce(): string {
    this.nonce = crypto.randomBytes(16).toString('base64');
    return this.nonce;
  }

  /**
   * Get the current nonce
   */
  getNonce(): string | undefined {
    return this.nonce;
  }

  /**
   * Build CSP header string
   */
  buildHeader(): string {
    const directives = [];
    const nonce = this.config.generateNonce ? this.nonce || this.generateNonce() : '';

    for (const [directive, values] of Object.entries(this.config.directives)) {
      if (values === undefined || values === null) continue;

      if (typeof values === 'boolean') {
        if (values) {
          directives.push(directive);
        }
      } else if (Array.isArray(values) && values.length > 0) {
        const processedValues = values.map(value => 
          value.replace('{nonce}', nonce)
        );
        directives.push(`${directive} ${processedValues.join(' ')}`);
      } else if (typeof values === 'string') {
        directives.push(`${directive} ${values}`);
      }
    }

    return directives.join('; ');
  }

  /**
   * Get CSP headers
   */
  getHeaders(): Record<string, string> {
    const headerName = this.config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    const headers: Record<string, string> = {
      [headerName]: this.buildHeader()
    };

    // Add Report-To header if configured
    if (this.config.directives['report-to']) {
      headers['Report-To'] = JSON.stringify({
        group: 'csp-endpoint',
        max_age: 10886400,
        endpoints: [{
          url: process.env.NEXT_PUBLIC_CSP_REPORT_URI || '/api/csp-report'
        }]
      });
    }

    return headers;
  }

  /**
   * Get CSP meta tag content
   */
  getMetaTagContent(): string {
    // Meta tags don't support report-uri or report-to
    const filteredDirectives = { ...this.config.directives };
    delete filteredDirectives['report-uri'];
    delete filteredDirectives['report-to'];

    const tempConfig = new ContentSecurityPolicy({
      ...this.config,
      directives: filteredDirectives
    });

    return tempConfig.buildHeader();
  }

  /**
   * Validate CSP configuration
   */
  validate(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check for unsafe directives
    const scriptSrc = this.config.directives['script-src'] || [];
    if (scriptSrc.includes("'unsafe-inline'")) {
      warnings.push("'unsafe-inline' in script-src weakens security");
    }
    if (scriptSrc.includes("'unsafe-eval'") && process.env.NODE_ENV !== 'development') {
      warnings.push("'unsafe-eval' in script-src is dangerous in production");
    }

    // Check for overly permissive directives
    const defaultSrc = this.config.directives['default-src'] || [];
    if (defaultSrc.includes('*')) {
      warnings.push("Wildcard (*) in default-src is too permissive");
    }

    // Check frame ancestors
    const frameAncestors = this.config.directives['frame-ancestors'];
    if (!frameAncestors || frameAncestors.includes('*')) {
      warnings.push("Consider restricting frame-ancestors to prevent clickjacking");
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

// Export default CSP instance
export const csp = new ContentSecurityPolicy();

// Middleware for Next.js
export function cspMiddleware(generateNonce = true) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: any) => {
    const policy = new ContentSecurityPolicy({
      generateNonce
    });

    if (generateNonce) {
      // Store nonce in res.locals for use in templates
      res.locals.nonce = policy.generateNonce();
    }

    // Set CSP headers
    const headers = policy.getHeaders();
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    next();
  };
}

// React hook for CSP nonce
export function useCSPNonce(): string | undefined {
  if (typeof window !== 'undefined') {
    // Get nonce from meta tag or script tag
    const metaTag = document.querySelector('meta[property="csp-nonce"]');
    if (metaTag) {
      return metaTag.getAttribute('content') || undefined;
    }

    // Fallback to checking script tags
    const scriptTag = document.querySelector('script[nonce]');
    if (scriptTag) {
      return scriptTag.getAttribute('nonce') || undefined;
    }
  }

  return undefined;
}

// Helper to create script tags with nonce
export function createNonceScript(content: string, nonce?: string): string {
  return `<script${nonce ? ` nonce="${nonce}"` : ''}>${content}</script>`;
}

// Helper to create style tags with nonce
export function createNonceStyle(content: string, nonce?: string): string {
  return `<style${nonce ? ` nonce="${nonce}"` : ''}>${content}</style>`;
}