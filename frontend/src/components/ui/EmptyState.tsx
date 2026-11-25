interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm max-w-sm">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 px-5 rounded-xl transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
