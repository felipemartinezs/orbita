'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AffineTransform, CalibrationPoint, GpsPoint, PixelPoint, PlanSourceType } from '@/types';
import { gpsToPixel } from '@/lib/affine';

// Module-level singleton so the lib is only loaded once
let pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;
let workerConfigured = false;
const MAX_PDF_RENDER_PIXELS = 14_000_000;
const CONTENT_THRESHOLD = 247;

interface CropRatios {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  const surfaceRef = useRef({ cssWidth: 0, cssHeight: 0, resolutionFactor: 1 });

  // Pan & pinch state (mutable refs — no re-render needed)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const animRef = useRef<number>(0);

  const getResolutionFactor = useCallback(() => {
    if (typeof window === 'undefined') return 2;
    return Math.min(Math.max(window.devicePixelRatio || 1, 1) * 1.6, 4);
  }, []);

  const fitScale = useCallback((containerW: number, containerH: number, sourceW: number, sourceH: number) => {
    return Math.min(containerW / sourceW, containerH / sourceH) * 0.95;
  }, []);

  const clampRenderScale = useCallback((sourceW: number, sourceH: number, targetScale: number) => {
    const pixels = sourceW * sourceH * targetScale * targetScale;
    if (pixels <= MAX_PDF_RENDER_PIXELS) return targetScale;
    return targetScale * Math.sqrt(MAX_PDF_RENDER_PIXELS / pixels);
  }, []);

  const detectContentCrop = useCallback((sourceCanvas: HTMLCanvasElement): CropRatios => {
    const sampleMaxSide = 480;
    const sampleScale = Math.min(1, sampleMaxSide / Math.max(sourceCanvas.width, sourceCanvas.height));
    const sampleW = Math.max(1, Math.floor(sourceCanvas.width * sampleScale));
    const sampleH = Math.max(1, Math.floor(sourceCanvas.height * sampleScale));
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleW;
    sampleCanvas.height = sampleH;

    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    sampleCtx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH);
    const { data } = sampleCtx.getImageData(0, 0, sampleW, sampleH);

    let minX = sampleW;
    let minY = sampleH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sampleH; y += 1) {
      for (let x = 0; x < sampleW; x += 1) {
        const idx = (y * sampleW + x) * 4;
        const alpha = data[idx + 3];
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const isContent = alpha > 12 && (r < CONTENT_THRESHOLD || g < CONTENT_THRESHOLD || b < CONTENT_THRESHOLD);

        if (isContent) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    const padX = Math.max(4, Math.floor(sampleW * 0.025));
    const padY = Math.max(4, Math.floor(sampleH * 0.025));
    const cropped = {
      x: Math.max(0, minX - padX),
      y: Math.max(0, minY - padY),
      width: Math.min(sampleW, maxX + padX) - Math.max(0, minX - padX),
      height: Math.min(sampleH, maxY + padY) - Math.max(0, minY - padY),
    };

    const widthRatio = Math.min(1, cropped.width / sampleW);
    const heightRatio = Math.min(1, cropped.height / sampleH);

    if (widthRatio > 0.96 && heightRatio > 0.96) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    return {
      x: cropped.x / sampleW,
      y: cropped.y / sampleH,
      width: widthRatio,
      height: heightRatio,
    };
  }, []);

