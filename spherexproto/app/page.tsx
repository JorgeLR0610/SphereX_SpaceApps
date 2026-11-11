'use client';

import React, { useEffect, useState } from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { Header } from '../components/Header';
import { ConceptHero } from '../components/ConceptHero';
import { TargetExplainer } from '../components/TargetExplainer';
import { FrameViewer } from '../components/FrameViewer';
import { ControlPanel } from '../components/ControlPanel';
import { SpectrumPanel } from '../components/SpectrumPanel';
import { SkyContext } from '../components/SkyContext';
import { MetadataPanel } from '../components/MetadataPanel';
import { EmbedModal } from '../components/EmbedModal';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';

export default function Home() {
  const { isEmbed } = useSpherexStore();

  const [isEmbedOpen, setIsEmbedOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Initialize store from URL query parameters on mount
  useEffect(() => {
    spherexStore.initFromUrl();
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        spherexStore.setPlaying(!spherexStore.getState().playing);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        spherexStore.nextEpoch();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        spherexStore.prevEpoch();
      } else if (e.key === 'd' || e.key === 'D') {
        const curr = spherexStore.getState().mode;
        spherexStore.setMode(curr === 'diff' ? 'normal' : 'diff');
      } else if (e.key === 's' || e.key === 'S') {
        const curr = spherexStore.getState().mode;
        spherexStore.setMode(curr === 'stack' ? 'normal' : 'stack');
      } else if (e.key === 'm' || e.key === 'M') {
        spherexStore.setDetective(!spherexStore.getState().detective);
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        spherexStore.toggleDetector(parseInt(e.key, 10));
      } else if (e.key === 'b' || e.key === 'B') {
        spherexStore.toggleBlinkMode();
      } else if (e.key === '?') {
        setIsHelpOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Standalone Embed Mode
  if (isEmbed) {
    return (
      <main className="w-screen h-screen flex flex-col bg-slate-950 p-2 overflow-hidden">
        <div className="flex-1 flex flex-col relative">
          <FrameViewer />
        </div>
      </main>
    );
  }

  // Full Observatory Experience
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* 1. Header with search, presets, share & embed */}
      <Header
        onOpenEmbed={() => setIsEmbedOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* Main Observatory Body */}
      <main className="flex-1 flex flex-col gap-4 p-4 max-w-[1600px] w-full mx-auto">
        {/* 1. Concept Hero: Explains the application in 3 seconds & 3 Exploration Tabs */}
        <section>
          <ConceptHero />
        </section>

        {/* 2. Target Explainer: Active Target scientific facts */}
        <section>
          <TargetExplainer />
        </section>

        {/* 3. Workspace: FrameViewer (with integrated timeline player) + Control Panel */}
        <section className="flex flex-col lg:flex-row gap-4 min-h-[500px]">
          <FrameViewer />
          <ControlPanel />
        </section>

        {/* 4. Lower Row: Sky Context Mini-map & 102-Band Spectrum on Click */}
        <section id="spectrum-section" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkyContext />
          <SpectrumPanel />
        </section>

        {/* 5. Bottom Metadata Bar */}
        <section>
          <MetadataPanel />
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 px-6 border-t border-slate-900 bg-slate-950/60 text-center text-xs text-slate-500 font-mono flex flex-wrap items-center justify-between gap-3">
        <div>
          SPHEREx Time Machine · Diseñado para la misión NASA SPHEREx (Caltech / JPL / IPAC)
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>Modo: Adaptador Mock Científico</span>
          <span>102 Canales Espectrales (0.75 – 5.0 µm)</span>
          <button
            onClick={() => setIsHelpOpen(true)}
            className="hover:text-cyan-400 underline underline-offset-2"
          >
            Guía de atajos (?)
          </button>
        </div>
      </footer>

      {/* Modals */}
      <EmbedModal isOpen={isEmbedOpen} onClose={() => setIsEmbedOpen(false)} />
      <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
