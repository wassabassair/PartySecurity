import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DataMatrix, DataMatrixHandle, downloadCanvasPng } from '../components/DataMatrix';

type TicketRow = {
  id: string;
  buyer_name: string;
  buyer_contact: string | null;
  is_in: boolean;
  last_change_at: string | null;
  created_at: string;
};

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return <div className="p-8 text-slate-300">Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }
  return <AdminDashboard email={session.user.email ?? ''} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 space-y-4 shadow-xl"
      >
        <h1 className="text-2xl font-bold">Admin login</h1>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-sky-500"
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-sky-600 active:bg-sky-700 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function AdminDashboard({ email }: { email: string }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewingTicket, setViewingTicket] = useState<TicketRow | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    setTickets((data ?? []) as TicketRow[]);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const channel = supabase
      .channel('tickets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          setTickets((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as TicketRow;
              if (prev.some((t) => t.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as TicketRow;
              return prev.map((t) => (t.id === row.id ? row : t));
            }
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id: string }).id;
              return prev.filter((t) => t.id !== id);
            }
            return prev;
          });
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as TicketRow;
            setViewingTicket((current) =>
              current && current.id === row.id ? row : current
            );
          }
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id;
            setViewingTicket((current) => (current?.id === id ? null : current));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (viewingTicket && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [viewingTicket]);

  const insideCount = tickets.filter((t) => t.is_in).length;
  const totalCount = tickets.length;
  const outsideCount = totalCount - insideCount;

  const filtered = tickets.filter((t) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      t.buyer_name.toLowerCase().includes(q) ||
      (t.buyer_contact ?? '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (t: TicketRow) => {
    if (!window.confirm(`Delete ticket for ${t.buyer_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('tickets').delete().eq('id', t.id);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    setTickets((prev) => prev.filter((x) => x.id !== t.id));
    setViewingTicket((current) => (current?.id === t.id ? null : current));
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PartySecurity admin</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="hidden sm:inline">{email}</span>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="bg-slate-800 active:bg-slate-700 rounded px-3 py-1.5"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold tabular-nums">{totalCount}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400 mt-1">Tickets</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-orange-300">{insideCount}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400 mt-1">Inside</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-slate-300">{outsideCount}</div>
          <div className="text-xs uppercase tracking-widest text-slate-400 mt-1">Outside</div>
        </div>
      </section>

      <CreateTicketForm
        onCreated={(t) => {
          setViewingTicket(t);
          fetchTickets();
        }}
      />

      {viewingTicket && (
        <div ref={panelRef}>
          <TicketBarcodePanel
            ticket={viewingTicket}
            onDismiss={() => setViewingTicket(null)}
            onDelete={() => handleDelete(viewingTicket)}
          />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, contact, or UUID"
            className="flex-1 bg-slate-900 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={fetchTickets}
            className="bg-slate-800 active:bg-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-slate-400">Loading tickets…</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500">No tickets yet.</div>
        ) : (
          <ul className="divide-y divide-slate-800 bg-slate-900 rounded-xl overflow-hidden">
            {filtered.map((t) => (
              <li key={t.id}>
                <div className="flex items-center gap-2 p-1">
                  <button
                    type="button"
                    onClick={() => setViewingTicket(t)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-800 active:bg-slate-800 text-left"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{t.buyer_name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {t.buyer_contact || <span className="italic">no contact</span>}
                      </div>
                      <div className="text-[10px] text-slate-600 truncate font-mono">{t.id}</div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded font-semibold shrink-0 ${
                        t.is_in
                          ? 'bg-orange-500/20 text-orange-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {t.is_in ? 'INSIDE' : 'OUTSIDE'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    aria-label={`Delete ${t.buyer_name}`}
                    className="shrink-0 text-slate-500 hover:text-red-400 active:text-red-500 px-3 py-2 text-lg"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateTicketForm({ onCreated }: { onCreated: (t: TicketRow) => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('tickets')
      .insert({ buyer_name: name.trim(), buyer_contact: contact.trim() || null })
      .select()
      .single();
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? 'Could not create ticket');
      return;
    }
    setName('');
    setContact('');
    onCreated(data as TicketRow);
  };

  return (
    <form onSubmit={onSubmit} className="bg-slate-900 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-slate-200">Create ticket</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          required
          placeholder="Buyer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-slate-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <input
          placeholder="Buyer contact (optional)"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="bg-slate-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="bg-sky-600 active:bg-sky-700 disabled:opacity-50 rounded-lg px-4 py-2 font-semibold"
      >
        {busy ? 'Creating…' : 'Create + generate barcode'}
      </button>
    </form>
  );
}

function TicketBarcodePanel({
  ticket,
  onDismiss,
  onDelete,
}: {
  ticket: TicketRow;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const matrixRef = useRef<DataMatrixHandle>(null);

  const fileName = () => {
    const safe = ticket.buyer_name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    return `ticket_${safe || 'guest'}_${ticket.id.slice(0, 8)}.png`;
  };

  const handleSendWhatsApp = () => {
    const digits = (ticket.buyer_contact ?? '').replace(/\D/g, '');
    let intl = '';
    if (digits.startsWith('972')) intl = digits;
    else if (digits.startsWith('0')) intl = '972' + digits.slice(1);
    else if (digits.length >= 9) intl = digits;

    const link = `${window.location.origin}/t/${ticket.id}`;
    const text =
      `היי ${ticket.buyer_name}, זה הכרטיס שלך למסיבת 67. ` +
      `מומלץ לצלם מסך ולשמור. לידיעתך, הכרטיס יעבוד רק פעם אחת. ${link}`;
    const waUrl = intl
      ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener');
  };

  const handleDownload = () => {
    const canvas = matrixRef.current?.getCanvas();
    if (!canvas) return;
    downloadCanvasPng(canvas, fileName());
  };

  const handleCopy = async () => {
    const canvas = matrixRef.current?.getCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch {
        alert('Copy not supported on this browser — use Download instead.');
      }
    }, 'image/png');
  };

  return (
    <div className="bg-slate-900 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-slate-400">Ticket</div>
          <div className="text-lg font-semibold">{ticket.buyer_name}</div>
          <div className="text-xs text-slate-400 font-mono break-all">{ticket.id}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 active:text-slate-200 text-sm shrink-0"
        >
          Dismiss
        </button>
      </div>
      <div className="flex justify-center">
        <DataMatrix ref={matrixRef} value={ticket.id} scale={8} />
      </div>
      <button
        type="button"
        onClick={handleSendWhatsApp}
        className="w-full bg-green-600 active:bg-green-700 rounded-lg py-3 font-semibold"
      >
        Send via WhatsApp
      </button>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 bg-sky-600 active:bg-sky-700 rounded-lg py-2 font-semibold"
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 bg-slate-800 active:bg-slate-700 rounded-lg py-2"
        >
          Copy image
        </button>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="w-full bg-red-900/40 hover:bg-red-900/60 active:bg-red-900/80 text-red-300 rounded-lg py-2 text-sm"
      >
        Delete ticket
      </button>
    </div>
  );
}
