import type { TicketState } from '../lib/supabase';

type Props = {
  ticket: TicketState;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ScanConfirm({ ticket, busy, onConfirm, onCancel }: Props) {
  const isIn = ticket.is_in;
  const buttonBg = isIn ? 'bg-orange-500 active:bg-orange-600' : 'bg-green-600 active:bg-green-700';
  const buttonLabel = isIn ? 'LET OUT' : 'LET IN';
  const stateLabel = isIn ? 'currently INSIDE' : 'currently OUTSIDE';
  const stateColor = isIn ? 'text-orange-300' : 'text-green-300';

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-950">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-slate-400 uppercase tracking-widest text-sm mb-3">Ticket</div>
        <div className="text-4xl font-bold mb-6 break-words">{ticket.buyer_name}</div>
        <div className={`text-xl font-semibold ${stateColor}`}>{stateLabel}</div>
      </div>
      <div className="p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`w-full ${buttonBg} disabled:opacity-50 text-white text-2xl font-bold rounded-2xl py-6 shadow-lg`}
        >
          {busy ? '...' : buttonLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="w-full bg-slate-800 active:bg-slate-700 disabled:opacity-50 text-slate-200 text-lg rounded-2xl py-4"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
