// src/lib/utils/logger.ts
// Centralized logging utility with timestamps for better debugging

export interface LogContext {
  component?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private context: LogContext = {};

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.context, ...context };
    const contextStr = Object.keys(mergedContext).length > 0 
      ? ` [${Object.entries(mergedContext).map(([k, v]) => `${k}=${v}`).join(', ')}]`
      : '';
    
    return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}`;
  }

  debug(message: string, data?: unknown, context?: LogContext): void {
    const formattedMessage = this.formatMessage('debug', message, context);
    if (data !== undefined) {
      console.debug(formattedMessage, data);
    } else {
      console.debug(formattedMessage);
    }
  }

  info(message: string, data?: unknown, context?: LogContext): void {
    const formattedMessage = this.formatMessage('info', message, context);
    if (data !== undefined) {
      console.log(formattedMessage, data);
    } else {
      console.log(formattedMessage);
    }
  }

  warn(message: string, data?: unknown, context?: LogContext): void {
    const formattedMessage = this.formatMessage('warn', message, context);
    if (data !== undefined) {
      console.warn(formattedMessage, data);
    } else {
      console.warn(formattedMessage);
    }
  }

  error(message: string, data?: unknown, context?: LogContext): void {
    const formattedMessage = this.formatMessage('error', message, context);
    if (data !== undefined) {
      console.error(formattedMessage, data);
    } else {
      console.error(formattedMessage);
    }
  }

  // Convenience methods for common logging patterns
  websocket(message: string, data?: unknown): void {
    this.info(message, data, { component: 'WebSocket' });
  }

  auth(message: string, data?: unknown): void {
    this.info(message, data, { component: 'Auth' });
  }

  api(message: string, data?: unknown): void {
    this.info(message, data, { component: 'API' });
  }

  component(componentName: string, message: string, data?: unknown): void {
    this.info(message, data, { component: componentName });
  }
}

// Create singleton logger instance
export const logger = new Logger();

// Export convenience functions for immediate use
export const logWithTimestamp = (level: LogLevel, message: string, data?: unknown, context?: LogContext) => {
  logger[level](message, data, context);
};

// WebSocket specific logging
export const logWebSocket = {
  connect: (message: string, data?: unknown) => logger.websocket(`🔌 ${message}`, data),
  message: (message: string, data?: unknown) => logger.websocket(`📩 ${message}`, data),
  error: (message: string, data?: unknown) => logger.error(`❌ WebSocket: ${message}`, data, { component: 'WebSocket' }),
  success: (message: string, data?: unknown) => logger.websocket(`✅ ${message}`, data),
  warn: (message: string, data?: unknown) => logger.warn(`⚠️ WebSocket: ${message}`, data, { component: 'WebSocket' }),
};

// Auth specific logging
export const logAuth = {
  init: (message: string, data?: unknown) => logger.auth(`🚀 ${message}`, data),
  success: (message: string, data?: unknown) => logger.auth(`✅ ${message}`, data),
  error: (message: string, data?: unknown) => logger.error(`❌ Auth: ${message}`, data, { component: 'Auth' }),
  warn: (message: string, data?: unknown) => logger.warn(`⚠️ Auth: ${message}`, data, { component: 'Auth' }),
  token: (message: string, data?: unknown) => logger.auth(`🔑 ${message}`, data),
};

// System check specific logging
export const logSystemCheck = {
  start: (message: string, data?: unknown) => logger.component('SystemCheck', `🔍 ${message}`, data),
  pass: (message: string, data?: unknown) => logger.component('SystemCheck', `✅ ${message}`, data),
  fail: (message: string, data?: unknown) => logger.component('SystemCheck', `❌ ${message}`, data),
  warn: (message: string, data?: unknown) => logger.component('SystemCheck', `⚠️ ${message}`, data),
};

export default logger;