import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { supabase, TicketState } from '../lib/supabase';
import { ScanConfirm } from '../components/ScanConfirm';
import { ScanResult } from '../components/ScanResult';

type Mode =
  | { kind: 'scanning' }
  | { kind: 'confirm'; ticket: TicketState }
  | { kind: 'flash'; variant: 'success' | 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'scanning' });
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const handleDecoded = useCallback(async (text: string) => {
    if (modeRef.current.kind !== 'scanning') return;
    stopCamera();

    if (!UUID_RE.test(text.trim())) {
      setMode({ kind: 'flash', variant: 'error', message: 'UNKNOWN CODE' });
      return;
    }

    const { data, error } = await supabase.rpc('lookup_ticket', { ticket_id: text.trim() });
    if (error) {
      setMode({ kind: 'flash', variant: 'error', message: 'NETWORK ERROR' });
      return;
    }
    const ticket = (data as TicketState[] | null)?.[0];
    if (!ticket) {
      setMode({ kind: 'flash', variant: 'error', message: 'UNKNOWN CODE' });
      return;
    }
    setMode({ kind: 'confirm', ticket });
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!videoRef.current) return;
    try {
      if (!readerRef.current) readerRef.current = buildReader();
      const controls = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) handleDecoded(result.getText());
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not access camera';
      setCameraError(msg);
    }
  }, [handleDecoded]);

  useEffect(() => {
    if (mode.kind === 'scanning') {
      startCamera();
    }
    return stopCamera;
  }, [mode.kind, startCamera, stopCamera]);

  useEffect(() => {
    if (mode.kind !== 'flash') return;
    const t = setTimeout(() => setMode({ kind: 'scanning' }), 1500);
    return () => clearTimeout(t);
  }, [mode]);

  const handleConfirm = useCallback(async () => {
    if (mode.kind !== 'confirm') return;
    setBusy(true);
    const ticket = mode.ticket;
    const { data, error } = await supabase.rpc('toggle_ticket', {
      ticket_id: ticket.id,
      expected_state: ticket.is_in,
    });
    setBusy(false);
    if (error) {
      setMode({ kind: 'flash', variant: 'error', message: 'NETWORK ERROR' });
      return;
    }
    const updated = (data as TicketState[] | null)?.[0];
    if (!updated) {
      const fresh = await supabase.rpc('lookup_ticket', { ticket_id: ticket.id });
      const t = (fresh.data as TicketState[] | null)?.[0];
      if (t) {
        setMode({ kind: 'confirm', ticket: t });
      } else {
        setMode({ kind: 'flash', variant: 'error', message: 'STATE CHANGED' });
      }
      return;
    }
    const msg = updated.is_in ? `IN — ${updated.buyer_name}` : `OUT — ${updated.buyer_name}`;
    setMode({ kind: 'flash', variant: 'success', message: msg });
  }, [mode]);

  const handleCancel = useCallback(() => {
    setMode({ kind: 'scanning' });
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 border-2 border-white/70 rounded-2xl" />
      </div>
      <div className="absolute top-0 left-0 right-0 p-4 text-center text-white/80 text-sm pointer-events-none pt-[max(1rem,env(safe-area-inset-top))]">
        Point camera at the ticket barcode
      </div>

      {cameraError && (
        <div className="absolute inset-x-0 bottom-0 p-6 bg-red-700 text-white text-center">
          Camera error: {cameraError}
        </div>
      )}

      {mode.kind === 'confirm' && (
        <ScanConfirm
          ticket={mode.ticket}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {mode.kind === 'flash' && (
        <ScanResult variant={mode.variant} message={mode.message} />
      )}
    </div>
  );
}
