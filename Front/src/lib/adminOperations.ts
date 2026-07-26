import { useCallback, useEffect, useRef, useState } from 'react';

export type AdminOperationStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'finishing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export type AdminOperationError = {
  targetId?: string;
  label?: string;
  stage: string;
  message: string;
};

export type AdminOperation = {
  id: string;
  key: string;
  type: string;
  labelKey: string;
  phaseKey: string;
  status: AdminOperationStatus;
  targetKind: 'profile' | 'image' | 'global';
  conflictGroup: string;
  targetIds: string[];
  total: number | null;
  completed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  completedBatches: number;
  indeterminate: boolean;
  startedAt: number | null;
  updatedAt: number;
  finishedAt: number | null;
  lastMessageKey?: string;
  errors: AdminOperationError[];
  details?: Record<string, number>;
};

export type AdminOperationStart = Pick<AdminOperation,
  'type' | 'labelKey' | 'targetKind' | 'conflictGroup' | 'targetIds' | 'total' | 'indeterminate'
> & {
  parameters?: Record<string, unknown>;
  phaseKey?: string;
};

export type AdminOperationPatch = Partial<Omit<AdminOperation, 'id' | 'key' | 'type' | 'targetIds'>>;

export type AdminBatchResult = {
  succeeded: number;
  skipped: number;
  failed: number;
  errors?: AdminOperationError[];
  details?: Record<string, number>;
};

export type AdminBatchProgress = AdminBatchResult & {
  completed: number;
  completedBatches: number;
};

const activeStatuses = new Set<AdminOperationStatus>(['queued', 'preparing', 'running', 'finishing']);
const terminalStatuses = new Set<AdminOperationStatus>(['completed', 'partially_completed', 'failed', 'cancelled']);

export function isAdminOperationActive(operation: AdminOperation) {
  return activeStatuses.has(operation.status);
}

export function isAdminOperationTerminal(operation: AdminOperation) {
  return terminalStatuses.has(operation.status);
}

export function stableAdminOperationKey(
  type: string,
  targetIds: string[],
  parameters: Record<string, unknown> = {}
) {
  return `${type}:${JSON.stringify([...new Set(targetIds)].sort())}:${stableJson(parameters)}`;
}

export function createAdminOperation(input: AdminOperationStart, now = Date.now()): AdminOperation {
  const targetIds = [...new Set(input.targetIds)].sort();
  const key = stableAdminOperationKey(input.type, targetIds, input.parameters);
  return {
    id: `${now.toString(36)}-${operationSequence += 1}`,
    key,
    type: input.type,
    labelKey: input.labelKey,
    phaseKey: input.phaseKey || 'admin.operations.phase.preparing',
    status: 'preparing',
    targetKind: input.targetKind,
    conflictGroup: input.conflictGroup,
    targetIds,
    total: input.total === input.targetIds.length ? targetIds.length : input.total,
    completed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    completedBatches: 0,
    indeterminate: input.indeterminate,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    errors: []
  };
}

let operationSequence = 0;

export function findActiveDuplicate(operations: AdminOperation[], key: string) {
  return operations.find((operation) => operation.key === key && isAdminOperationActive(operation));
}

export function findAdminOperationConflict(operations: AdminOperation[], candidate: AdminOperation) {
  if (candidate.targetKind === 'global') {
    return operations.find((operation) =>
      isAdminOperationActive(operation)
      && operation.conflictGroup === candidate.conflictGroup
      && operation.targetKind === 'global'
    );
  }
  const targets = new Set(candidate.targetIds);
  return operations.find((operation) =>
    isAdminOperationActive(operation)
    && operation.targetKind === candidate.targetKind
    && operation.conflictGroup === candidate.conflictGroup
    && operation.targetIds.some((id) => targets.has(id))
  );
}

export function shouldWarnBeforeAdminUnload(operations: AdminOperation[]) {
  return operations.some(isAdminOperationActive);
}

export function sanitizeAdminOperationMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || 'request_failed');
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:access_token|refresh_token|authorization|service_role_key|token)["']?\s*[:=]\s*)["']?[^,\s}"']+/gi, '$1[redacted]')
    .replace(/\r?\n[\s\S]*/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 240) || 'request_failed';
}

