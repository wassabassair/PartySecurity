import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react';
import bwipjs from 'bwip-js/browser';

export type DataMatrixHandle = {
  getCanvas: () => HTMLCanvasElement | null;
};

type Props = {
  value: string;
  scale?: number;
};

export const DataMatrix = forwardRef<DataMatrixHandle, Props>(function DataMatrix(
  { value, scale = 6 },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: 'datamatrix',
        text: value,
        scale,
        paddingwidth: 8,
        paddingheight: 8,
        backgroundcolor: 'FFFFFF',
      });
    } catch (err) {
      console.error('Data Matrix render failed', err);
    }
  }, [value, scale]);

  return <canvas ref={canvasRef} className="bg-white rounded" />;
});

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
