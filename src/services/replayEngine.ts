import {
  ApiRequest,
  RequestResult,
  Environment,
  ReplayConfig,
  ReplayQueueItem
} from '@/types';
import { sendRequest, extractFromResponse, collectVariables, SendRequestResult } from './httpService';
import { runAssertions } from './assertionService';
import { sleep, generateId } from '@/utils';

export interface ReplayProgress {
  total: number;
  current: number;
  currentRequest?: string;
  results: RequestResult[];
}

export class ReplayEngine {
  private cancelled = false;

  cancel() {
    this.cancelled = true;
  }

  async runReplay(
    requests: ApiRequest[],
    queueItems: ReplayQueueItem[],
    environment: Environment | undefined,
    config: ReplayConfig,
    onProgress?: (progress: ReplayProgress) => void
  ): Promise<RequestResult[]> {
    this.cancelled = false;
    const results: RequestResult[] = [];
    const extractedVars: Record<string, string> = {};

    const enabledItems = queueItems
      .filter((i) => i.enabled)
      .sort((a, b) => a.order - b.order);

    const enabledRequests = enabledItems
      .map((item) => requests.find((r) => r.id === item.requestId))
      .filter((r): r is ApiRequest => !!r);

    const total = enabledRequests.length;
    let completed = 0;

    const buildResult = (
      request: ApiRequest,
      sendResult: SendRequestResult,
      startTime: number
    ): RequestResult => {
      const resp = sendResult.response;
      const assertionResults = resp
        ? runAssertions(resp, request.assertions || [])
        : [];

      let passed = true;
      if (sendResult.error || sendResult.bodyParseError) {
        passed = false;
      } else if (assertionResults.length > 0) {
        passed = assertionResults.every((a) => a.passed);
      }

      let extracted: Record<string, string> = {};
      if (config.extractPrevious && resp) {
        extracted = extractFromResponse(resp, request.extractors || []);
      }

      return {
        id: generateId(),
        requestId: request.id,
        request,
        actualRequest: sendResult.actualRequest,
        response: resp,
        error: sendResult.error,
        assertionResults,
        extractedVariables: extracted,
        passed,
        startTime,
        endTime: Date.now()
      };
    };

    const processRequest = async (
      request: ApiRequest,
      index: number
    ): Promise<RequestResult> => {
      if (this.cancelled) {
        return {
          id: generateId(),
          requestId: request.id,
          request,
          assertionResults: [],
          extractedVariables: {},
          passed: false,
          startTime: Date.now(),
          endTime: Date.now(),
          error: '已取消'
        };
      }

      const startTime = Date.now();
      const envVars = collectVariables(environment?.variables || [], extractedVars);

      const sendResult = await sendRequest(request, envVars);

      if (config.extractPrevious && sendResult.response) {
        const extracted = extractFromResponse(sendResult.response, request.extractors || []);
        Object.assign(extractedVars, extracted);
      }

      const result = buildResult(request, sendResult, startTime);
      return result;
    };

    if (config.concurrency <= 1) {
      for (let i = 0; i < enabledRequests.length; i++) {
        const request = enabledRequests[i];
        const result = await processRequest(request, i);
        results.push(result);
        completed++;

        if (onProgress) {
          onProgress({
            total,
            current: completed,
            currentRequest: request.name,
            results: [...results]
          });
        }

        if (config.stopOnFailure && !result.passed) break;
        if (i < enabledRequests.length - 1 && config.interval > 0) {
          await sleep(config.interval);
        }
      }
    } else {
      let index = 0;
      const runBatch = async (): Promise<void> => {
        while (index < enabledRequests.length && !this.cancelled) {
          const currentIndex = index++;
          const request = enabledRequests[currentIndex];
          const result = await processRequest(request, currentIndex);
          results[currentIndex] = result;
          completed++;

          if (onProgress) {
            onProgress({
              total,
              current: completed,
              currentRequest: request.name,
              results: results.filter(Boolean)
            });
          }

          if (config.stopOnFailure && !result.passed) {
            this.cancel();
            break;
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(config.concurrency, enabledRequests.length) },
        () => runBatch()
      );
      await Promise.all(workers);
    }

    return results;
  }

  filterResultsByStatus(
    results: RequestResult[],
    filter: ReplayConfig['statusFilter']
  ): RequestResult[] {
    if (filter === 'all') return results;
    if (filter === 'failed') return results.filter((r) => !r.passed);

    return results.filter((r) => {
      if (!r.response) return false;
      const s = r.response.status;
      switch (filter as '2xx' | '3xx' | '4xx' | '5xx') {
        case '2xx':
          return s >= 200 && s < 300;
        case '3xx':
          return s >= 300 && s < 400;
        case '4xx':
          return s >= 400 && s < 500;
        case '5xx':
          return s >= 500 && s < 600;
        default:
          return true;
      }
    });
  }
}

export const replayEngine = new ReplayEngine();
