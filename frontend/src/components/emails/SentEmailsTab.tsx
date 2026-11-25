'use client';
import { useState, useEffect } from 'react';
import { emailsApi } from '@/lib/api';
import { EmailLog } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function SentEmailsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await emailsApi.getSent(page);
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load sent emails');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setIsSearching(false);
      fetchLogs();
      return;
    }

    try {
      setIsSearching(true);
      setLoading(true);
      const res = await emailsApi.search(query, 'SENT');
      // Format Elasticsearch hits to match EmailLog structure
      const results = (res.data.results || []).map((hit: any) => ({
        id: hit.id,
        jobId: hit.jobId,
        recipient: hit.recipient,
        subject: hit.subject,
        sentAt: hit.sentAt,
        status: hit.status,
        createdAt: hit.createdAt,
        job: { sender: { email: hit.senderEmail, name: 'Sender' } },
      }));
      setLogs(results);
      setTotal(results.length);
    } catch (err) {
      toast.error('Elasticsearch search error');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => { 
    if (!search) {
      fetchLogs(); 
    }
  }, [page]);
  
  if (loading && !search) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }
  
  return (
    <div className="animate-fade-in">
      {/* Search Header */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSearch(search); }} 
          className="relative flex-1 max-w-md"
        >
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(search); }}
            placeholder="Search subject, body, or recipient via Elasticsearch..."
            className="w-full bg-dark-800 border border-slate-700/50 text-slate-300 placeholder-slate-500 rounded-xl pl-10 pr-24 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={() => handleSearch(search)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-brand-600 hover:bg-brand-500 text-white px-2.5 py-1 rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        {isSearching && (
          <button
            onClick={() => { setSearch(''); setIsSearching(false); fetchLogs(); }}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Clear Search
          </button>
        )}
      </div>
      
      {!logs.length ? (
        <EmptyState
          icon={isSearching ? "🔍" : "✉️"}
          title={isSearching ? "No matching emails found" : "No sent emails yet"}
          description={isSearching ? "Try a different search term in Elasticsearch." : "Once your scheduled emails are sent via Ethereal SMTP, they will appear here."}
        />
      ) : (
        <div className="bg-dark-800 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-dark-850/50">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">Recipient</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">Subject</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">Sender</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">Sent At</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-750/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-200">{log.recipient}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white truncate max-w-[220px]">{log.subject}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-300">{log.job?.sender?.email || '—'}</p>
                    </td>
                    <td className="px-6 py-4">
                      {log.sentAt ? (
                        <>
                          <p className="text-sm text-slate-300">{format(new Date(log.sentAt), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-slate-500">{format(new Date(log.sentAt), 'h:mm a')}</p>
                        </>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={log.status} />
                      {log.error && (
                        <p className="text-xs text-red-400 mt-0.5 truncate max-w-[150px]" title={log.error}>{log.error}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {total > 20 && !isSearching && (
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
      )}
    </div>
  );
}
