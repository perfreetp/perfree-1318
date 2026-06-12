import { ApiRequest, HttpMethod, KeyValuePair, RequestBody } from '@/types';
import { generateId } from '@/utils';

const now = () => Date.now();

const emptyKvp = (): KeyValuePair[] => [];

export interface ImportResult {
  requests: ApiRequest[];
  errors: string[];
}

export const parseCurl = (curl: string): Partial<ApiRequest> | null => {
  try {
    let url = '';
    let method: HttpMethod = 'GET';
    const headers: KeyValuePair[] = [];
    let body: RequestBody = { type: 'none' };
    let bodyContent = '';

    const lines = curl
      .replace(/\\\r?\n/g, ' ')
      .split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .filter(Boolean);

    let i = 0;
    while (i < lines.length) {
      const token = lines[i].trim();

      if (token.startsWith("'") || token.startsWith('"')) {
        const possibleUrl = token.replace(/^['"]|['"]$/g, '');
        if (possibleUrl.startsWith('http')) {
          url = possibleUrl;
        }
      }

      if (token === '-X' || token === '--request') {
        method = (lines[i + 1]?.toUpperCase().replace(/['"]/g, '') as HttpMethod) || 'GET';
        i += 2;
        continue;
      }

      if (token === '-H' || token === '--header') {
        const headerStr = lines[i + 1]?.replace(/^['"]|['"]$/g, '') || '';
        const colonIdx = headerStr.indexOf(':');
        if (colonIdx > 0) {
          const key = headerStr.slice(0, colonIdx).trim();
          const value = headerStr.slice(colonIdx + 1).trim();
          if (key) {
            headers.push({ id: generateId(), key, value, enabled: true });
          }
        }
        i += 2;
        continue;
      }

      if (token === '-d' || token === '--data' || token === '--data-raw') {
        bodyContent = lines[i + 1]?.replace(/^['"]|['"]$/g, '') || '';
        i += 2;
        continue;
      }

      i++;
    }

    if (!url) {
      const urlMatch = curl.match(/curl\s+['"]?([^'"\s]+)/);
      if (urlMatch) url = urlMatch[1];
    }

    if (bodyContent) {
      try {
        JSON.parse(bodyContent);
        body = { type: 'json', json: bodyContent };
      } catch {
        body = { type: 'raw', raw: bodyContent };
      }
      if (method === 'GET') method = 'POST';
    }

    if (!url) return null;

    const { url: parsedUrl, params } = parseUrlParams(url);

    return {
      method,
      url: parsedUrl,
      params,
      headers,
      body,
      name: extractNameFromUrl(parsedUrl)
    };
  } catch {
    return null;
  }
};

const parseUrlParams = (
  fullUrl: string
): { url: string; params: KeyValuePair[] } => {
  const params: KeyValuePair[] = [];
  const qIndex = fullUrl.indexOf('?');
  if (qIndex === -1) return { url: fullUrl, params };

  const baseUrl = fullUrl.slice(0, qIndex);
  const queryString = fullUrl.slice(qIndex + 1);
  queryString.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) {
      params.push({
        id: generateId(),
        key: decodeURIComponent(k),
        value: decodeURIComponent(v || ''),
        enabled: true
      });
    }
  });

  return { url: baseUrl, params };
};

const extractNameFromUrl = (url: string): string => {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    return parts.length > 0 ? parts.join('-') : '请求';
  } catch {
    return '请求';
  }
};

export const parseHar = (harContent: string): ImportResult => {
  const errors: string[] = [];
  const requests: ApiRequest[] = [];

  try {
    const har = JSON.parse(harContent);
    const entries = har.log?.entries || [];

    entries.forEach((entry: any, idx: number) => {
      try {
        const req = entry.request;
        if (!req) return;

        const headers: KeyValuePair[] = (req.headers || [])
          .filter((h: any) => h.name && !h.name.startsWith(':'))
          .map((h: any) => ({
            id: generateId(),
            key: h.name,
            value: h.value,
            enabled: true
          }));

        const params: KeyValuePair[] = (req.queryString || []).map((q: any) => ({
          id: generateId(),
          key: q.name,
          value: q.value,
          enabled: true
        }));

        let body: RequestBody = { type: 'none' };
        if (req.postData) {
          const mimeType = req.postData.mimeType || '';
          if (mimeType.includes('application/json')) {
            body = { type: 'json', json: req.postData.text || '' };
          } else if (mimeType.includes('x-www-form-urlencoded')) {
            body = {
              type: 'x-www-form-urlencoded',
              urlEncoded: (req.postData.params || []).map((p: any) => ({
                id: generateId(),
                key: p.name,
                value: p.value,
                enabled: true
              }))
            };
          } else if (mimeType.includes('multipart/form-data')) {
            body = {
              type: 'form-data',
              formData: (req.postData.params || []).map((p: any) => ({
                id: generateId(),
                key: p.name,
                value: p.value,
                enabled: true
              }))
            };
          } else {
            body = { type: 'raw', raw: req.postData.text || '' };
          }
        }

        requests.push({
          id: generateId(),
          projectId: '',
          name: req.url ? extractNameFromUrl(req.url.split('?')[0]) : `请求-${idx + 1}`,
          method: (req.method || 'GET').toUpperCase() as HttpMethod,
          url: req.url?.split('?')[0] || '',
          params,
          headers,
          body,
          favorite: false,
          createdAt: now(),
          updatedAt: now()
        });
      } catch (e: any) {
        errors.push(`解析第 ${idx + 1} 条请求失败: ${e.message}`);
      }
    });
  } catch (e: any) {
    errors.push(`HAR 文件解析失败: ${e.message}`);
  }

  return { requests, errors };
};

export const parsePostman = (content: string): ImportResult => {
  const errors: string[] = [];
  const requests: ApiRequest[] = [];

  try {
    const collection = JSON.parse(content);
    const items = flattenItems(collection.item || []);

    items.forEach((item: any, idx: number) => {
      try {
        const req = item.request;
        if (!req) return;

        const url = typeof req.url === 'string' ? req.url : req.url?.raw || '';
        const { url: baseUrl, params } = parseUrlParams(url);

        const headers: KeyValuePair[] = (req.header || [])
          .filter((h: any) => h.key && h.disabled !== true)
          .map((h: any) => ({
            id: generateId(),
            key: h.key,
            value: h.value,
            enabled: true
          }));

        let body: RequestBody = { type: 'none' };
        if (req.body) {
          const mode = req.body.mode;
          if (mode === 'raw' && req.body.options?.raw?.language === 'json') {
            body = { type: 'json', json: req.body.raw || '' };
          } else if (mode === 'raw') {
            body = { type: 'raw', raw: req.body.raw || '' };
          } else if (mode === 'urlencoded') {
            body = {
              type: 'x-www-form-urlencoded',
              urlEncoded: (req.body.urlencoded || [])
                .filter((p: any) => !p.disabled)
                .map((p: any) => ({
                  id: generateId(),
                  key: p.key,
                  value: p.value,
                  enabled: true
                }))
            };
          } else if (mode === 'formdata') {
            body = {
              type: 'form-data',
              formData: (req.body.formdata || [])
                .filter((p: any) => !p.disabled)
                .map((p: any) => ({
                  id: generateId(),
                  key: p.key,
                  value: p.value,
                  enabled: true
                }))
            };
          }
        }

        requests.push({
          id: generateId(),
          projectId: '',
          name: item.name || `请求-${idx + 1}`,
          method: (req.method || 'GET').toUpperCase() as HttpMethod,
          url: baseUrl,
          params,
          headers,
          body,
          favorite: false,
          createdAt: now(),
          updatedAt: now()
        });
      } catch (e: any) {
        errors.push(`解析第 ${idx + 1} 条请求失败: ${e.message}`);
      }
    });
  } catch (e: any) {
    errors.push(`Postman 集合解析失败: ${e.message}`);
  }

  return { requests, errors };
};

const flattenItems = (items: any[]): any[] => {
  const result: any[] = [];
  items.forEach((item) => {
    if (item.item) {
      result.push(...flattenItems(item.item));
    } else {
      result.push(item);
    }
  });
  return result;
};

export const autoParse = (text: string): Partial<ApiRequest> | ImportResult | null => {
  const trimmed = text.trim();

  if (trimmed.startsWith('curl')) {
    return parseCurl(trimmed);
  }

  try {
    const json = JSON.parse(trimmed);
    if (json.log?.entries) {
      return parseHar(trimmed);
    }
    if (json.info && json.item) {
      return parsePostman(trimmed);
    }
  } catch {
    // not json
  }

  return null;
};
