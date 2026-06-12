import * as Diff from 'diff';
import { RequestResult, ApiResponse } from '@/types';

export interface DiffLine {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export const diffText = (oldText: string, newText: string): DiffLine[] => {
  const diff = Diff.diffLines(oldText || '', newText || '');
  return diff.map((part) => ({
    value: part.value,
    added: part.added,
    removed: part.removed
  }));
};

export const diffJson = (oldObj: any, newObj: any): DiffLine[] => {
  const oldStr = oldObj ? JSON.stringify(oldObj, null, 2) : '';
  const newStr = newObj ? JSON.stringify(newObj, null, 2) : '';
  return diffText(oldStr, newStr);
};

export interface ResponseDiff {
  status?: DiffLine[];
  headers?: DiffLine[];
  body?: DiffLine[];
  time?: DiffLine[];
}

export const diffResponses = (
  oldResp: ApiResponse | undefined,
  newResp: ApiResponse | undefined
): ResponseDiff => {
  const result: ResponseDiff = {};

  if (oldResp?.status !== undefined || newResp?.status !== undefined) {
    result.status = diffText(String(oldResp?.status || ''), String(newResp?.status || ''));
  }

  const oldHeaders = oldResp?.headers
    ? Object.entries(oldResp.headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
  const newHeaders = newResp?.headers
    ? Object.entries(newResp.headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
  result.headers = diffText(oldHeaders, newHeaders);

  result.body = diffJson(oldResp?.data, newResp?.data);

  if (oldResp?.time !== undefined || newResp?.time !== undefined) {
    result.time = diffText(String(oldResp?.time || ''), String(newResp?.time || ''));
  }

  return result;
};

export interface ResultComparison {
  requestId: string;
  requestName: string;
  oldPassed?: boolean;
  newPassed?: boolean;
  statusChanged: boolean;
  assertionDiffs: {
    name: string;
    oldPassed?: boolean;
    newPassed?: boolean;
  }[];
  responseDiff: ResponseDiff;
}

export const compareResults = (
  oldResults: RequestResult[],
  newResults: RequestResult[]
): ResultComparison[] => {
  const allIds = new Set([
    ...oldResults.map((r) => r.requestId),
    ...newResults.map((r) => r.requestId)
  ]);

  const comparisons: ResultComparison[] = [];

  allIds.forEach((id) => {
    const oldResult = oldResults.find((r) => r.requestId === id);
    const newResult = newResults.find((r) => r.requestId === id);

    const assertionDiffs: ResultComparison['assertionDiffs'] = [];
    const allAssertionIds = new Set([
      ...(oldResult?.assertionResults.map((a) => a.name) || []),
      ...(newResult?.assertionResults.map((a) => a.name) || [])
    ]);

    allAssertionIds.forEach((name) => {
      const oldAssertion = oldResult?.assertionResults.find((a) => a.name === name);
      const newAssertion = newResult?.assertionResults.find((a) => a.name === name);
      assertionDiffs.push({
        name,
        oldPassed: oldAssertion?.passed,
        newPassed: newAssertion?.passed
      });
    });

    comparisons.push({
      requestId: id,
      requestName:
        newResult?.request.name || oldResult?.request.name || '未知请求',
      oldPassed: oldResult?.passed,
      newPassed: newResult?.passed,
      statusChanged: oldResult?.passed !== newResult?.passed,
      assertionDiffs,
      responseDiff: diffResponses(oldResult?.response, newResult?.response)
    });
  });

  return comparisons;
};
