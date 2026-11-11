'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  badge: string;
  icon: string;
}

interface LandingHeroProps {
  objects: Record<string, AstronomicalObject>;
  onSelect: (key: string) => void;
  onSearch: (query: string) => void;
  isSearching: boolean;
  searchMessage: string;
}

export function LandingHero({
  objects,
  onSelect,
  onSearch,
  isSearching,
  searchMessage,
}: LandingHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // Subtle animated cosmic background with stars and a single moving point
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    // Seed 40 static stars
    const stars = Array.from({ length: 45 }, (_, i) => ({
      x: ((i * 137.5) % 1) * 800,
      y: ((i * 269.3) % 1) * 600,
      r: 1 + ((i * 17) % 2.5),
      b: 0.3 + ((i * 31) % 0.7),
    }));

    const render = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;

      // Dark sky background
      ctx.fillStyle = '#0a0d1f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw faint static background stars
      stars.forEach((s) => {
        ctx.fillStyle = `rgba(190, 200, 255, ${s.b * 0.4})`;
        ctx.beginPath();
        ctx.arc((s.x / 800) * canvas.width, (s.y / 600) * canvas.height, s.r, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw single moving point crossing the screen (representing SPHEREx time travel)
      t = (t + 0.004) % 1.0;
      const mx = canvas.width * 0.25 + t * canvas.width * 0.5;
      const my = canvas.height * 0.35 + Math.sin(t * Math.PI) * 40;

      // Moving point glow
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 22);
      grad.addColorStop(0, 'rgba(255, 90, 126, 0.9)');
      grad.addColorStop(0.3, 'rgba(255, 90, 126, 0.4)');
      grad.addColorStop(1, 'rgba(255, 90, 126, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, 22, 0, 2 * Math.PI);
      ctx.fill();

      // Core point
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx, my, 2.8, 0, 2 * Math.PI);
      ctx.fill();

      // Faint orbital trail
      ctx.strokeStyle = 'rgba(255, 90, 126, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.25, canvas.height * 0.35);
      ctx.lineTo(canvas.width * 0.75, canvas.height * 0.35);
      ctx.stroke();
      ctx.setLineDash([]);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onSearch(searchInput.trim());
  };

  return (
    <div className="relative min-h-[92vh] flex flex-col items-center justify-center px-4 sm:px-8 py-12 overflow-hidden">
      {/* Background Animated Sky Canvas */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Main Hero Header */}
      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center">
        {/* Subtitle Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-[#141733]/90 border border-[#272a4f] text-[#ff5a7e] mb-4 shadow-lg backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-[#ff5a7e] animate-ping" />
          <span>Telescopio Espacial SPHEREx (NASA)</span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
          El cielo no está quieto.{' '}
          <span className="text-[#ff5a7e]">Mira cómo se mueve.</span>
        </h1>

        {/* Supporting sentence */}
        <p className="text-sm sm:text-base md:text-lg text-[#b9b5d6] mt-3 max-w-2xl leading-relaxed">
          Imágenes infrarrojas tomadas en cuatro fechas distintas. Las estrellas lejanas están congeladas, pero los asteroides y enanas marrones cercanas cruzan a toda velocidad.
        </p>

        {/* Entry Question */}
        <div className="mt-10 mb-4 flex items-center gap-2">
          <span className="text-sm sm:text-base font-bold text-white uppercase tracking-wider font-mono">
            ¿Qué quieres encontrar?
          </span>
        </div>

        {/* 5 Object Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 w-full text-left">
          {Object.entries(objects).map(([k, o]) => (
            <button
              key={k}
              onClick={() => onSelect(k)}
              className="group flex flex-col justify-between p-4 rounded-2xl bg-[#141733]/80 hover:bg-[#141733] border border-[#272a4f] hover:border-[#ff5a7e] transition-all hover:-translate-y-1 shadow-lg hover:shadow-2xl cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{o.icon}</span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#0a0d1f] text-[#ff5a7e] border border-[#272a4f]">
                    {o.badge}
                  </span>
                </div>
                <h3 className="font-extrabold text-base text-white group-hover:text-[#ff5a7e] transition-colors leading-snug">
                  {o.n}
                </h3>
                <p className="text-xs text-[#9a95b8] mt-1.5 leading-relaxed line-clamp-2">
                  {o.tag}
                </p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-[#272a4f]/60 flex items-center justify-between text-xs font-semibold text-[#f1eefb] group-hover:text-[#ff5a7e]">
                <span>Ver cómo se mueve</span>
                <span className="group-hover:translate-x-1 transition-transform">➔</span>
              </div>
            </button>
          ))}
        </div>

        {/* Small Search Bar underneath for power users */}
        <div className="mt-8 w-full max-w-md">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="O escribe otro objeto (ej. Barnard, Proxima, 133.79 -7.24)..."
              className="flex-1 px-4 py-2 rounded-full border border-[#272a4f] bg-[#141733]/90 text-xs sm:text-sm text-[#f1eefb] placeholder-[#9a95b8] focus:outline-none focus:border-[#ff5a7e]"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2 rounded-full bg-[#ff5a7e] hover:bg-[#e8365d] text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSearching ? '...' : 'Buscar'}
            </button>
          </form>

          {searchMessage && (
            <div className="text-[#ff5a7e] text-xs mt-2 text-center" role="status">
              {searchMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

