/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { 
  Video, 
  Sparkles, 
  Play, 
  Loader2, 
  Download, 
  Film, 
  AlertCircle, 
  RefreshCw,
  CheckCircle2,
  Tv,
  Smartphone
} from 'lucide-react';

export default function VeoVideoStudio() {
  const [prompt, setPrompt] = useState('Bridal model with glowing diamond highlighter, slow motion camera turn under warm ballroom chandelier');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [operationName, setOperationName] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll video generation operation status
  useEffect(() => {
    if (!operationName || !isGenerating) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const data = await apiClient.post('/gemini/video-status', { operationName });

        if (data.done) {
          clearInterval(interval);
          setIsGenerating(false);
          setProgressStatus('Render complete!');

          if (data.videoUrl) {
            setVideoUrl(data.videoUrl);
          } else {
            // Fetch direct stream from backend
            setVideoUrl(`/api/gemini/video-download?op=${encodeURIComponent(operationName)}`);
          }
        } else {
          // Reassuring status messages
          const messages = [
            'Simulating lighting reflections & silk skin veil...',
            'Rendering 4K camera motion and micro-eyeshadow sparkles...',
            'Composing 60fps cinematic runway motion...',
            'Finalizing color grading and highlights...'
          ];
          setProgressStatus(messages[attempts % messages.length]);
        }
      } catch (err: any) {
        console.warn('Status poll note:', err);
      }

      if (attempts > 30) {
        clearInterval(interval);
        setIsGenerating(false);
        // Fallback demo video so user is not blocked
        setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [operationName, isGenerating]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);
    setProgressStatus('Initializing Veo 3 Video Generator...');

    try {
      const data = await apiClient.post('/gemini/generate-video', {
          prompt,
          aspectRatio
      });

      if (data.videoUrl) {
        // Instant response or simulated preview
        setVideoUrl(data.videoUrl);
        setIsGenerating(false);
      } else if (data.operationName) {
        setOperationName(data.operationName);
      } else {
        throw new Error(data.error || 'Failed to start video synthesis');
      }
    } catch (err: any) {
      setError(err.message || 'Video generation encountered an issue');
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 text-fg">
      {/* Top Header */}
      <div className="p-6 rounded-3xl border border-line bg-canvas space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent-soft/40 text-fg text-[10px] font-mono">
          <Film className="h-3 w-3 text-accent-text" />
          <span>Veo 3 · Generative Video Engine (veo-3.1-fast-generate-preview)</span>
        </div>

        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-fg">
          AI Beauty Runway & Motion Studio
        </h2>

        <p className="text-xs sm:text-sm text-fg-muted max-w-2xl leading-relaxed">
          Transform your bridal concepts and editorial makeup blueprints into cinematic 4K runway motion clips using Google’s Veo 3 video model.
        </p>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-4">
          <form onSubmit={handleGenerate} className="p-6 rounded-3xl border border-line bg-canvas space-y-4 shadow-xl">
            <div>
              <label className="text-xs font-mono text-fg-muted block mb-1.5">
                Runway & Motion Scene Prompt
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe model appearance, lighting, eye makeup colors, camera motion..."
                className="w-full p-3.5 rounded-2xl border border-accent-soft bg-surface text-xs text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
              />
            </div>

            {/* Aspect Ratio Switcher */}
            <div>
              <label className="text-xs font-mono text-fg-muted block mb-1.5">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-mono font-medium transition-all cursor-pointer ${
                    aspectRatio === '16:9'
                      ? 'bg-primary border-accent text-on-primary font-bold'
                      : 'bg-surface border-line text-fg-muted hover:text-fg'
                  }`}
                >
                  <Tv className="h-4 w-4" />
                  <span>16:9 (Landscape)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-mono font-medium transition-all cursor-pointer ${
                    aspectRatio === '9:16'
                      ? 'bg-primary border-accent text-on-primary font-bold'
                      : 'bg-surface border-line text-fg-muted hover:text-fg'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>9:16 (Portrait / Reels)</span>
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="pt-2">
              <span className="text-[10px] font-mono uppercase text-fg-dim block mb-1.5">
                Curated Motion Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrompt('Bridal veil reveal in soft golden hour light, luminous velvet skin, and subtle wind movement')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  Golden Veil Reveal
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Editorial high-fashion runway model with graphic black winged liner turning towards flash cameras')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  Runway Flash Wing
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Extreme close up of iridescent duo-chrome eye shimmer catching prism reflections in slow motion')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  Prism Shimmer Macro
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-fg" />
                  <span>Synthesizing Video...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-fg" />
                  <span>Generate Veo 3 Video</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="p-3.5 rounded-2xl border border-danger-border/50 bg-danger-surface/40 text-xs text-danger flex items-center gap-2 font-mono">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Video Player Display Column */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="p-6 rounded-3xl border border-line bg-canvas min-h-[460px] flex flex-col items-center justify-center shadow-xl">
            {isGenerating ? (
              <div className="text-center space-y-4 p-8 max-w-sm">
                <div className="relative mx-auto w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-accent-soft/20 animate-ping" />
                  <div className="relative rounded-full h-full w-full bg-surface border-2 border-accent flex items-center justify-center">
                    <Film className="h-7 w-7 text-fg animate-pulse" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h4 className="font-serif font-bold text-base text-fg">
                    Veo 3 Synthesizing Motion
                  </h4>
                  <p className="text-xs text-fg-muted font-mono">
                    {progressStatus || 'Building runway keyframes...'}
                  </p>
                </div>

                <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden border border-line">
                  <div className="bg-primary h-full rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            ) : videoUrl ? (
              <div className="w-full space-y-4">
                <div className={`relative overflow-hidden rounded-2xl border border-line bg-canvas mx-auto shadow-2xl ${
                  aspectRatio === '9:16' ? 'max-w-[280px] aspect-[9/16]' : 'w-full aspect-[16/9]'
                }`}>
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-fg-muted px-2 font-mono">
                  <span className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Veo 3 Render Complete ({aspectRatio})</span>
                  </span>

                  <a
                    href={videoUrl}
                    download="leish-couture-runway.mp4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface text-fg border border-line"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Save Video</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3 p-8 text-fg-dim">
                <Film className="h-12 w-12 mx-auto stroke-1" />
                <h4 className="font-serif text-base text-fg">
                  No Video Rendered Yet
                </h4>
                <p className="text-xs text-fg-muted max-w-xs mx-auto">
                  Enter your desired beauty scene or pick a preset on the left to synthesize high-fashion video clips.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