export async function executeAdminBatches<T>(options: {
  items: readonly T[];
  batchSize: number;
  execute: (batch: readonly T[], batchIndex: number) => Promise<AdminBatchResult>;
  onProgress?: (progress: AdminBatchProgress) => void;
  continueOnError?: boolean;
  errorTargetId?: (item: T) => string;
  errorStage?: string;
}) {
  const batchSize = Math.max(1, Math.floor(options.batchSize));
  const aggregate: AdminBatchProgress = {
    completed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    completedBatches: 0,
    errors: [],
    details: {}
  };
  for (let offset = 0, batchIndex = 0; offset < options.items.length; offset += batchSize, batchIndex += 1) {
    const batch = options.items.slice(offset, offset + batchSize);
    try {
      const result = await options.execute(batch, batchIndex);
      aggregate.completed += batch.length;
      aggregate.succeeded += result.succeeded;
      aggregate.skipped += result.skipped;
      aggregate.failed += result.failed;
      aggregate.completedBatches += 1;
      aggregate.errors!.push(...(result.errors || []));
      mergeDetails(aggregate.details!, result.details);
    } catch (error) {
      aggregate.completed += batch.length;
      aggregate.failed += batch.length;
      aggregate.completedBatches += 1;
      aggregate.errors!.push(...batch.map((item) => ({
        targetId: options.errorTargetId?.(item),
        stage: options.errorStage || 'request',
        message: sanitizeAdminOperationMessage(error)
      })));
      if (options.continueOnError === false) {
        options.onProgress?.(cloneProgress(aggregate));
        break;
      }
    }
    options.onProgress?.(cloneProgress(aggregate));
  }
  return cloneProgress(aggregate);
}

export function finalAdminOperationStatus(result: Pick<AdminBatchProgress, 'succeeded' | 'skipped' | 'failed'>): AdminOperationStatus {
  if (result.failed > 0 && result.succeeded + result.skipped === 0) return 'failed';
  if (result.failed > 0 || result.skipped > 0) return 'partially_completed';
  return 'completed';
}

export function useAdminOperations() {
  const [operations, setOperationsState] = useState<AdminOperation[]>([]);
  const operationsRef = useRef<AdminOperation[]>([]);

  const commit = useCallback((next: AdminOperation[]) => {
    operationsRef.current = next;
    setOperationsState(next);
  }, []);

  const startOperation = useCallback((input: AdminOperationStart) => {
    const candidate = createAdminOperation(input);
    if (findActiveDuplicate(operationsRef.current, candidate.key)) {
      return { operation: null, reason: 'duplicate' as const };
    }
    if (findAdminOperationConflict(operationsRef.current, candidate)) {
      return { operation: null, reason: 'conflict' as const };
    }
    commit([candidate, ...operationsRef.current]);
    return { operation: candidate, reason: null };
  }, [commit]);

  const updateOperation = useCallback((id: string, patch: AdminOperationPatch) => {
    const now = Date.now();
    commit(operationsRef.current.map((operation) => operation.id === id ? {
      ...operation,
      ...patch,
      errors: patch.errors ? patch.errors.slice(0, 200) : operation.errors,
      updatedAt: now,
      finishedAt: patch.status && terminalStatuses.has(patch.status) ? now : operation.finishedAt
    } : operation));
  }, [commit]);

  const dismissOperation = useCallback((id: string) => {
    const operation = operationsRef.current.find((item) => item.id === id);
    if (!operation || !isAdminOperationTerminal(operation)) return;
    commit(operationsRef.current.filter((item) => item.id !== id));
  }, [commit]);

  const activeOperation = useCallback((type: string) =>
    operationsRef.current.find((operation) => operation.type === type && isAdminOperationActive(operation)), []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeAdminUnload(operationsRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { operations, operationsRef, startOperation, updateOperation, dismissOperation, activeOperation };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function mergeDetails(target: Record<string, number>, details?: Record<string, number>) {
  for (const [key, value] of Object.entries(details || {})) target[key] = (target[key] || 0) + Number(value || 0);
}

function cloneProgress(progress: AdminBatchProgress): AdminBatchProgress {
  return {
    ...progress,
    errors: [...(progress.errors || [])],
    details: { ...(progress.details || {}) }
  };
}
