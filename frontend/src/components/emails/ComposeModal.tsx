'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { emailsApi, sendersApi } from '@/lib/api';
import { EmailSender } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';

interface ComposeModalProps {
  onClose: () => void;
  onScheduled: () => void;
}

export function ComposeModal({ onClose, onScheduled }: ComposeModalProps) {
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recipientFile, setRecipientFile] = useState<File | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    senderId: '',
    senderEmail: '',
    senderName: '',
    subject: '',
    body: '',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    delayBetween: 2000,
    hourlyLimit: 100,
  });
  
  useEffect(() => {
    setLoading(true);
    sendersApi.list()
      .then(res => {
        setSenders(res.data.senders);
        if (res.data.senders.length > 0) {
          const first = res.data.senders[0];
          setForm(f => ({
            ...f,
            senderId: first.id,
            senderEmail: first.email,
            senderName: first.name || '',
          }));
        }
      })
      .catch(() => toast.error('Failed to load senders'))
      .finally(() => setLoading(false));
  }, []);
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setRecipientFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = Array.from(new Set(content.match(emailRegex) || []));
      setRecipientCount(emails.length);
    };
    reader.readAsText(file);
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
  });
  
  const handleCreateEthereal = async () => {
    try {
      const res = await sendersApi.createEthereal('Ethereal Test');
      setSenders(prev => [...prev, res.data.sender]);
      setForm(f => ({
        ...f,
        senderId: res.data.sender.id,
        senderEmail: res.data.sender.email,
        senderName: res.data.sender.name || 'Ethereal Test',
      }));
      toast.success(`Ethereal sender created: ${res.data.sender.email}`);
    } catch {
      toast.error('Failed to create Ethereal sender');
    }
  };

  const handleSelectExistingSender = (senderId: string) => {
    const s = senders.find(x => x.id === senderId);
    if (s) {
      setForm(f => ({
        ...f,
        senderId: s.id,
        senderEmail: s.email,
        senderName: s.name || '',
      }));
    } else {
      setForm(f => ({ ...f, senderId: '' }));
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.senderEmail.trim() && !form.senderId) {
      toast.error('Please enter or select a sender email');
      return;
    }
    if (!recipientFile) {
      toast.error('Please upload a recipients file');
      return;
    }
    if (!form.subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!form.body.trim()) {
      toast.error('Body is required');
      return;
    }
    
    try {
      setSubmitting(true);
      const fd = new FormData();
      if (form.senderId) fd.append('senderId', form.senderId);
      fd.append('senderEmail', form.senderEmail.trim());
      fd.append('senderName', form.senderName.trim());
      fd.append('subject', form.subject);
      fd.append('body', form.body);
      fd.append('scheduledAt', new Date(form.scheduledAt).toISOString());
      fd.append('delayBetween', String(form.delayBetween));
      fd.append('hourlyLimit', String(form.hourlyLimit));
      fd.append('recipients', recipientFile);
      
      await emailsApi.schedule(fd);
      onScheduled();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-dark-800 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-2xl animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/50">
            <div>
              <h2 className="text-lg font-semibold text-white">Schedule Email Campaign</h2>
              <p className="text-xs text-slate-500 mt-0.5">BullMQ delayed jobs — no cron</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Sender Field with Direct Typing & Quick Select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-400">From (Sender Email & Name)</label>
                <div className="flex items-center gap-2">
                  {senders.length > 0 && (
                    <select
                      value={form.senderId}
                      onChange={e => handleSelectExistingSender(e.target.value)}
                      className="bg-dark-900 border border-slate-700/60 text-slate-400 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Choose saved sender...</option>
                      {senders.map(s => (
                        <option key={s.id} value={s.id}>{s.email}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleCreateEthereal}
                    className="text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                  >
                    + Generate Ethereal
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="email"
                  value={form.senderEmail}
                  onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value, senderId: '' }))}
                  placeholder="Type sender email (e.g. sales@company.com)"
                  className="w-full bg-dark-900 border border-slate-700/50 text-slate-200 placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                  required
                />
                <input
                  type="text"
                  value={form.senderName}
                  onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))}
                  placeholder="Sender name (e.g. ReachInbox Team)"
                  className="w-full bg-dark-900 border border-slate-700/50 text-slate-200 placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                You can type any custom sender email address above or pick an existing Ethereal test account.
              </p>
            </div>
            
            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Your email subject..."
                className="w-full bg-dark-900 border border-slate-700/50 text-slate-300 placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            
            {/* Body */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Body (HTML supported)</label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="<p>Hello {{name}},</p><p>Your email body here...</p>"
                rows={4}
                className="w-full bg-dark-900 border border-slate-700/50 text-slate-300 placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors font-mono resize-none"
              />
            </div>
            
            {/* Recipients */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Recipients (CSV or TXT)</label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
                  isDragActive
                    ? 'border-brand-500 bg-brand-500/5'
                    : recipientFile
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-slate-700/50 hover:border-slate-600 bg-dark-900/50'
                }`}
              >
                <input {...getInputProps()} />
                {recipientFile ? (
                  <div>
                    <p className="text-green-400 text-sm font-medium">✓ {recipientFile.name}</p>
                    {recipientCount !== null && (
                      <p className="text-xs text-slate-400 mt-1">
                        <span className="text-white font-medium">{recipientCount.toLocaleString()}</span> email addresses detected
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <svg className="w-7 h-7 text-slate-600 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-slate-400">Drop CSV/TXT file here, or <span className="text-brand-400">browse</span></p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Emails are automatically extracted and deduplicated</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Scheduling Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Start Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full bg-dark-900 border border-slate-700/50 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Delay Between (ms)</label>
                <input
                  type="number"
                  value={form.delayBetween}
                  onChange={e => setForm(f => ({ ...f, delayBetween: parseInt(e.target.value) || 0 }))}
                  min={0}
                  className="w-full bg-dark-900 border border-slate-700/50 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Hourly Limit</label>
                <input
                  type="number"
                  value={form.hourlyLimit}
                  onChange={e => setForm(f => ({ ...f, hourlyLimit: parseInt(e.target.value) || 1 }))}
                  min={1}
                  className="w-full bg-dark-900 border border-slate-700/50 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/30">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-slate-400 hover:text-slate-200 py-2.5 px-5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-6 rounded-xl transition-all duration-200"
              >
                {submitting && <Spinner size="sm" />}
                {submitting ? 'Scheduling...' : 'Schedule Campaign'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
