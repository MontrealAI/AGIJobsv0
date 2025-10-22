import axios, { AxiosInstance } from 'axios';
import promiseRetry from 'promise-retry';
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import Bottleneck from 'bottleneck';
import { sleep } from './utils.js';
import type {
  JobsClientConfig,
  JobsTask,
  CircuitBreakerConfig,
  CircuitBreakerState
} from './types.js';

const tracer = trace.getTracer('arena.jobs-client');

export class JobsClient {
  private readonly http: AxiosInstance;
  private readonly limiter = new Bottleneck({ maxConcurrent: 5, minTime: 100 });
  private readonly circuitState: CircuitBreakerState = { failures: 0 };

  constructor(
    private readonly config: JobsClientConfig,
    private readonly circuitBreakerConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      cooldownMs: 30_000
    }
  ) {
    this.http = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeoutMs ?? 5000,
      headers: config.apiKey
        ? {
            Authorization: `Bearer ${config.apiKey}`
          }
        : undefined
    });
  }

  async fetchTasks(limit = 10): Promise<JobsTask[]> {
    return this.withSpan('fetchTasks', async (span) => {
      const response = await this.withLimiter(() => this.requestWithRetry(() => this.http.get('/tasks', { params: { limit } })));
      const tasks = response.data?.tasks ?? [];
      span.setAttribute('tasks.count', tasks.length);
      return tasks;
    });
  }

  async submitResult(taskId: string, payload: unknown) {
    return this.withSpan('submitResult', async () => {
      await this.withLimiter(() =>
        this.requestWithRetry(() => this.http.post(`/tasks/${taskId}/results`, payload))
      );
    });
  }

  async triggerOnChainAction(endpoint: string, payload: unknown) {
    return this.withSpan('triggerOnChainAction', async (span) => {
      await this.ensureCircuit();
      try {
        await this.withLimiter(() =>
          this.requestWithRetry(() => this.http.post(endpoint, payload), {
            retries: 4,
            factor: 2,
            minTimeout: 500
          })
        );
        this.resetCircuit();
      } catch (error) {
        await this.recordFailure(error as Error, span);
        throw error;
      }
    });
  }

  private async requestWithRetry<T>(fn: () => Promise<T>, retryOptions?: promiseRetry.Options): Promise<T> {
    return promiseRetry(
      async (retry, attempt) => {
        try {
          return await fn();
        } catch (error) {
          if (attempt >= 5) {
            throw error;
          }
          retry(error as Error);
        }
      },
      {
        retries: 5,
        factor: 2,
        minTimeout: 250,
        ...retryOptions
      }
    );
  }

  private async withLimiter<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn);
  }

  private async withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    const span = tracer.startSpan(name);
    try {
      const result = await fn(span);
      span.setStatus({ code: 1 });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  private async ensureCircuit() {
    const state = this.circuitState;
    if (state.openUntil && Date.now() < state.openUntil) {
      throw new Error('Circuit breaker open');
    }
    if (state.openUntil && Date.now() >= state.openUntil) {
      state.failures = 0;
      state.openUntil = undefined;
      state.lastFailureAt = undefined;
    }
  }

  private async recordFailure(error: Error, span: Span) {
    const state = this.circuitState;
    state.failures += 1;
    state.lastFailureAt = Date.now();
    span.addEvent('onchain.failure', {
      message: error.message,
      failures: state.failures
    });
    if (state.failures >= this.circuitBreakerConfig.failureThreshold) {
      state.openUntil = Date.now() + this.circuitBreakerConfig.cooldownMs;
      span.addEvent('circuit.opened', { until: state.openUntil });
      await sleep(this.circuitBreakerConfig.cooldownMs);
    }
  }

  private resetCircuit() {
    this.circuitState.failures = 0;
    this.circuitState.lastFailureAt = undefined;
    this.circuitState.openUntil = undefined;
  }
}
