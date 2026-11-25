'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { ScheduledEmailsTab } from '@/components/emails/ScheduledEmailsTab';
import { SentEmailsTab } from '@/components/emails/SentEmailsTab';
import { ComposeModal } from '@/components/emails/ComposeModal';
import { Spinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { emailsApi } from '@/lib/api';

type Tab = 'scheduled' | 'sent';

function DashboardContent() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({ scheduled: 0, sent: 0, failed: 0 });
  
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);
  
  useEffect(() => {
    const slack = searchParams.get('slack');
    if (slack === 'connected') toast.success('Slack connected successfully! Hourly rate limits will trigger real alerts.');
    if (slack === 'error') toast.error(`Failed to connect Slack: ${searchParams.get('msg') || 'Unknown error'}`);
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      Promise.all([
        emailsApi.getScheduled(1, 1).catch(() => ({ data: { total: 0 } })),
        emailsApi.getSent(1, 1).catch(() => ({ data: { total: 0 } }))
      ]).then(([schedRes, sentRes]) => {
        setStats({
          scheduled: schedRes.data?.total || 0,
          sent: sentRes.data?.total || 0,
          failed: 0,
        });
      });
    }
  }, [user, refreshKey]);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <Spinner size="lg" />
      </div>
    );
  }
  
  if (!user) return null;
  
  const handleScheduled = () => {
    setComposeOpen(false);
    setRefreshKey(k => k + 1);
    toast.success('Email campaign scheduled successfully with BullMQ!');
  };
  
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header user={user} onLogout={logout} />
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title + Compose Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Email Scheduler Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">
              BullMQ-powered delayed jobs • Redis hourly rate-limiter • Ethereal SMTP • Elasticsearch
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`${(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')}/admin/queues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-dark-800 hover:bg-dark-850 border border-slate-700/60 text-slate-300 hover:text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live BullMQ Queue UI
            </a>
            <button
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-medium py-2.5 px-5 rounded-xl transition-all duration-200 shadow-lg shadow-brand-600/25 hover:shadow-brand-600/40 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Compose New Email
            </button>
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-dark-800 border border-slate-700/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl">
                📅
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Scheduled Jobs</p>
                <p className="text-2xl font-bold text-white mt-0.5">{stats.scheduled}</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800 border border-slate-700/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">
                ✉️
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sent Emails</p>
                <p className="text-2xl font-bold text-white mt-0.5">{stats.sent}</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800 border border-slate-700/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">
                ⚡
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Scheduler Engine</p>
                <p className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  BullMQ + Redis Active
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div>
          <div className="flex border-b border-slate-700/50 mb-6">
            {(['scheduled', 'sent'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px flex items-center gap-2 ${
                  activeTab === tab
                    ? 'border-brand-500 text-brand-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab === 'scheduled' ? '📅' : '✉️'}</span>
                <span>{tab === 'scheduled' ? 'Scheduled Emails' : 'Sent Emails'}</span>
              </button>
            ))}
          </div>
          
          {activeTab === 'scheduled' && <ScheduledEmailsTab key={`sched-${refreshKey}`} />}
          {activeTab === 'sent' && <SentEmailsTab key={`sent-${refreshKey}`} />}
        </div>
      </main>
      
      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onScheduled={handleScheduled}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-900" />}>
      <DashboardContent />
    </Suspense>
  );
}
