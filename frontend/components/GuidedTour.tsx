'use client';

import React, { useState, useEffect, useCallback, useMemo, useId } from 'react';

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  targetName?: string;
  isVariable?: boolean;
}

interface StepInfo {
  title: string;
  badge: string;
  desc: string;
  targetId: string;
  position: 'canvas-center' | 'canvas-moving' | 'switch';
}

export function GuidedTour({
  isOpen,
  onClose,
  targetName = 'WISE 0855',
  isVariable = false,
}: GuidedTourProps) {
  const [step, setStep] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const titleId = useId();
  const descId = useId();

  const STEPS: StepInfo[] = useMemo(() => [
    {
      title: 'Estas son las estrellas. Casi no cambian.',
      badge: 'Paso 1 de 3: El fondo estelar',
      desc: 'La gran mayoría de los puntos de luz son estrellas fijas a cientos o miles de años luz. En el lapso de año y medio de la misión, parecen completamente inmóviles.',
      targetId: 'tour-canvas-area',
      position: 'canvas-center',
    },
    {
      title: isVariable
        ? `Esta es ${targetName}. Fíjate cómo cambia de brillo.`
        : 'Este círculo es lo que sí se mueve.',
      badge: 'Paso 2 de 3: El objeto detectado',
      desc: isVariable
        ? `A diferencia de las estrellas normales, ${targetName} es una estrella variable: su brillo aumenta y disminuye dramáticamente en el infrarrojo.`
        : `Es un objeto cercano a nuestro Sistema Solar. Entre cada una de las 4 fechas de SPHEREx, su posición en el cielo se desplaza visiblemente frente al fondo.`,
      targetId: 'tour-canvas-area',
      position: 'canvas-moving',
    },
    {
      title: 'Pulsa aquí para resaltarlo.',
      badge: 'Paso 3 de 3: Tu herramienta clave',
      desc: 'Al activar este interruptor, el visor apaga las estrellas fijas de fondo y dibuja la trayectoria o el parpadeo del objeto para que nunca lo pierdas de vista.',
      targetId: 'tour-highlight-switch',
      position: 'switch',
    },
  ], [isVariable, targetName]);

  // Update target bounding box for smooth positioning
  const updateTargetRect = useCallback(() => {
    if (!isOpen) return;
    const currentStep = STEPS[step];
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [isOpen, step, STEPS]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(updateTargetRect, 0);
      window.addEventListener('resize', updateTargetRect);
      window.addEventListener('scroll', updateTargetRect);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateTargetRect);
        window.removeEventListener('scroll', updateTargetRect);
      };
    }
  }, [isOpen, updateTargetRect]);

  const handleFinish = useCallback(() => {
    try {
      localStorage.setItem('spherex_tour_seen', 'true');
    } catch {
      // Storage access might be restricted in some iframe contexts
    }
    setStep(0);
    onClose();
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleFinish();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (step < STEPS.length - 1) {
          setStep((s) => s + 1);
        } else {
          handleFinish();
        }
      } else if (e.key === 'ArrowLeft') {
        if (step > 0) setStep((s) => s - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, handleFinish, STEPS.length]);

  if (!isOpen) return null;

  const current = STEPS[step];

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center p-4"
    >
      {/* Dimmed backdrop */}
      <div
        onClick={handleFinish}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity"
      />

      {/* Target Focus Ring Spotlight */}
      {targetRect && (
        <div
          style={{
            top: `${Math.max(8, targetRect.top - 6)}px`,
            left: `${Math.max(8, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
          className="fixed pointer-events-none rounded-2xl border-2 border-[#ff5a7e] shadow-[0_0_24px_rgba(255,90,126,0.6)] animate-pulse transition-all duration-300 z-50"
        />
      )}

      {/* Balloon Card */}
      <div
        className="relative z-50 max-w-md w-full bg-[#141733] border-2 border-[#ff5a7e] rounded-3xl p-6 shadow-2xl text-[#f1eefb] animate-pop"
        style={{
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(255, 90, 126, 0.25)',
        }}
      >
        {/* Header with step pill & close button */}
        <div className="flex items-center justify-between pb-3 border-b border-[#272a4f]">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#ff5a7e]/15 text-[#ff5a7e] border border-[#ff5a7e]/30">
            {current.badge}
          </span>
          <button
            onClick={handleFinish}
            title="Saltar recorrido"
            className="text-xs text-[#9a95b8] hover:text-white px-2 py-1 rounded-lg hover:bg-[#272a4f] transition-colors cursor-pointer"
          >
            Saltar ✕
          </button>
        </div>

        {/* Balloon Body */}
        <div className="my-4">
          <h2 id={titleId} className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
            {current.title}
          </h2>
          <p id={descId} className="text-sm text-[#b9b5d6] mt-2.5 leading-relaxed">
            {current.desc}
          </p>
        </div>

        {/* Progress dots & actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#272a4f]">
          {/* Step indicators */}
          <div className="flex gap-1.5 items-center">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === step
                    ? 'w-6 bg-[#ff5a7e]'
                    : i < step
                    ? 'bg-[#ff5a7e]/60'
                    : 'bg-[#272a4f]'
                }`}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#f1eefb] hover:bg-[#272a4f] transition-colors cursor-pointer"
              >
                Anterior
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-[#ff5a7e] hover:bg-[#e8365d] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <span>{step === STEPS.length - 1 ? '¡Comenzar!' : 'Siguiente'}</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

