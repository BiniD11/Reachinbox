'use client';
import { useState, useEffect } from 'react';
import { emailsApi } from '@/lib/api';
import { EmailJob } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function ScheduledEmailsTab() {
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  
  const fetchJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await emailsApi.getScheduled(page);
      setJobs(res.data.jobs);
      setTotal(res.data.total);
    } catch {
      if (!silent) toast.error('Failed to load scheduled emails');
    } finally {
      if (!silent) setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchJobs();
    // Live polling every 3 seconds for real-time progress updates
    const interval = setInterval(() => {
      fetchJobs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [page]);
  
  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this email job?')) return;
    try {
      await emailsApi.cancelJob(id);
      toast.success('Job cancelled');
      fetchJobs();
    } catch {
      toast.error('Failed to cancel job');
    }
  };

  const handleRecover = async () => {
    try {
      setRecovering(true);
      await emailsApi.recover();
      toast.success('Triggered recovery for processing jobs!');
      fetchJobs();
    } catch {
      toast.error('Failed to trigger recovery');
    } finally {
      setRecovering(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }
  
  if (!jobs.length) {
    return (
      <EmptyState
        icon="📅"
        title="No scheduled emails"
        description="Schedule an email campaign and it will appear here."
      />
    );
  }
  
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400">
          Showing real-time live updates via BullMQ queue worker
        </p>
        <button
          onClick={handleRecover}
          disabled={recovering}
          className="text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          {recovering ? <Spinner size="sm" /> : '⚡'}
          {recovering ? 'Syncing...' : 'Resume / Sync Processing Jobs'}
        </button>
      </div>

      <div className="bg-dark-800 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Subject</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Sender</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Recipients</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Scheduled At</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Progress</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Status</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-700/10 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-white truncate max-w-[200px]">{job.subject}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300">{job.sender?.email || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-300">{job.totalEmails.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300">{format(new Date(job.scheduledAt), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-slate-500">{format(new Date(job.scheduledAt), 'h:mm a')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700/50 rounded-full h-1.5 w-24">
                        <div
                          className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${job.totalEmails > 0 ? (job.sentCount / job.totalEmails) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{job.sentCount}/{job.totalEmails}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={job.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(job.status === 'PROCESSING' && job.sentCount === 0) && (
                        <button
                          onClick={handleRecover}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          Resume
                        </button>
                      )}
                      {(job.status === 'PENDING' || job.status === 'PAUSED' || job.status === 'PROCESSING') && (
                        <button
                          onClick={() => handleCancel(job.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {total > 20 && (
          <div className="border-t border-slate-700/50 px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">Showing {((page-1)*20)+1}–{Math.min(page*20, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors">← Prev</button>
              <button onClick={() => setPage(p => p+1)} disabled={page*20 >= total}
                className="text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
