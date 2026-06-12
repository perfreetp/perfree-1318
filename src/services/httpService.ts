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

const buildBody = (
  request: ApiRequest
): { data: any; headers: Record<string, string> } => {
  const body = request.body;
  const extraHeaders: Record<string, string> = {};

  switch (body.type) {
    case 'json':
      extraHeaders['Content-Type'] = 'application/json';
      return { data: body.json ? JSON.parse(body.json) : {}, headers: extraHeaders };
    case 'form-data':
      return {
        data: Object.fromEntries(
          (body.formData || []).filter((f) => f.enabled).map((f) => [f.key, f.value])
        ),
        headers: extraHeaders
      };
    case 'x-www-form-urlencoded':
      extraHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      return {
        data: new URLSearchParams(
          (body.urlEncoded || [])
            .filter((f) => f.enabled)
            .map((f) => [f.key, f.value]) as any
        ).toString(),
        headers: extraHeaders
      };
    case 'raw':
      return { data: body.raw || '', headers: extraHeaders };
    case 'binary':
      return { data: null, headers: extraHeaders };
    default:
      return { data: null, headers: extraHeaders };
  }
};

export const sendRequest = async (
  request: ApiRequest,
  variables: Record<string, string>
): Promise<ApiResponse> => {
  const startTime = Date.now();

  const substitutedUrl = substituteVariables(request.url, variables);
  const substitutedParams = substituteVariablesInKvp(request.params, variables);
  const substitutedHeaders = substituteVariablesInKvp(request.headers, variables);

  const url = buildUrl(substitutedUrl, substitutedParams);
  const headers = buildHeaders(substitutedHeaders);
  const { data: bodyData, headers: bodyHeaders } = buildBody(request);

  Object.assign(headers, bodyHeaders);

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
    const responseData =
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      data: response.data,
      time: endTime - startTime,
      size: new Blob([JSON.stringify(response.data)]).size
    };
  } catch (error: any) {
    const endTime = Date.now();
    throw {
      status: 0,
      statusText: error.message || 'Request failed',
      headers: {},
      data: null,
      time: endTime - startTime,
      size: 0,
      error: error.message
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
