import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, X } from 'lucide-react';
import type { AdminOperation } from '../lib/adminOperations';
import { isAdminOperationActive, isAdminOperationTerminal } from '../lib/adminOperations';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function AdminOperationCenter({ operations, onDismiss, t }: {
  operations: AdminOperation[];
  onDismiss: (id: string) => void;
  t: Translate;
}) {
  const [, setClock] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasActive = operations.some(isAdminOperationActive);

  useEffect(() => {
    if (!hasActive) return;
    const timer = globalThis.setInterval(() => setClock((value) => value + 1), 1000);
    return () => globalThis.clearInterval(timer);
  }, [hasActive]);

  if (!operations.length) return null;
  return (
    <aside className="admin-operation-center" aria-label={t('admin.operations.centerTitle')}>
      <div className="admin-operation-center-title">
        <strong>{t('admin.operations.centerTitle')}</strong>
        <span>{operations.filter(isAdminOperationActive).length}</span>
      </div>
      <div className="admin-operation-list" aria-live="polite" aria-relevant="additions text">
        {operations.map((operation) => {
          const isExpanded = Boolean(expanded[operation.id]);
          const percent = operation.total && !operation.indeterminate
            ? Math.min(100, Math.round((operation.completed / operation.total) * 100))
            : null;
          const elapsedSeconds = Math.max(0, Math.floor(((operation.finishedAt || Date.now()) - (operation.startedAt || operation.updatedAt)) / 1000));
          const etaSeconds = operation.completedBatches >= 3 && operation.total && operation.completed > 0 && isAdminOperationActive(operation)
            ? Math.round((elapsedSeconds / operation.completed) * Math.max(0, operation.total - operation.completed))
            : null;
          return (
            <article className={`admin-operation-card status-${operation.status}`} key={operation.id} aria-busy={isAdminOperationActive(operation)}>
              <div className="admin-operation-heading">
                <div>
                  <strong>{t(operation.labelKey)}</strong>
                  <small>{t(`admin.operations.status.${operation.status}`)} · {t(operation.phaseKey)}</small>
                </div>
                {isAdminOperationActive(operation) ? <LoaderCircle className="admin-operation-spinner" size={18} aria-hidden="true" /> : null}
                {isAdminOperationTerminal(operation) ? (
                  <button type="button" className="admin-operation-icon" onClick={() => onDismiss(operation.id)} aria-label={t('admin.operations.dismiss')}>
                    <X size={16} />
                  </button>
                ) : null}
              </div>
              <div
                className={`admin-operation-progress ${operation.indeterminate && isAdminOperationActive(operation) ? 'is-indeterminate' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={operation.total || undefined}
                aria-valuenow={!operation.indeterminate ? operation.completed : undefined}
                aria-label={t(operation.labelKey)}
              >
                <span style={percent === null ? undefined : { width: `${percent}%` }} />
              </div>
              <div className="admin-operation-counts">
                <strong>{operation.total === null ? t('admin.operations.preparing') : `${operation.completed} / ${operation.total}`}</strong>
                {percent !== null ? <span>{percent}%</span> : null}
              </div>
              <div className="admin-operation-metrics">
                <span>{t('admin.operations.succeeded')}: <b>{operation.succeeded}</b></span>
                <span>{t('admin.operations.skipped')}: <b>{operation.skipped}</b></span>
                <span>{t('admin.operations.failed')}: <b>{operation.failed}</b></span>
              </div>
              <div className="admin-operation-time">
                <span>{t('admin.operations.elapsed')}: {formatDuration(elapsedSeconds)}</span>
                {etaSeconds !== null ? <span>{t('admin.operations.eta')}: {formatDuration(etaSeconds)}</span> : null}
              </div>
              {operation.lastMessageKey ? <p className="admin-operation-message">{t(operation.lastMessageKey)}</p> : null}
              {(operation.errors.length > 0 || Object.keys(operation.details || {}).length > 0) ? (
                <>
                  <button
                    type="button"
                    className="admin-operation-details-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((current) => ({ ...current, [operation.id]: !isExpanded }))}
                  >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {t('admin.operations.details')}
                  </button>
                  {isExpanded ? (
                    <div className="admin-operation-details">
                      {Object.entries(operation.details || {}).map(([key, value]) => (
                        <p key={key}>{t(`admin.operations.detail.${key}`)}: <strong>{value}</strong></p>
                      ))}
                      {operation.errors.length ? (
                        <ul>
                          {operation.errors.map((error, index) => (
                            <li key={`${error.targetId || 'operation'}-${index}`}>
                              <strong>{error.label || error.targetId || t('admin.operations.unknownTarget')}</strong>
                              <span>{t('admin.operations.stage')}: {error.stage}</span>
                              <span>{error.message}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
    : [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
