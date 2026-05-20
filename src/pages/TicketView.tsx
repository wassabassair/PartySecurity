import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, TicketState } from '../lib/supabase';
import { DataMatrix } from '../components/DataMatrix';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Status =
  | { kind: 'loading' }
  | { kind: 'found'; ticket: TicketState }
  | { kind: 'notfound' };

export default function TicketView() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    const code = (id ?? '').trim();
    if (!UUID_RE.test(code)) {
      setStatus({ kind: 'notfound' });
      return;
    }
    let cancelled = false;
    supabase.rpc('lookup_ticket', { ticket_id: code }).then(({ data, error }) => {
      if (cancelled) return;
      const ticket = (data as TicketState[] | null)?.[0];
      if (error || !ticket) {
        setStatus({ kind: 'notfound' });
        return;
      }
      setStatus({ kind: 'found', ticket });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (status.kind === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold">Ticket not found</h1>
        <p className="text-slate-400 mt-2">This link is invalid or the ticket was removed.</p>
      </div>
    );
  }

  const { ticket } = status;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center space-y-1">
        <div className="text-sm uppercase tracking-widest text-slate-400">Your party ticket</div>
        <h1 className="text-2xl font-bold">{ticket.buyer_name}</h1>
      </div>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
        <DataMatrix value={ticket.id} scale={8} />
      </div>
      <p className="text-center text-slate-300 max-w-xs">
        Show this barcode at the entrance. Please don't share it — each code only works for one
        person.
      </p>
    </div>
  );
}