  // ── Load plan source via ResizeObserver so we know container dims ──
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);

    const finalizeRender = (
      containerW: number,
      containerH: number,
      cssWidth: number,
      cssHeight: number,
      scale: number,
      resolutionFactor: number,
    ) => {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        overlay.width = Math.max(1, Math.floor(cssWidth * resolutionFactor));
        overlay.height = Math.max(1, Math.floor(cssHeight * resolutionFactor));
        overlay.style.width = `${cssWidth}px`;
        overlay.style.height = `${cssHeight}px`;
      }

      surfaceRef.current = { cssWidth, cssHeight, resolutionFactor };

      viewRef.current = {
        x: (containerW - cssWidth) / 2,
        y: (containerH - cssHeight) / 2,
        scale: 1,
      };
      applyTransform();
      setLoaded(true);
      onRendered?.(cssWidth, cssHeight, scale);
    };

    const renderIntoCanvas = async (
      page: Awaited<ReturnType<NonNullable<typeof pdfjsLib>['getDocument']>> extends never ? never : Awaited<ReturnType<any>>,
      pageScale: number,
    ) => {
      const viewport = page.getViewport({ scale: pageScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo crear el canvas del plano');
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      return { canvas, viewport };
    };

    const renderPdf = async (containerW: number, containerH: number) => {
      try {
        if (!pdfjsLib) {
          pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        }
        if (!workerConfigured) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          workerConfigured = true;
        }

        const loadingSource = sourceFile
          ? {
              data: new Uint8Array(await sourceFile.arrayBuffer()),
              verbosity: 0,
            }
          : {
              url: sourceUrl,
              verbosity: 0,
            };

        const loadingTask = pdfjsLib.getDocument(loadingSource);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const naturalViewport = page.getViewport({ scale: 1 });
        const baseScale = fitScale(containerW, containerH, naturalViewport.width, naturalViewport.height);
        const analysisScale = clampRenderScale(
          naturalViewport.width,
          naturalViewport.height,
          baseScale * Math.min(window.devicePixelRatio || 1, 2),
        );
        const { canvas: analysisCanvas } = await renderIntoCanvas(page, analysisScale);
        if (cancelled) return;

        const crop = detectContentCrop(analysisCanvas);
        const fullCssWidth = naturalViewport.width * baseScale;
        const fullCssHeight = naturalViewport.height * baseScale;
        const cropCssWidth = fullCssWidth * crop.width;
        const cropCssHeight = fullCssHeight * crop.height;
        const cropBoost = Math.max(1, Math.min(containerW / cropCssWidth, containerH / cropCssHeight) * 0.98);
        const finalLogicalScale = baseScale * cropBoost;
        const resolutionFactor = getResolutionFactor();
        const finalRenderScale = clampRenderScale(
          naturalViewport.width,
          naturalViewport.height,
          finalLogicalScale * resolutionFactor,
        );
        const actualResolution = finalRenderScale / finalLogicalScale;
        const { canvas: renderedCanvas } = await renderIntoCanvas(page, finalRenderScale);
        if (cancelled) return;

        const cropX = Math.floor(renderedCanvas.width * crop.x);
        const cropY = Math.floor(renderedCanvas.height * crop.y);
        const cropW = Math.max(1, Math.floor(renderedCanvas.width * crop.width));
        const cropH = Math.max(1, Math.floor(renderedCanvas.height * crop.height));
        const cssWidth = cropW / actualResolution;
        const cssHeight = cropH / actualResolution;

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        canvas.width = cropW;
        canvas.height = cropH;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, cropW, cropH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(renderedCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        if (cancelled) return;

        await pdf.destroy();
        finalizeRender(containerW, containerH, cssWidth, cssHeight, finalLogicalScale, actualResolution);
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

        const scale = fitScale(containerW, containerH, img.naturalWidth, img.naturalHeight);
        const resolutionFactor = getResolutionFactor();
        const w = Math.max(1, Math.floor(img.naturalWidth * scale * resolutionFactor));
        const h = Math.max(1, Math.floor(img.naturalHeight * scale * resolutionFactor));
        const cssWidth = w / resolutionFactor;
        const cssHeight = h / resolutionFactor;

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        finalizeRender(containerW, containerH, cssWidth, cssHeight, scale, resolutionFactor);
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
  }, [sourceFile, sourceType, sourceUrl]);

  // ── Draw overlay: blue dot + calibration dots ──────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { resolutionFactor } = surfaceRef.current;
    const zoom = Math.max(viewRef.current.scale, 0.2);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(resolutionFactor, 0, 0, resolutionFactor, 0, 0);

    const pinRadius = 11 / zoom;
    const pinInnerRadius = 3.8 / zoom;
    const accuracyScreenRadius = Math.min(18, 5 + (gpsAccuracy ?? 5) * 0.7);
    const accuracyRadius = accuracyScreenRadius / zoom;
    const markerRadius = 10 / zoom;
    const markerStroke = Math.max(1, 1.8 / zoom);
    const labelSize = Math.max(9, 11 / zoom);

    // Calibration reference dots (orange numbered)
    calibrationPoints.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.pixel.x, pt.pixel.y, markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = markerStroke;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${labelSize}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), pt.pixel.x, pt.pixel.y);
    });

    // Blue GPS dot
    if (transform && gpsPosition) {
      const px = gpsToPixel(gpsPosition, transform);

      // Accuracy ring
      ctx.beginPath();
      ctx.arc(px.x, px.y, accuracyRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(66, 133, 244, 0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(66,133,244,0.22)';
      ctx.lineWidth = Math.max(0.8, 1 / zoom);
      ctx.stroke();

      // Blue dot
      const grad = ctx.createRadialGradient(px.x, px.y, pinInnerRadius, px.x, px.y, pinRadius);
      grad.addColorStop(0, 'rgba(96, 167, 255, 0.92)');
      grad.addColorStop(1, 'rgba(33, 105, 225, 0.86)');
      ctx.beginPath();
      ctx.arc(px.x, px.y, pinRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = Math.max(1.2, 2 / zoom);
      ctx.stroke();

      // Inner white dot
      ctx.beginPath();
      ctx.arc(px.x, px.y, pinInnerRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
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
