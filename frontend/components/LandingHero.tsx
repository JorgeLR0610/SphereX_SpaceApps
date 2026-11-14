'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Locale, DICTIONARY } from '../lib/i18n';

interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  badge: string;
  icon: string;
  pm: [number, number];
  f: [string, string][];
}

interface LandingHeroProps {
  objects: Record<string, AstronomicalObject>;
  onSelect: (key: string) => void;
  onSearch: (query: string) => void;
  onOpenConeSearch?: () => void;
  isSearching: boolean;
  searchMessage: string;
  locale?: Locale;
  onOpenObservatory?: () => void;
}

/** Mini canvas de 52×52 que se anima en un bucle de 2 fotogramas SOLO al pasar el ratón */
function MiniCanvas({
  objKey,
  pm,
  type,
  isHovered,
}: {
  objKey: string;
  pm: [number, number];
  type: 'mov' | 'pair' | 'var';
  isHovered: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 52;
    const H = 52;
    const isDark =
      !document.documentElement.classList.contains('theme-light') &&
      document.documentElement.getAttribute('data-theme') !== 'light' &&
      !window.matchMedia('(prefers-color-scheme: light)').matches;

    // Semilla pseudo-aleatoria fija y determinista para las estrellas de fondo
    const seed = objKey.charCodeAt(0) * 31 + objKey.length * 17;
    const rng = (s: number) => {
      let x = s;
      return () => {
        x = (x * 1664525 + 1013904223) & 0xffffffff;
        return (x >>> 0) / 0xffffffff;
      };
    };
    const r = rng(seed);
    const bgStars = Array.from({ length: 7 }, () => ({
      x: r() * (W - 8) + 4,
      y: r() * (H - 8) + 4,
      b: 0.25 + r() * 0.45,
    }));

    const renderFrame = (f: number) => {
      // Fondo de placa fotográfica (sin gradientes artificiales)
      ctx.fillStyle = isDark ? '#0c0d12' : '#f7f6f3';
      ctx.fillRect(0, 0, W, H);

      // Estrellas de fondo fijas (puntos discretos de 1px)
      bgStars.forEach((s) => {
        ctx.fillStyle = isDark
          ? `rgba(210, 215, 230, ${s.b * 0.6})`
          : `rgba(40, 42, 55, ${s.b * 0.55})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Objeto central
      const cx = W / 2;
      const cy = H / 2;
      const scale = 7;

      if (type === 'var') {
        // Objeto variable: cambia de brillo entre las dos épocas
        const brightness = f === 0 ? 0.95 : 0.35;
        ctx.fillStyle = isDark
          ? `rgba(255, 180, 150, ${brightness})`
          : `rgba(217, 78, 31, ${brightness})`;
        ctx.beginPath();
        ctx.arc(cx, cy, f === 0 ? 2.2 : 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Objeto en movimiento o par binario
        const dx = pm[0] * scale * (f === 0 ? -0.5 : 0.5);
        const dy = pm[1] * scale * (f === 0 ? -0.5 : 0.5);

        if (type === 'pair') {
          ctx.fillStyle = isDark ? '#ff6b35' : '#d94e1f';
          ctx.beginPath();
          ctx.arc(cx + dx - 4, cy + dy - 2, 1.4, 0, Math.PI * 2);
          ctx.arc(cx + dx + 4, cy + dy + 2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = isDark ? '#ff6b35' : '#d94e1f';
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Renderiza el fotograma 0 inmediatamente
    renderFrame(0);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!isHovered || prefersReducedMotion) {
      return;
    }

    // Bucle de alternancia de 2 fotogramas SOLO durante el hover
    let frame = 0;
    let lastSwitch = performance.now();
    let animId: number;
    const INTERVAL = 500; // ms entre fotogramas

    const loop = (now: number) => {
      if (now - lastSwitch >= INTERVAL) {
        frame = 1 - frame;
        lastSwitch = now;
        renderFrame(frame);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [objKey, pm, type, isHovered]);

  return (
    <canvas
      ref={canvasRef}
      width={52}
      height={52}
      className="sky-canvas"
      style={{
        width: 52,
        height: 52,
        display: 'block',
        imageRendering: 'pixelated',
      }}
      aria-hidden="true"
    />
  );
}

/** Fila individual del índice para gestionar el estado de hover de su miniatura */
function ObjectRow({
  objKey,
  obj,
  onSelect,
  t,
}: {
  objKey: string;
  obj: AstronomicalObject;
  onSelect: (k: string) => void;
  t: typeof DICTIONARY.es;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Extraer el valor de velocidad y verificar si es un objeto en movimiento
  const f = obj.f.find(
    ([k]) => k === 'Se mueve' || k === 'Movimiento' || k === 'Ciclo' || k === 'Cambia'
  );
  const mv = f ? f[1] : '';
  const isMoving = obj.type === 'mov' || obj.type === 'pair';

  // Solo tres valores en texto plano: 'se mueve', 'cambia de brillo', 'pareja'
  const typeText =
    obj.type === 'mov'
      ? (t.typeMov || 'se mueve')
      : obj.type === 'var'
        ? (t.typeVar || 'cambia de brillo')
        : (t.typePair || 'pareja');

  return (
    <button
      onClick={() => onSelect(objKey)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="obj-row"
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
      }}
      aria-label={`Ver animación de ${obj.n}: ${obj.tag}`}
    >
      {/* Miniatura pixelada animada SOLO al pasar el ratón */}
      <div className="obj-mini-canvas">
        <MiniCanvas objKey={objKey} pm={obj.pm} type={obj.type} isHovered={isHovered} />
      </div>

      {/* Nombre, descripción y etiqueta de texto plano */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            fontWeight: 400,
            lineHeight: 1.25,
            marginBottom: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {obj.n}
        </div>
        <div
          style={{
            color: 'var(--mute)',
            fontSize: 'var(--text-caption)',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 3,
          }}
        >
          {obj.tag}
        </div>
        {/* Etiqueta de texto plano: sin caja de color ni bordes */}
        <span className="type-tag">{typeText}</span>
      </div>

      {/* Velocidad: color de alerta SOLO si se mueve; si no, color de texto atenuado */}
      <div>
        {isMoving && mv ? (
          <span className="pm-value fast tabular">{mv}</span>
        ) : (
          <span className="pm-value tabular" style={{ color: 'var(--mute)' }}>
            —
          </span>
        )}
      </div>
    </button>
  );
}

export function LandingHero({
  objects,
  onSelect,
  onSearch,
  onOpenConeSearch,
  searchMessage,
  locale = 'es',
}: LandingHeroProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const t = DICTIONARY[locale] || DICTIONARY.es;

  /* ---- Fondo de cielo: bucle sutil y nítido de fotogramas (comparador de parpadeo) ---- */
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Generador pseudo-aleatorio determinista para distribución estelar realista
    const rng = (s: number) => {
      let x = s;
      return () => {
        x = (x * 1664525 + 1013904223) & 0xffffffff;
        return (x >>> 0) / 0xffffffff;
      };
    };
    const r = rng(19300218); // Fecha histórica del descubrimiento de Plutón (18 Feb 1930)

    // Catálogo estelar de fondo (210 estrellas con magnitudes y perfiles PSF auténticos)
    const stars = Array.from({ length: 210 }, (_, i) => {
      const isBright = i < 12;
      const isMedium = i >= 12 && i < 55;
      return {
        xNorm: r(),
        yNorm: r(),
        radius: isBright ? 2.4 + r() * 1.4 : isMedium ? 1.4 + r() * 0.7 : 0.8 + r() * 0.45,
        flux: isBright ? 0.88 + r() * 0.12 : isMedium ? 0.60 + r() * 0.35 : 0.30 + r() * 0.45,
        colorDark: isBright
          ? r() > 0.5 ? '#ffd4a3' : '#c8d8ff'
          : isMedium ? '#f0f3fa' : '#cad2e0',
        colorLight: isBright ? '#10121a' : isMedium ? '#2e303d' : '#525463',
        hasHalo: isBright,
      };
    });

    // Objetos en movimiento del comparador de parpadeo (detrás del titular)
    // Objeto principal: análogo de WISE 0855 / Plutón con alto desplazamiento
    const target1 = {
      x0Norm: 0.38,
      y0Norm: 0.22,
      dx: 24,
      dy: -8,
    };
    // Objeto secundario: análogo de asteroide tenue cruzando en el cuadrante superior derecho
    const target2 = {
      x0Norm: 0.72,
      y0Norm: 0.17,
      dx: -16,
      dy: 10,
    };

    let epoch = 0;
    let lastSwitch = performance.now();
    let animId: number;

    const resize = () => {
      if (!canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resize();

    const render = (now: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const isDark =
        !document.documentElement.classList.contains('theme-light') &&
        document.documentElement.getAttribute('data-theme') !== 'light' &&
        !window.matchMedia('(prefers-color-scheme: light)').matches;

      // 1. Fondo con gradiente cósmico / placa de observatorio (evita negro plano artificial)
      if (isDark) {
        const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.3, 40, W * 0.5, H * 0.5, W * 0.75);
        bgGrad.addColorStop(0, '#131520');
        bgGrad.addColorStop(1, '#090a0e');
        ctx.fillStyle = bgGrad;
      } else {
        const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.3, 40, W * 0.5, H * 0.5, W * 0.75);
        bgGrad.addColorStop(0, '#f6f5f1');
        bgGrad.addColorStop(1, '#eae7e0');
        ctx.fillStyle = bgGrad;
      }
      ctx.fillRect(0, 0, W, H);

      // 2. Estrellas de campo fijas con PSF y brillo notable
      stars.forEach((s) => {
        const sx = s.xNorm * W;
        const sy = s.yNorm * H;

        // Halo suave solo para las pocas estrellas más brillantes
        if (s.hasHalo) {
          const haloR = s.radius * 3.8;
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
          if (isDark) {
            halo.addColorStop(0, 'rgba(200, 220, 255, 0.22)');
            halo.addColorStop(0.5, 'rgba(200, 220, 255, 0.05)');
            halo.addColorStop(1, 'rgba(200, 220, 255, 0)');
          } else {
            halo.addColorStop(0, 'rgba(20, 22, 35, 0.18)');
            halo.addColorStop(0.5, 'rgba(20, 22, 35, 0.04)');
            halo.addColorStop(1, 'rgba(20, 22, 35, 0)');
          }
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Núcleo estelar
        ctx.fillStyle = isDark ? s.colorDark : s.colorLight;
        ctx.globalAlpha = s.flux;
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // 3. Alternancia periódica de fotogramas (cadencia de 950 ms del comparador)
      if (!noMotion) {
        if (now - lastSwitch > 950) {
          epoch = 1 - epoch;
          lastSwitch = now;
        }
      }

      // 4. Objetos móviles que alternan de posición entre Época 1 y Época 2
      // Objeto 1: análogo de WISE 0855 (naranja astrométrico detrás del titular)
      const ox1 = W * target1.x0Norm + (epoch === 1 ? target1.dx : 0);
      const oy1 = H * target1.y0Norm + (epoch === 1 ? target1.dy : 0);

      // Halo tenue del objetivo móvil
      const tHalo1 = ctx.createRadialGradient(ox1, oy1, 0, ox1, oy1, 14);
      tHalo1.addColorStop(0, isDark ? 'rgba(255, 107, 53, 0.45)' : 'rgba(217, 78, 31, 0.38)');
      tHalo1.addColorStop(1, isDark ? 'rgba(255, 107, 53, 0)' : 'rgba(217, 78, 31, 0)');
      ctx.fillStyle = tHalo1;
      ctx.beginPath();
      ctx.arc(ox1, oy1, 14, 0, Math.PI * 2);
      ctx.fill();

      // Núcleo del objetivo móvil
      ctx.fillStyle = isDark ? '#ff6b35' : '#d94e1f';
      ctx.beginPath();
      ctx.arc(ox1, oy1, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Objeto 2: asteroide secundario tenue
      const ox2 = W * target2.x0Norm + (epoch === 1 ? target2.dx : 0);
      const oy2 = H * target2.y0Norm + (epoch === 1 ? target2.dy : 0);

      ctx.fillStyle = isDark ? 'rgba(255, 211, 79, 0.85)' : 'rgba(180, 110, 0, 0.85)';
      ctx.beginPath();
      ctx.arc(ox2, oy2, 1.6, 0, Math.PI * 2);
      ctx.fill();

      if (!noMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);

    const obs = new ResizeObserver(() => {
      resize();
      render(performance.now());
    });
    if (canvas.parentElement) obs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onSearch(searchInput.trim());
  };

  const entries = Object.entries(objects);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem 2rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Fondo de cielo astronómico real/simulado */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        <canvas
          ref={bgCanvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        />
      </div>

      {/* Contenedor central */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 680,
          boxSizing: 'border-box',
        }}
      >
        {/* Titular serif protagonista */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-display)',
            color: 'var(--ink)',
            lineHeight: 1.12,
            margin: '0 0 0.5rem',
            textAlign: 'center',
            fontWeight: 400,
            overflowWrap: 'break-word',
          }}
        >
          {t.heroTitle1 || 'El cielo no está quieto.'}
          <br />
          {t.heroTitle2 || 'Mira cómo se mueve.'}
        </h1>

        {/* Pie de figura pequeño bajo el titular */}
        <p
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--mute)',
            textAlign: 'center',
            margin: '0 0 1.25rem',
            lineHeight: 1.4,
          }}
        >
          Fig. 1 — {t.motto || 'Así se descubrió Plutón: alternando dos fotos del mismo cielo.'}
        </p>

        {/* Texto de contexto */}
        <p
          style={{
            color: 'var(--mute)',
            fontSize: 'var(--text-body)',
            textAlign: 'center',
            maxWidth: 580,
            margin: '0 auto 2.25rem',
            lineHeight: 1.5,
          }}
        >
          {t.heroDesc}
        </p>

        {/* ===== ÍNDICE DE OBJETOS ===== */}
        <section
          aria-label="Objetos de ejemplo"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg, 8px)',
            padding: '0.25rem 0.5rem',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Cabecera del índice */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr auto',
              gap: '0.75rem',
              padding: '0.45rem 0.5rem',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)' }}></span>
            <span
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--mute)',
                fontWeight: 600,
              }}
            >
              {t.heroTableObject || 'Objeto'}
            </span>
            <span
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--mute)',
                textAlign: 'right',
                fontWeight: 600,
              }}
            >
              {t.heroTableSpeed || 'Velocidad'}
            </span>
          </div>

          {/* Filas de objetos */}
          {entries.map(([k, o]) => (
            <ObjectRow key={k} objKey={k} obj={o} onSelect={onSelect} t={t} />
          ))}
        </section>

        {/* ===== BUSCADOR Y EXPLORAR POR RADIO EN UNA FILA DISCRETA ===== */}
        <div className="search-explore-row">
          {/* Campo de búsqueda sin botón rosa (Enter para buscar) */}
          <form
            onSubmit={handleSubmit}
            style={{ flex: 1, minWidth: 0 }}
            aria-label="Buscar objeto astronómico"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                t.searchPlaceholder ||
                'Escribe un objeto o coordenadas (ej. WISE 0855, 133.79 −7.24)…'
              }
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--line)',
                background: 'var(--panel)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--line)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
            />
          </form>

          {/* Enlace de texto Explorar por radio */}
          {onOpenConeSearch && (
            <button
              type="button"
              onClick={onOpenConeSearch}
              className="explore-link"
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 4px',
                color: 'var(--mute)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                fontSize: 'var(--text-body)',
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
            >
              {t.exploreConeBtn || 'Explorar por radio'}
            </button>
          )}
        </div>

        {/* Mensaje de estado / error de búsqueda */}
        {searchMessage && (
          <p
            role="status"
            style={{
              color: 'var(--alert)',
              fontSize: 'var(--text-caption)',
              marginTop: 10,
              textAlign: 'center',
            }}
          >
            {searchMessage}
          </p>
        )}
      </div>
    </div>
  );
}
