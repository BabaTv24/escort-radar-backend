import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';

type AdminWindowLabels = {
  minimize: string;
  expand: string;
  maximize: string;
  restore: string;
  close: string;
};

type AdminWindowContextValue = {
  maximizedId: string | null;
  setMaximizedId: Dispatch<SetStateAction<string | null>>;
};

const AdminWindowContext = createContext<AdminWindowContextValue | null>(null);

export function AdminWindowProvider({ children }: { children: ReactNode }) {
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  useEffect(() => {
    if (!maximizedId) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [maximizedId]);

  const value = useMemo(() => ({ maximizedId, setMaximizedId }), [maximizedId]);
  return <AdminWindowContext.Provider value={value}>{children}</AdminWindowContext.Provider>;
}

type AdminWindowProps = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  labels: AdminWindowLabels;
  onClose?: () => void;
  workspace?: boolean;
};

export function AdminWindow({
  id,
  title,
  subtitle,
  children,
  className = '',
  contentClassName = '',
  labels,
  onClose,
  workspace = false
}: AdminWindowProps) {
  const context = useContext(AdminWindowContext);
  if (!context) throw new Error('AdminWindow must be rendered inside AdminWindowProvider');

  const { maximizedId, setMaximizedId } = context;
  const [minimized, setMinimized] = useState(false);
  const maximized = maximizedId === id;

  const restore = useCallback(() => {
    setMaximizedId((current) => current === id ? null : current);
  }, [id, setMaximizedId]);

  useEffect(() => () => restore(), [restore]);

  useEffect(() => {
    if (!maximized) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      restore();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [maximized, restore]);

  function toggleMinimized() {
    if (maximized) restore();
    setMinimized((current) => !current);
  }

  function toggleMaximized() {
    setMinimized(false);
    setMaximizedId(maximized ? null : id);
  }

  const classes = [
    'admin-window',
    workspace ? 'admin-window--workspace' : 'admin-window--dialog',
    minimized ? 'is-minimized' : '',
    maximized ? 'is-maximized' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <section className={classes} role={workspace ? undefined : 'dialog'} aria-modal={workspace ? undefined : true} aria-labelledby={`${id}-title`} onClick={(event) => event.stopPropagation()}>
      <header className="admin-window-titlebar">
        <div className="admin-window-heading">
          {subtitle ? <span className="admin-window-subtitle">{subtitle}</span> : null}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <div className="admin-window-controls">
          <button type="button" className="admin-window-control minimize" onClick={toggleMinimized} aria-label={minimized ? labels.expand : labels.minimize} title={minimized ? labels.expand : labels.minimize} aria-expanded={!minimized}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" className="admin-window-control maximize" onClick={toggleMaximized} aria-label={maximized ? labels.restore : labels.maximize} title={maximized ? labels.restore : labels.maximize}>
            {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
          {onClose ? (
            <button type="button" className="admin-window-control close" onClick={onClose} aria-label={labels.close} title={labels.close}>
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="admin-window-content-shell" aria-hidden={minimized}>
        <div className={`admin-window-content ${contentClassName}`.trim()}>{children}</div>
      </div>
    </section>
  );
}
