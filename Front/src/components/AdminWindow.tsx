import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, SetStateAction } from 'react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import {
  adminWindowLayoutResetEvent,
  constrainAdminWindowBounds,
  readAdminWindowBounds,
  writeAdminWindowBounds
} from '../lib/adminWindowLayout';
import type { AdminWindowBounds, AdminWindowViewport } from '../lib/adminWindowLayout';

type AdminWindowLabels = {
  minimize: string;
  expand: string;
  maximize: string;
  restore: string;
  close: string;
  drag?: string;
  resize?: string;
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
  draggable?: boolean;
  resizable?: boolean;
  storageKey?: string;
  defaultBounds?: AdminWindowBounds;
  minWidth?: number;
  minHeight?: number;
};

let highestAdminWindowZIndex = 110;

export function AdminWindow({
  id,
  title,
  subtitle,
  children,
  className = '',
  contentClassName = '',
  labels,
  onClose,
  workspace = false,
  draggable = false,
  resizable = false,
  storageKey,
  defaultBounds = { x: 300, y: 110, width: 900, height: 680 },
  minWidth = 420,
  minHeight = 280
}: AdminWindowProps) {
  const context = useContext(AdminWindowContext);
  if (!context) throw new Error('AdminWindow must be rendered inside AdminWindowProvider');

  const { maximizedId, setMaximizedId } = context;
  const [minimized, setMinimized] = useState(false);
  const [floating, setFloating] = useState(false);
  const [zIndex, setZIndex] = useState(() => ++highestAdminWindowZIndex);
  const sectionRef = useRef<HTMLElement | null>(null);
  const interactionRef = useRef<{
    mode: 'drag' | 'resize';
    pointerId: number;
    startX: number;
    startY: number;
    bounds: AdminWindowBounds;
  } | null>(null);
  const defaultBoundsRef = useRef(defaultBounds);
  const [bounds, setBounds] = useState<AdminWindowBounds>(() => {
    const stored = typeof window !== 'undefined' && storageKey ? readAdminWindowBounds(window.localStorage, storageKey) : null;
    return stored || defaultBounds;
  });
  const maximized = maximizedId === id;

  const viewport = useCallback((): AdminWindowViewport => {
    const content = sectionRef.current?.closest('.admin-content')?.getBoundingClientRect();
    const topbar = sectionRef.current?.closest('.admin-content')?.querySelector('.admin-topbar')?.getBoundingClientRect();
    const left = Math.max(0, content?.left || 0);
    const top = Math.max(0, topbar?.bottom || content?.top || 0);
    return { left, top, width: Math.max(1, window.innerWidth - left), height: Math.max(1, window.innerHeight - top) };
  }, []);

  const constrain = useCallback((value: AdminWindowBounds) => constrainAdminWindowBounds(value, viewport(), minWidth, minHeight), [minHeight, minWidth, viewport]);

  const persistBounds = useCallback((value: AdminWindowBounds) => {
    if (!storageKey) return;
    writeAdminWindowBounds(window.localStorage, storageKey, value);
  }, [storageKey]);

  const bringToFront = useCallback(() => setZIndex(++highestAdminWindowZIndex), []);

  const restore = useCallback(() => {
    setMaximizedId((current) => current === id ? null : current);
  }, [id, setMaximizedId]);

  useEffect(() => () => restore(), [restore]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    const update = () => setFloating(workspace && (draggable || resizable) && media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [draggable, resizable, workspace]);

  useEffect(() => {
    if (!floating) return;
    const restoreToViewport = () => setBounds((current) => constrain(current));
    restoreToViewport();
    window.addEventListener('resize', restoreToViewport);
    return () => window.removeEventListener('resize', restoreToViewport);
  }, [constrain, floating]);

  useEffect(() => {
    if (!storageKey) return;
    const reset = () => {
      const next = constrain(defaultBoundsRef.current);
      setBounds(next);
      window.localStorage.removeItem(storageKey);
    };
    window.addEventListener(adminWindowLayoutResetEvent, reset);
    return () => window.removeEventListener(adminWindowLayoutResetEvent, reset);
  }, [constrain, storageKey]);

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

  function beginInteraction(event: ReactPointerEvent<HTMLElement>, mode: 'drag' | 'resize') {
    if (!floating || maximized || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (mode === 'drag' && (event.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    bringToFront();
    interactionRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    const next = interaction.mode === 'drag'
      ? { ...interaction.bounds, x: interaction.bounds.x + deltaX, y: interaction.bounds.y + deltaY }
      : { ...interaction.bounds, width: interaction.bounds.width + deltaX, height: interaction.bounds.height + deltaY };
    setBounds(constrain(next));
  }

  function endInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setBounds((current) => {
      const next = constrain(current);
      persistBounds(next);
      return next;
    });
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!floating || maximized || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    setBounds((current) => {
      const next = constrain({
        ...current,
        width: current.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        height: current.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)
      });
      persistBounds(next);
      return next;
    });
  }

  const classes = [
    'admin-window',
    workspace ? 'admin-window--workspace' : 'admin-window--dialog',
    minimized ? 'is-minimized' : '',
    maximized ? 'is-maximized' : '',
    floating ? 'is-floating' : '',
    floating && draggable ? 'is-draggable' : '',
    floating && resizable ? 'is-resizable' : '',
    className
  ].filter(Boolean).join(' ');

  const floatingStyle: CSSProperties | undefined = floating && !maximized ? {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: minimized ? undefined : bounds.height,
    zIndex
  } : undefined;

  return (
    <section ref={sectionRef} className={classes} style={floatingStyle} role={workspace ? undefined : 'dialog'} aria-modal={workspace ? undefined : true} aria-labelledby={`${id}-title`} onPointerDown={bringToFront} onPointerMove={updateInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} onClick={(event) => event.stopPropagation()}>
      <header className="admin-window-titlebar" aria-label={draggable ? labels.drag : undefined} onPointerDown={(event) => beginInteraction(event, 'drag')}>
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
      {floating && resizable && !minimized && !maximized ? (
        <button type="button" className="admin-window-resize-handle" aria-label={labels.resize || 'Resize window'} title={labels.resize || 'Resize window'} onPointerDown={(event) => beginInteraction(event, 'resize')} onKeyDown={resizeWithKeyboard} />
      ) : null}
    </section>
  );
}
