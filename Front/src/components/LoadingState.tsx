export function LoadingState({ label = 'Loading radar signal...' }: { label?: string }) {
  return <div className="state-panel">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-panel error">{message}</div>;
}
