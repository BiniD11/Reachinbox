interface BadgeProps {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'SENT';
}

const statusConfig = {
  PENDING: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  PROCESSING: { label: 'Processing', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  COMPLETED: { label: 'Completed', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  SENT: { label: 'Sent', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  FAILED: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  PAUSED: { label: 'Paused', className: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
};

export function Badge({ status }: BadgeProps) {
  const cfg = statusConfig[status] || statusConfig.PENDING;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
