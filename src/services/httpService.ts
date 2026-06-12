import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiRequest, ApiResponse, KeyValuePair, EnvironmentVariable } from '@/types';
import { getValueByPath } from '@/utils';

export const substituteVariables = (
  text: string,
  variables: Record<string, string>
): string => {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
};

export const substituteVariablesInKvp = (
  items: KeyValuePair[],
  variables: Record<string, string>
): KeyValuePair[] => {
  return items.map((item) => ({
    ...item,
    key: substituteVariables(item.key, variables),
    value: substituteVariables(item.value, variables)
  }));
};

export const collectVariables = (
  envVars: EnvironmentVariable[],
  extracted: Record<string, string> = {}
): Record<string, string> => {
  const result: Record<string, string> = {};
  envVars
    .filter((v) => v.enabled)
    .forEach((v) => {
      result[v.key] = v.value;
    });
  Object.assign(result, extracted);
  return result;
};

const buildUrl = (baseUrl: string, params: KeyValuePair[]): string => {
  const enabledParams = params.filter((p) => p.enabled && p.key);
  if (enabledParams.length === 0) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  const queryString = enabledParams
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return `${baseUrl}${separator}${queryString}`;
};

const buildHeaders = (items: KeyValuePair[]): Record<string, string> => {
  const headers: Record<string, string> = {};
  items
    .filter((h) => h.enabled && h.key)
    .forEach((h) => {
      headers[h.key] = h.value;
    });
  return headers;
};

interface BuildBodyResult {
  data: any;
  headers: Record<string, string>;
  bodyRaw: string;
  parseError?: string;
}

const buildBody = (request: ApiRequest, variables: Record<string, string>): BuildBodyResult => {
  const body = request.body;
  const extraHeaders: Record<string, string> = {};

  switch (body.type) {
    case 'json': {
      extraHeaders['Content-Type'] = 'application/json';
      const rawJson = body.json || '';
      const substitutedJson = substituteVariables(rawJson, variables);
      try {
        const parsed = substitutedJson.trim() ? JSON.parse(substitutedJson) : {};
        return { data: parsed, headers: extraHeaders, bodyRaw: substitutedJson };
      } catch (e: any) {
        return {
          data: null,
          headers: extraHeaders,
          bodyRaw: substitutedJson,
          parseError: `JSON 格式错误: ${e.message}`
        };
      }
    }
    case 'form-data': {
      const substitutedData = substituteVariablesInKvp(body.formData || [], variables);
      const formObj = Object.fromEntries(
        substitutedData.filter((f) => f.enabled).map((f) => [f.key, f.value])
      );
      return {
        data: formObj,
        headers: extraHeaders,
        bodyRaw: JSON.stringify(formObj, null, 2)
      };
    }
    case 'x-www-form-urlencoded': {
      extraHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      const substitutedData = substituteVariablesInKvp(body.urlEncoded || [], variables);
      const params = new URLSearchParams(
        substitutedData
          .filter((f) => f.enabled)
          .map((f) => [f.key, f.value]) as any
      );
      return { data: params.toString(), headers: extraHeaders, bodyRaw: params.toString() };
    }
    case 'raw': {
      const substitutedRaw = substituteVariables(body.raw || '', variables);
      return { data: substitutedRaw, headers: extraHeaders, bodyRaw: substitutedRaw };
    }
    case 'binary': {
      return { data: null, headers: extraHeaders, bodyRaw: '' };
    }
    default:
      return { data: null, headers: extraHeaders, bodyRaw: '' };
  }
};

export interface SendRequestResult {
  response?: ApiResponse;
  error?: string;
  bodyParseError?: string;
  actualRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    bodyRaw?: string;
  };
}

export const sendRequest = async (
  request: ApiRequest,
  variables: Record<string, string>
): Promise<SendRequestResult> => {
  const startTime = Date.now();

  const substitutedUrl = substituteVariables(request.url, variables);
  const substitutedParams = substituteVariablesInKvp(request.params, variables);
  const substitutedHeaders = substituteVariablesInKvp(request.headers, variables);

  const url = buildUrl(substitutedUrl, substitutedParams);
  const headers = buildHeaders(substitutedHeaders);
  const {
    data: bodyData,
    headers: bodyHeaders,
    bodyRaw,
    parseError
  } = buildBody(request, variables);

  Object.assign(headers, bodyHeaders);

  const actualRequest = {
    url,
    method: request.method,
    headers: { ...headers },
    body: bodyData,
    bodyRaw
  };

  if (parseError) {
    const endTime = Date.now();
    return {
      error: parseError,
      bodyParseError: parseError,
      actualRequest,
      response: {
        status: 0,
        statusText: 'Request Build Error',
        headers: {},
        data: { error: parseError },
        time: endTime - startTime,
        size: 0
      }
    };
  }

  const config: AxiosRequestConfig = {
    method: request.method.toLowerCase(),
    url,
    headers,
    data: bodyData,
    timeout: 30000,
    validateStatus: () => true,
    responseType: 'json'
  };

  try {
    const response: AxiosResponse = await axios(config);
    const endTime = Date.now();

    return {
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        data: response.data,
        time: endTime - startTime,
        size: new Blob([JSON.stringify(response.data)]).size
      },
      actualRequest
    };
  } catch (error: any) {
    const endTime = Date.now();
    return {
      error: error.message || 'Request failed',
      actualRequest,
      response: {
        status: 0,
        statusText: error.message || 'Request failed',
        headers: {},
        data: null,
        time: endTime - startTime,
        size: 0
      }
    };
  }
};

export const extractFromResponse = (
  response: ApiResponse,
  extractors: { source: string; expression: string; variableName: string; enabled: boolean }[]
): Record<string, string> => {
  const result: Record<string, string> = {};
  extractors
    .filter((e) => e.enabled)
    .forEach((extractor) => {
      try {
        let value: any;
        switch (extractor.source) {
          case 'body':
            value = getValueByPath(response.data, extractor.expression);
            break;
          case 'header':
            value = response.headers[extractor.expression.toLowerCase()];
            break;
          case 'status':
            value = response.status;
            break;
        }
        if (value !== undefined) {
          result[extractor.variableName] =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
      } catch (e) {
        // ignore extraction errors
      }
    });
  return result;
};
