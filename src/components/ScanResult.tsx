type Variant = 'success' | 'error';

export function ScanResult({ variant, message }: { variant: Variant; message: string }) {
  const bg = variant === 'success' ? 'bg-green-600' : 'bg-red-600';
  return (
    <div className={`absolute inset-0 flex items-center justify-center ${bg} text-white text-3xl font-bold text-center px-8`}>
      {message}
    </div>
  );
}
