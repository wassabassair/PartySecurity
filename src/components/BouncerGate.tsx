import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'partysecurity_bouncer_ok';

type Status = 'checking' | 'gated' | 'allowed';

export function BouncerGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        setStatus('allowed');
      } else {
        setStatus('gated');
      }
    } catch {
      setStatus('gated');
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('check_passcode', {
      passcode: passcode.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError('Network error — try again');
      return;
    }
    if (data === true) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // localStorage disabled — they will get prompted again next visit
      }
      setStatus('allowed');
      return;
    }
    setError('Wrong passcode');
    setPasscode('');
  };

  if (status === 'checking') {
    return <div className="fixed inset-0 bg-slate-950" />;
  }
  if (status === 'allowed') {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 space-y-5 shadow-xl"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">PartySecurity</h1>
          <p className="text-sm text-slate-400">Enter the bouncer passcode</p>
        </div>
        <input
          type="password"
          autoFocus
          required
          inputMode="text"
          autoComplete="off"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-sky-500 text-center tracking-widest"
        />
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        <button
          type="submit"
          disabled={busy || !passcode.trim()}
          className="w-full bg-sky-600 active:bg-sky-700 disabled:opacity-50 rounded-xl py-4 text-lg font-bold"
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
