/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { apiClient } from '../lib/api';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Wand2, 
  Upload, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Layers,
  Ratio
} from 'lucide-react';

export default function ImageStudio() {
  const [prompt, setPrompt] = useState('High fashion bridal makeup with pearlescent highlighter, soft winged eyeliner, and satin rosewood lips on glass skin');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setBaseImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setNotice(null);

    try {
      const data = await apiClient.post('/gemini/generate-image', {
          prompt,
          aspectRatio,
          baseImageBase64: baseImage || undefined,
          imageMimeType: 'image/jpeg'
      });
      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        if (data.notice) setNotice(data.notice);
      } else {
        throw new Error(data.error || 'Failed to synthesize beauty look.');
      }
    } catch (err: any) {
      setError(err.message || 'Image generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 text-fg">
      {/* Top Header */}
      <div className="p-6 rounded-3xl border border-line bg-canvas space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent-soft/40 text-fg text-[10px] font-mono">
          <Wand2 className="h-3 w-3 text-accent-text" />
          <span>Gemini Flash Image · Create & Edit (gemini-3.1-flash-image-preview)</span>
        </div>

        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-fg">
          AI Beauty Lookbook Studio
        </h2>

        <p className="text-xs sm:text-sm text-fg-muted max-w-2xl leading-relaxed">
          Create bespoke editorial makeup designs from text prompts, or upload a portrait to edit specific facial features, smoky eyes, contouring, and lip finishes using Gemini.
        </p>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-4">
          <form onSubmit={handleGenerate} className="p-6 rounded-3xl border border-line bg-canvas space-y-4 shadow-xl">
            {/* Mode selection / Optional Base Image */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono text-fg-muted">
                  Base Face Reference (Optional for Editing)
                </label>
                {baseImage && (
                  <button
                    type="button"
                    onClick={() => setBaseImage(null)}
                    className="text-[10px] font-mono text-danger hover:underline"
                  >
                    Clear base image
                  </button>
                )}
              </div>

              {baseImage ? (
                <div className="relative h-28 w-full rounded-2xl overflow-hidden border border-line bg-canvas">
                  <img src={baseImage} alt="Base Face" className="h-full w-full object-cover" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-canvas/70 text-[9px] font-mono text-success border border-success-border/40">
                    Editing Mode Active
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-4 rounded-2xl border border-dashed border-accent-soft hover:border-accent-text bg-surface cursor-pointer transition-colors">
                  <Upload className="h-5 w-5 text-fg-muted mb-1" />
                  <span className="text-[11px] font-mono text-fg">Upload face or trial photo to edit</span>
                  <span className="text-[9px] font-mono text-fg-dim">JPG, PNG under 5MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Prompt textarea */}
            <div>
              <label className="text-xs font-mono text-fg-muted block mb-1.5">
                {baseImage ? 'Makeup Edit Instructions' : 'Couture Makeup Look Prompt'}
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={baseImage ? "e.g. Add bold cherry red satin lips and smoked wing eyeliner..." : "e.g. 2026 red carpet glam with blurred porcelain skin and soft taupe crease..."}
                className="w-full p-3.5 rounded-2xl border border-accent-soft bg-surface text-xs text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
              />
            </div>

            {/* Aspect Ratio Switcher */}
            <div>
              <label className="text-xs font-mono text-fg-muted block mb-1.5">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['1:1', '9:16', '16:9'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-medium transition-all cursor-pointer text-center ${
                      aspectRatio === ratio
                        ? 'bg-primary border-accent text-on-primary font-bold'
                        : 'bg-surface border-line text-fg-muted hover:text-fg'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Prompt Presets */}
            <div className="pt-2">
              <span className="text-[10px] font-mono uppercase text-fg-dim block mb-1.5">
                Trending Aesthetics
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrompt('Couture South Asian bridal glam with emerald jewel cut-crease, 3D lashes, and flawless velvet baking')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  South Asian Jewel Bridal
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Clean girl glass skin aesthetic with laminated soap brows, dewy cheek flush, and glossy peptidic lips')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  Glass Skin & Soap Brow
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Red carpet 4K airbrush matte complexion with sculpted cheekbones and nude cashmere ombré pout')}
                  className="text-[10px] font-mono bg-surface hover:bg-surface text-fg-muted px-2.5 py-1 rounded-full border border-line"
                >
                  Red Carpet Airbrush
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
                  <span>Synthesizing Look...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-fg" />
                  <span>{baseImage ? 'Apply AI Makeup Edits' : 'Synthesize Beauty Look'}</span>
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

        {/* Output Display Column */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="p-6 rounded-3xl border border-line bg-canvas min-h-[460px] flex flex-col items-center justify-center shadow-xl">
            {isGenerating ? (
              <div className="text-center space-y-4 p-8 max-w-sm">
                <div className="relative mx-auto w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-accent-soft/20 animate-ping" />
                  <div className="relative rounded-full h-full w-full bg-surface border-2 border-accent flex items-center justify-center">
                    <Wand2 className="h-7 w-7 text-fg animate-pulse" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h4 className="font-serif font-bold text-base text-fg">
                    Gemini Flash Image Synthesizing
                  </h4>
                  <p className="text-xs text-fg-muted font-mono">
                    Rendering micro-pigment foundation, lash symmetry, and soft lighting...
                  </p>
                </div>
              </div>
            ) : generatedImage ? (
              <div className="w-full space-y-4">
                <div className="relative overflow-hidden rounded-2xl border border-line bg-canvas max-h-[500px] flex items-center justify-center">
                  <img
                    src={generatedImage}
                    alt="Synthesized Beauty Look"
                    className="max-h-[500px] w-auto object-contain mx-auto"
                  />
                </div>

                {notice && (
                  <p className="text-[11px] font-mono text-fg italic text-center">
                    {notice}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-fg-muted px-2 font-mono">
                  <span className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Gemini 3.1 Flash Image Look Ready</span>
                  </span>

                  <a
                    href={generatedImage}
                    download="leish-couture-look.png"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface text-fg border border-line"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Save Look</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3 p-8 text-fg-dim">
                <ImageIcon className="h-12 w-12 mx-auto stroke-1" />
                <h4 className="font-serif text-base text-fg">
                  No Look Synthesized Yet
                </h4>
                <p className="text-xs text-fg-muted max-w-xs mx-auto">
                  Type your desired makeup look or upload a reference face on the left to create luxury beauty imagery with Gemini.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
