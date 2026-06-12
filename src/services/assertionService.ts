import { Assertion, AssertionResult, ApiResponse } from '@/types';
import { getValueByPath } from '@/utils';

const getActualValue = (
  response: ApiResponse,
  source: string,
  expression: string
): any => {
  try {
    switch (source) {
      case 'body':
        return getValueByPath(response.data, expression);
      case 'header':
        return response.headers[expression.toLowerCase()];
      case 'status':
        return response.status;
      case 'time':
        return response.time;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
};

const compareValues = (
  actual: any,
  operator: string,
  expected: string
): { passed: boolean; message: string } => {
  const actualStr =
    actual === null || actual === undefined ? '' : String(actual);
  const actualNum = Number(actual);
  const expectedNum = Number(expected);

  try {
    switch (operator) {
      case 'equals':
        return {
          passed: actualStr === expected,
          message: actualStr === expected ? '值相等' : `期望 "${expected}"，实际 "${actualStr}"`
        };
      case 'notEquals':
        return {
          passed: actualStr !== expected,
          message: actualStr !== expected ? '值不相等' : `值不应该等于 "${expected}"`
        };
      case 'contains':
        return {
          passed: actualStr.includes(expected),
          message: actualStr.includes(expected)
            ? `包含 "${expected}"`
            : `期望包含 "${expected}"，实际为 "${actualStr}"`
        };
      case 'notContains':
        return {
          passed: !actualStr.includes(expected),
          message: !actualStr.includes(expected)
            ? `不包含 "${expected}"`
            : `不应该包含 "${expected}"`
        };
      case 'greaterThan':
        return {
          passed: !isNaN(actualNum) && !isNaN(expectedNum) && actualNum > expectedNum,
          message: `期望大于 ${expected}，实际 ${actualNum}`
        };
      case 'lessThan':
        return {
          passed: !isNaN(actualNum) && !isNaN(expectedNum) && actualNum < expectedNum,
          message: `期望小于 ${expected}，实际 ${actualNum}`
        };
      case 'hasKey':
        try {
          const obj = typeof actual === 'string' ? JSON.parse(actual) : actual;
          const has =
            obj !== null && typeof obj === 'object' && expected in obj;
          return { passed: has, message: has ? `存在键 "${expected}"` : `不存在键 "${expected}"` };
        } catch {
          return { passed: false, message: '对象解析失败' };
        }
      case 'lengthEquals':
        try {
          const len = Array.isArray(actual)
            ? actual.length
            : typeof actual === 'string'
            ? actual.length
            : Object.keys(actual || {}).length;
          return {
            passed: len === expectedNum,
            message: `期望长度 ${expected}，实际 ${len}`
          };
        } catch {
          return { passed: false, message: '长度计算失败' };
        }
      case 'regex':
        try {
          const regex = new RegExp(expected);
          return {
            passed: regex.test(actualStr),
            message: regex.test(actualStr) ? '正则匹配成功' : `正则不匹配: ${expected}`
          };
        } catch {
          return { passed: false, message: '正则表达式无效' };
        }
      case 'statusCode':
        return {
          passed: actualStr === expected || (expected.includes('xx') && matchStatusCode(actualStr, expected)),
          message: `期望状态码 ${expected}，实际 ${actualStr}`
        };
      default:
        return { passed: false, message: `未知操作符: ${operator}` };
    }
  } catch (e: any) {
    return { passed: false, message: `断言错误: ${e.message}` };
  }
};

const matchStatusCode = (actual: string, pattern: string): boolean => {
  if (pattern === '2xx') return /^2\d{2}$/.test(actual);
  if (pattern === '3xx') return /^3\d{2}$/.test(actual);
  if (pattern === '4xx') return /^4\d{2}$/.test(actual);
  if (pattern === '5xx') return /^5\d{2}$/.test(actual);
  return actual === pattern;
};

export const runAssertions = (
  response: ApiResponse | undefined,
  assertions: Assertion[]
): AssertionResult[] => {
  if (!response) {
    return assertions.map((a) => ({
      assertionId: a.id,
      name: a.name,
      passed: false,
      actual: '无响应',
      expected: a.expectedValue,
      message: '请求失败，无响应数据'
    }));
  }

  return assertions
    .filter((a) => a.enabled)
    .map((assertion) => {
      const actual = getActualValue(response, assertion.source, assertion.expression);
      const { passed, message } = compareValues(actual, assertion.operator, assertion.expectedValue);
      return {
        assertionId: assertion.id,
        name: assertion.name,
        passed,
        actual: actual === null || actual === undefined ? '' : String(actual),
        expected: assertion.expectedValue,
        message
      };
    });
};
