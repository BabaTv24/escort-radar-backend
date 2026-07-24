import React, { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

export function stopAdminSelectionClick(event: Pick<MouseEvent, 'stopPropagation'>) {
  event.stopPropagation();
}

export function setAdminSelectionIndeterminate(input: Pick<HTMLInputElement, 'indeterminate'> | null, indeterminate: boolean) {
  if (input) input.indeterminate = indeterminate;
}

export function AdminSelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
  ariaLabel,
  className
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAdminSelectionIndeterminate(inputRef.current, indeterminate);
  }, [indeterminate]);

  return (
    <label className={className} onClick={stopAdminSelectionClick}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={stopAdminSelectionClick}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  );
}
