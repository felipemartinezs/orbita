'use client';
import React, { useRef } from 'react';
import { PlanSourceType } from '@/types';

interface UploadScreenProps {
  onFileSelected: (file: File, sourceType: PlanSourceType) => void;
  onDemoMode: () => void;
}

export default function UploadScreen({ onFileSelected, onDemoMode }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const getSourceType = (file: File): PlanSourceType | null => {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();

    if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)) return 'image';
    return null;
  };

  const handleFile = (file: File) => {
    const sourceType = getSourceType(file);
    if (!sourceType) {
      window.alert('Selecciona un PDF o una imagen compatible');
      return;
    }
    onFileSelected(file, sourceType);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="upload-screen">
      <div className="upload-logo">
        <div className="logo-icon">📐</div>
        <h1 className="logo-title">Orbita</h1>
        <p className="logo-sub">Planos inteligentes para técnicos de campo</p>
      </div>

      {/* DEMO button — primary action for testing */}
      <button className="demo-big-btn" onClick={onDemoMode}>
        <span className="demo-btn-icon">🔵</span>
        <div className="demo-btn-text">
          <strong>Ver mi punto GPS ahora</strong>
          <span>Demo instantáneo — sin calibración</span>
        </div>
      </button>

      <div className="upload-divider">
        <span>o carga tu propio plano o captura</span>
      </div>

      <div
        className="upload-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-icon">📂</div>
        <p className="dropzone-label">Toca para cargar PDF o imagen</p>
        <p className="dropzone-hint">PDF, PNG o JPG</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,image/*"
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
      </div>

      <div className="upload-features">
        <Feature icon="📍" text="Punto GPS azul en tiempo real sobre el plano" />
        <Feature icon="📱" text="Optimizado para iPhone" />
        <Feature icon="💾" text="Calibración guardada automáticamente" />
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="feature-item">
      <span className="feature-icon">{icon}</span>
      <span className="feature-text">{text}</span>
    </div>
  );
}
