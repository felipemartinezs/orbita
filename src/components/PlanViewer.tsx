'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AffineTransform, CalibrationPoint, GpsPoint, PixelPoint, PlanSourceType } from '@/types';
import { gpsToPixel } from '@/lib/affine';

// Module-level singleton so the lib is only loaded once
let pdfjsLib: typeof import('pdfjs-dist') | null = null;
let workerConfigured = false;

interface PlanViewerProps {
  sourceUrl: string;
  sourceType: PlanSourceType;
  sourceFile?: File | null;
  calibrationPoints: CalibrationPoint[];
  transform: AffineTransform | null;
  gpsPosition: GpsPoint | null;
  gpsAccuracy: number | null;
  onCanvasTap?: (pixel: PixelPoint) => void;
  tapMode?: boolean;
  /** Called once PDF is rendered with (canvasW, canvasH, pdfScale) */
  onRendered?: (canvasW: number, canvasH: number, scale: number) => void;
}

export default function PlanViewer({
  sourceUrl,
  sourceType,
  sourceFile,
  calibrationPoints,
  transform,
  gpsPosition,
  gpsAccuracy,
  onCanvasTap,
  tapMode = false,
  onRendered,
}: PlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pan & pinch state (mutable refs — no re-render needed)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const animRef = useRef<number>(0);

  const shouldDisablePdfWorker = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isWebKit = /WebKit/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    return isAppleMobile && isWebKit;
  }, []);

  // ── Load plan source via ResizeObserver so we know container dims ──
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);

    const finalizeRender = (containerW: number, containerH: number, w: number, h: number, scale: number) => {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        overlay.width = w;
        overlay.height = h;
      }

      viewRef.current = {
        x: (containerW - w) / 2,
        y: (containerH - h) / 2,
        scale: 1,
      };
      applyTransform();
      setLoaded(true);
      onRendered?.(w, h, scale);
    };

    const renderPdf = async (containerW: number, containerH: number) => {
      try {
        if (!pdfjsLib) {
          pdfjsLib = await import('pdfjs-dist');
        }
        const disableWorker = shouldDisablePdfWorker();

        if (!disableWorker && !workerConfigured) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          workerConfigured = true;
        }

        const loadingSource = sourceFile
          ? {
              data: new Uint8Array(await sourceFile.arrayBuffer()),
              disableWorker,
              verbosity: 0,
            }
          : {
              url: sourceUrl,
              disableWorker,
              verbosity: 0,
            };

        const loadingTask = pdfjsLib.getDocument(loadingSource);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const naturalViewport = page.getViewport({ scale: 1 });

        // Scale to fit the container, maintaining aspect ratio
        const scaleX = containerW / naturalViewport.width;
        const scaleY = containerH / naturalViewport.height;
        const scale = Math.min(scaleX, scaleY) * 0.95;

        const viewport = page.getViewport({ scale });
        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        if (cancelled) return;

        await pdf.destroy();
        finalizeRender(containerW, containerH, w, h, scale);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(
            sourceFile
              ? `No se pudo abrir este PDF en Safari: ${msg}`
              : msg
          );
          console.error('PDF render error:', e);
        }
      }
    };

    const renderImage = (containerW: number, containerH: number) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (cancelled) return;

        const scaleX = containerW / img.naturalWidth;
        const scaleY = containerH / img.naturalHeight;
        const scale = Math.min(scaleX, scaleY) * 0.95;
        const w = Math.max(1, Math.floor(img.naturalWidth * scale));
        const h = Math.max(1, Math.floor(img.naturalHeight * scale));

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        finalizeRender(containerW, containerH, w, h, scale);
      };
      img.onerror = () => {
        if (!cancelled) {
          setError('No se pudo abrir esta imagen en Safari');
        }
      };
      img.src = sourceUrl;
    };

    // Use ResizeObserver to wait until the container has real dimensions
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 10 && height > 10) {
        observer.disconnect();
        if (sourceType === 'pdf') renderPdf(width, height);
        else renderImage(width, height);
      }
    });
    observer.observe(container);

    // Also try immediately if it already has size
    const rect = container.getBoundingClientRect();
    if (rect.width > 10 && rect.height > 10) {
      observer.disconnect();
      if (sourceType === 'pdf') renderPdf(rect.width, rect.height);
      else renderImage(rect.width, rect.height);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFile, sourceType, sourceUrl, shouldDisablePdfWorker]);

  // ── Draw overlay: blue dot + calibration dots ──────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calibration reference dots (orange numbered)
    calibrationPoints.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.pixel.x, pt.pixel.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), pt.pixel.x, pt.pixel.y);
    });

    // Blue GPS dot
    if (transform && gpsPosition) {
      const px = gpsToPixel(gpsPosition, transform);
      const ringRadius = gpsAccuracy ? Math.min(gpsAccuracy * 0.3, 100) : 28;

      // Accuracy ring
      ctx.beginPath();
      ctx.arc(px.x, px.y, ringRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(66, 133, 244, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(66,133,244,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Outer shadow
      const grad = ctx.createRadialGradient(px.x, px.y - 2, 0, px.x, px.y, 14);
      grad.addColorStop(0, '#6babf5');
      grad.addColorStop(1, '#1a6de0');
      ctx.beginPath();
      ctx.arc(px.x, px.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner white dot
      ctx.beginPath();
      ctx.arc(px.x, px.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }, [calibrationPoints, transform, gpsPosition, gpsAccuracy]);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(drawOverlay);
  }, [drawOverlay]);

  // ── CSS transform helper ───────────────────────────────────────────
  function applyTransform() {
    const wrapper = containerRef.current?.querySelector<HTMLDivElement>('.plan-wrapper');
    if (!wrapper) return;
    const { x, y, scale } = viewRef.current;
    wrapper.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    wrapper.style.transformOrigin = '0 0';
  }

  // ── Touch: pan + pinch ─────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (tapMode) return; // tap mode handled separately
    e.stopPropagation();
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist: Math.hypot(dx, dy),
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (tapMode) return;
    e.preventDefault();
    e.stopPropagation();
    if (!lastTouchRef.current) return;
    const v = viewRef.current;

    if (e.touches.length === 1) {
      v.x += e.touches[0].clientX - lastTouchRef.current.x;
      v.y += e.touches[0].clientY - lastTouchRef.current.y;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const ratio = newDist / (lastTouchRef.current.dist || newDist);
      const newScale = Math.min(Math.max(v.scale * ratio, 0.2), 10);
      v.x = midX - (midX - v.x) * (newScale / v.scale);
      v.y = midY - (midY - v.y) * (newScale / v.scale);
      v.scale = newScale;
      lastTouchRef.current = { x: midX, y: midY, dist: newDist };
    }
    applyTransform();
  }

  function onTouchEnd() {
    lastTouchRef.current = null;
  }

  // Mouse wheel zoom (desktop testing)
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const v = viewRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(v.scale * delta, 0.2), 10);
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    v.x = cx - (cx - v.x) * (newScale / v.scale);
    v.y = cy - (cy - v.y) * (newScale / v.scale);
    v.scale = newScale;
    applyTransform();
  }

  // ── Tap for calibration ────────────────────────────────────────────
  function onTap(e: React.MouseEvent | React.TouchEvent) {
    if (!tapMode || !onCanvasTap) return;
    const wrapper = containerRef.current?.querySelector<HTMLDivElement>('.plan-wrapper');
    if (!wrapper) return;
    const wrapRect = wrapper.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('changedTouches' in e) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    const v = viewRef.current;
    const x = (clientX - wrapRect.left) / v.scale;
    const y = (clientY - wrapRect.top) / v.scale;
    onCanvasTap({ x, y });
  }

  return (
    <div
      ref={containerRef}
      className="plan-container"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onClick={tapMode ? onTap : undefined}
    >
      {!loaded && !error && (
        <div className="plan-loading">
          <div className="plan-spinner" />
          <span>Cargando plano…</span>
        </div>
      )}
      {error && (
        <div className="plan-error">
          <span>⚠️ Error al cargar el archivo</span>
          <small>{error}</small>
        </div>
      )}
      <div className="plan-wrapper" style={{ display: loaded ? 'block' : 'none' }}>
        <canvas ref={pdfCanvasRef} className="plan-canvas" />
        <canvas
          ref={overlayCanvasRef}
          className="overlay-canvas"
          style={{ cursor: tapMode ? 'crosshair' : 'default' }}
          onTouchEnd={tapMode ? onTap : undefined}
        />
      </div>
    </div>
  );
}
