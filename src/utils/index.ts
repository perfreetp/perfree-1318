export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

export const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const formatDateTimeShort = (timestamp: number): string => {
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const copyToClipboard = (text: string): void => {
  navigator.clipboard.writeText(text);
};

export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

export const getValueByPath = (obj: any, path: string): any => {
  if (!path) return obj;
  const keys = path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
};

const SENSITIVE_HEADER_KEYS = [
  'authorization', 'auth', 'token', 'access-token', 'accesstoken',
  'refresh-token', 'refreshtoken', 'jwt', 'cookie', 'set-cookie',
  'x-api-key', 'x-auth-token', 'x-access-token', 'api-key', 'apikey',
  'secret', 'x-secret', 'password', 'pwd', 'passwd'
];

const SENSITIVE_BODY_KEYS = [
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'password', 'pwd', 'passwd', 'secret', 'apiKey', 'api_key', 'apikey',
  'authorization', 'auth', 'jwt', 'cookie', 'privateKey', 'private_key',
  'clientSecret', 'client_secret', 'sessionId', 'session_id',
  'creditCard', 'credit_card', 'cardNumber', 'card_number',
  'ssn', 'idCard', 'id_card', 'phone', 'mobile', 'email'
];

export const sanitizeHeaders = (headers: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.keys(headers).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.some((s) => lowerKey.includes(s))) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = headers[key];
    }
  });
  return result;
};

const sanitizeValue = (key: string, value: any): any => {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_BODY_KEYS.some((s) => lowerKey.includes(s))) {
    return '***REDACTED***';
  }
  if (typeof value === 'object' && value !== null) {
    return sanitizeObject(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, idx) => sanitizeValue(String(idx), item));
  }
  return value;
};

const sanitizeObject = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => sanitizeValue(String(idx), item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, any> = {};
    Object.keys(obj).forEach((key) => {
      result[key] = sanitizeValue(key, obj[key]);
    });
    return result;
  }
  return obj;
};

export const sanitizeBody = (body: any): any => {
  return sanitizeObject(body);
};

export const sanitizeJsonString = (jsonStr: string): string => {
  if (!jsonStr || !jsonStr.trim()) return jsonStr;
  try {
    const parsed = JSON.parse(jsonStr);
    const sanitized = sanitizeBody(parsed);
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return jsonStr;
  }
};

export const sanitizeRequestResult = (result: any): any => {
  const cloned = JSON.parse(JSON.stringify(result));
  if (cloned.actualRequest) {
    if (cloned.actualRequest.headers) {
      cloned.actualRequest.headers = sanitizeHeaders(cloned.actualRequest.headers);
    }
    if (cloned.actualRequest.body !== undefined) {
      cloned.actualRequest.body = sanitizeBody(cloned.actualRequest.body);
    }
    if (cloned.actualRequest.bodyRaw) {
      cloned.actualRequest.bodyRaw = sanitizeJsonString(cloned.actualRequest.bodyRaw);
    }
  }
  if (cloned.request) {
    if (cloned.request.headers && Array.isArray(cloned.request.headers)) {
      cloned.request.headers = cloned.request.headers.map((h: any) => {
        const lowerKey = (h.key || '').toLowerCase();
        if (SENSITIVE_HEADER_KEYS.some((s) => lowerKey.includes(s))) {
          return { ...h, value: '***REDACTED***' };
        }
        return h;
      });
    }
    if (cloned.request.body) {
      if (cloned.request.body.json) {
        cloned.request.body.json = sanitizeJsonString(cloned.request.body.json);
      }
      if (cloned.request.body.raw) {
        cloned.request.body.raw = sanitizeJsonString(cloned.request.body.raw);
      }
      if (cloned.request.body.formData && Array.isArray(cloned.request.body.formData)) {
        cloned.request.body.formData = cloned.request.body.formData.map((f: any) => {
          const lowerKey = (f.key || '').toLowerCase();
          if (SENSITIVE_BODY_KEYS.some((s) => lowerKey.includes(s))) {
            return { ...f, value: '***REDACTED***' };
          }
          return f;
        });
      }
      if (cloned.request.body.urlEncoded && Array.isArray(cloned.request.body.urlEncoded)) {
        cloned.request.body.urlEncoded = cloned.request.body.urlEncoded.map((f: any) => {
          const lowerKey = (f.key || '').toLowerCase();
          if (SENSITIVE_BODY_KEYS.some((s) => lowerKey.includes(s))) {
            return { ...f, value: '***REDACTED***' };
          }
          return f;
        });
      }
    }
  }
  if (cloned.response?.headers) {
    cloned.response.headers = sanitizeHeaders(cloned.response.headers);
  }
  return cloned;
};
