/**
 * Gemini creative & concierge endpoints (extracted from server.ts): the
 * virtual lookbook generator, multi-turn beauty chatbot, image generation,
 * and Veo video generation/status/download flow. Behaviour is intentionally
 * kept verbatim — every route degrades to a curated preview response when
 * GEMINI_API_KEY is unset or the upstream call fails.
 */
import type { Express } from 'express';
import { GenerateVideosOperation, type GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { Salon } from '../../src/types.ts';
import { generateLookId } from '../ids.ts';
import { serverError } from '../http-utils.ts';
import { stripJsonFences } from './ai-advisors.ts';
import type { RouteContext } from './context.ts';

/**
 * Studio routes historically gate on mere presence of GEMINI_API_KEY (only
 * the placeholder sentinel is rejected), unlike the advisor endpoints'
 * stricter configuredGeminiKey(). Kept verbatim so behaviour cannot drift.
 */
const hasGeminiKey = (): boolean =>
  Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';

const LOOKBOOK_DEFAULT_IMAGES: Record<string, string> = {
  bridal: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1200',
  editorial: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200',
  'soft-glam': 'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=1200',
  airbrush: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1200',
  masterclass: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200'
};

const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

const qualityAuditRequestSchema = z.object({ salonId: z.string().trim().min(1).max(120) }).strict();

export function registerAiStudioRoutes(app: Express, ctx: RouteContext & { aiClient: GoogleGenAI; aiTimeoutMs: number }): void {
  const { store: appStore, aiClient } = ctx;

  // --- API ROUTE: AI Virtual Lookbook & 2026 Trends Grounding ---
  app.post('/api/gemini/trends-lookbook', async (req, res) => {
    try {
      const { prompt: userPrompt, aesthetic, occasion, skinUndertone, lighting } = req.body;
      const salons = await appStore.getSalons();

      const selectedAesthetic = aesthetic || 'bridal';
      const heroImage = LOOKBOOK_DEFAULT_IMAGES[selectedAesthetic] || LOOKBOOK_DEFAULT_IMAGES['bridal'];

      // Keep the deterministic fallback bookable against the live catalogue.
      // Hard-coded display names drift when providers edit their service menu;
      // the booking flow must receive the current canonical salon/service IDs.
      const fallbackSalon = salons.find(salon =>
        salon.category === selectedAesthetic || salon.services.some(service => service.category === selectedAesthetic),
      ) || salons[0];
      const fallbackService = fallbackSalon?.services.find(service => service.category === selectedAesthetic)
        || fallbackSalon?.services[0];

      // Fallback curated lookbook spec if Gemini is unavailable
      const fallbackLookbook = {
        id: generateLookId(),
        lookName: selectedAesthetic === 'bridal'
          ? 'Royal Gilded Silk Bridal'
          : selectedAesthetic === 'editorial'
          ? 'High-Impact Cinematic Red Carpet'
          : 'Velvet Nude Petal Soft Glam',
        category: selectedAesthetic,
        vibeDescription: 'Elegantly sculpted complexion featuring radiant light-reflective underpainting, champagne shimmer lids, and a velvety ombre lip designed for 18-hour tearproof wear.',
        colorPalette: [
          { hex: '#E6E5E4', name: 'Champagne Rose' },
          { hex: '#90836D', name: 'Spiced Terracotta' },
          { hex: '#554B3A', name: 'Espresso Velvet' },
          { hex: '#ECEBE9', name: 'Opal Glaze' },
          { hex: '#ABA497', name: 'Golden Apricot' }
        ],
        complexion: {
          finish: 'Velvet Satin Glow',
          coverage: 'Medium Buildable',
          technique: 'Cream Underpainting & Micro-Mist 4K Airbrush'
        },
        eyeArtistry: {
          style: 'Soft Almond Smoke with Champagne Foil Inner Corner',
          lashStyle: 'Whisper-Thin Dimensional Silk Clusters'
        },
        lipFormula: {
          shade: 'Warm Honey Muted Rose',
          finish: 'Hydrated Velvet Matte with Satin Plumping Glaze',
          liner: 'Chestnut Contoured'
        },
        longevityFeatures: [
          '18-Hour Cry-Proof & Sweat-Resistant Seal',
          'Flashback-Free High Definition Silica Barrier',
          'Micro-pore Blur Technology for 4K Video'
        ],
        lightingBestFor: lighting || 'Warm Ballroom Chandelier & Sunset Golden Hour',
        groundedTrendContext: '2026 Fashion Week spotlighted "Glass Velvet" skin: ultra-dewy high points balanced by blurred, shine-controlled T-zones for seamless camera transitions.',
        recommendedSalonId: fallbackSalon?.id,
        recommendedServiceId: fallbackService?.id,
        recommendedServiceName: fallbackService?.name,
        heroImage
      };

      if (!hasGeminiKey()) {
        return res.json(fallbackLookbook);
      }

      // Query Gemini 3.5 Flash with Google Search Grounding for current 2026 trend synthesis
      const searchPrompt = `You are the Executive Artistry Director for Leish! Luxury Makeup Studio Marketplace.
Search for current 2026 bridal, runway, and red-carpet makeup trends. Then generate a bespoke luxury Makeup Lookbook Specification.

Parameters:
- Desired Style: ${userPrompt || aesthetic || 'High luxury wedding makeup'}
- Aesthetic Category: ${selectedAesthetic}
- Occasion: ${occasion || 'Black Tie Evening'}
- Skin Undertone: ${skinUndertone || 'Neutral Warm'}
- Preferred Lighting: ${lighting || 'Natural Daylight & Flash Photography'}

Available Marketplace Studios:
${salons.map(s => `- ${s.name} (ID: ${s.id}, Category: ${s.category}, Top Service: ${s.services[0]?.name || 'Bridal Artistry'})`).join('\n')}

Synthesize the latest 2026 fashion week / viral beauty trends and output ONLY valid JSON matching this schema:
{
  "lookName": "Creative luxury look title (e.g. 'Gilded Velvet Champagne Bridal')",
  "category": "${selectedAesthetic}",
  "vibeDescription": "Poetic, editorial, and vivid 2-sentence description of the artistry look.",
  "colorPalette": [
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" },
    { "hex": "#HEXCODE", "name": "Color Name" }
  ],
  "complexion": {
    "finish": "e.g. Cloud Skin / Dewy Velvet / Satin Matte",
    "coverage": "e.g. Sheer Glow / Medium Buildable / 4K Full Coverage",
    "technique": "e.g. Underpainting with micro-airbrush setting veil"
  },
  "eyeArtistry": {
    "style": "e.g. Soft diffused smoked wing with crushed diamond reflect",
    "lashStyle": "e.g. Handcrafted individual mink clusters flared at outer corners"
  },
  "lipFormula": {
    "shade": "e.g. 90s Spiced Rosewood Ombré",
    "finish": "e.g. Blurred Velvet with High-Shine Core Glaze",
    "liner": "e.g. Cool Taupe Chestnut Pencil"
  },
  "longevityFeatures": [
    "Feature 1 (e.g. 18-Hour Humidity & Cry-Proof Barrier)",
    "Feature 2 (e.g. Zero-Flashback HD Micro-Silica)",
    "Feature 3 (e.g. Heat-activated fixing mist)"
  ],
  "lightingBestFor": "${lighting || 'Natural Daylight & Flash Photography'}",
  "groundedTrendContext": "1-2 sentences on how this look aligns with 2026 runway/red-carpet trends observed on Milan/Paris runways or celebrity red carpets.",
  "recommendedSalonId": "salon-1",
  "recommendedServiceName": "Service Name matching the studio"
}
Ensure colorPalette has 5 distinct harmonious hexadecimal values. Return pure JSON without markdown backticks if possible.`;

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI request timeout')), 7000)
        );
        const aiPromise = aiClient.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: searchPrompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);

        if (response && response.text) {
          const cleanText = stripJsonFences(response.text);

          const parsed = JSON.parse(cleanText);
          parsed.id = generateLookId();
          parsed.heroImage = heroImage;
          return res.json(parsed);
        }
      } catch (genErr: any) {
        console.warn('[Gemini Lookbook Generator] GenAI call note:', genErr?.message || genErr);
      }

      return res.json(fallbackLookbook);
    } catch (error: any) {
      console.error('[Gemini Lookbook Generator] Error:', error);
      res.status(500).json({ error: 'Lookbook generation encountered an issue.' });
    }
  });

  // --- API ROUTE: Multi-Turn Gemini Beauty Chatbot with Search & Maps Grounding ---
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { messages, modelChoice = 'general', grounding = 'none' } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Conversation messages array is required.' });
      }

      // Model mapping per user brief:
      // 'complex' -> 'gemini-3.1-pro-preview', 'general' -> 'gemini-3.5-flash', 'fast' -> 'gemini-3.1-flash-lite'
      let selectedModel = 'gemini-3.5-flash';
      if (modelChoice === 'complex') selectedModel = 'gemini-3.1-pro-preview';
      else if (modelChoice === 'fast') selectedModel = 'gemini-3.1-flash-lite';

      const salons = await appStore.getSalons();
      const directorySummary = salons.map(s =>
        `• ${s.name} (${s.type === 'mua' ? 'Independent MUA' : 'Atelier Studio'}, Rating: ${s.rating}★, Location: ${s.location}, Category: ${s.category}, Top: ${s.services[0]?.name} RM${s.services[0]?.price})`
      ).join('\n');

      const systemInstruction = `You are the Lead Master Beauty & Makeup Concierge for Leish! Aesthetic Marketplace.
You provide authoritative advice on luxury bridal, red-carpet, soft glam, and HD airbrush makeup artistry.
You can recommend independent MUAs and boutique ateliers listed on our platform.
Here is the current Leish! directory:
${directorySummary}

Tone: Sophisticated, welcoming, expert, couture aesthetic.
Always answer questions directly. When recommending studios or MUAs, cite their exact names and specialties.`;

      // Tools configuration:
      const tools: any[] = [];
      if (grounding === 'search') {
        tools.push({ googleSearch: {} });
      } else if (grounding === 'maps') {
        tools.push({ googleMaps: {} });
      }

      // Check if Gemini API key exists
      if (!hasGeminiKey()) {
        const lastUserMessage = messages[messages.length - 1]?.parts?.[0]?.text || '';
        return res.json({
          reply: `Welcome to Leish! Regarding "${lastUserMessage.slice(0, 40)}": for high-definition event artistry, we recommend independent MUAs like Jean-Marc Laurent for red carpet underpainting or Maison Leish Atelier for bridal suites. (Note: Running in concierge preview mode).`,
          groundingCitations: []
        });
      }

      const config: any = {
        systemInstruction,
      };

      if (tools.length > 0) {
        config.tools = tools;
      }

      try {
        const response = await aiClient.models.generateContent({
          model: selectedModel,
          contents: messages,
          config
        });

        const reply = response.text || 'Thank you for your message. How may I assist your beauty journey today?';

        // Extract search/maps grounding metadata if available
        const candidate = response.candidates?.[0];
        const searchChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

        return res.json({
          reply,
          groundingCitations: searchChunks.map((c: any) => ({
            title: c.web?.title || 'Web Citation',
            url: c.web?.uri || '',
          })).filter((c: any) => Boolean(c.url)),
          webSearchQueries,
          modelUsed: selectedModel
        });
      } catch (err: any) {
        console.warn('[Gemini Chat] Primary call note:', err?.message);
        // Graceful fallback to gemini-3.5-flash if pro preview quota or paid key was needed
        if (selectedModel !== 'gemini-3.5-flash') {
          const fallbackRes = await aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: messages,
            config: { systemInstruction }
          });
          return res.json({
            reply: fallbackRes.text || 'I am delighted to assist with your beauty styling questions.',
            groundingCitations: [],
            modelUsed: 'gemini-3.5-flash'
          });
        }
        throw err;
      }
    } catch (error: any) {
      console.error('[Gemini Chat Error]:', error);
      serverError(res, 'Chatbot service error.');
    }
  });

  // --- API ROUTE: Create & Edit Images using Gemini Flash Image ---
  app.post('/api/gemini/generate-image', async (req, res) => {
    try {
      const { prompt, aspectRatio = '1:1', baseImageBase64, imageMimeType = 'image/jpeg' } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Text prompt is required.' });
      }

      if (!hasGeminiKey()) {
        // High quality aesthetic fallback if key is not configured
        return res.json({
          imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1200',
          prompt,
          mode: 'preview'
        });
      }

      // Model: per prompt, use gemini-3.1-flash-image-preview (or gemini-3.1-flash-image)
      const modelName = 'gemini-3.1-flash-image-preview';

      const parts: any[] = [];
      if (baseImageBase64) {
        parts.push({
          inlineData: {
            data: baseImageBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
            mimeType: imageMimeType
          }
        });
      }
      parts.push({ text: `Haute couture luxury beauty editorial photograph: ${prompt}. Professional studio lighting, poreless glass skin finish, bespoke eye design, high fashion magazine quality.` });

      try {
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any || '1:1'
            }
          }
        });

        let foundImageUrl: string | null = null;
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              foundImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (foundImageUrl) {
          return res.json({ imageUrl: foundImageUrl, prompt });
        }
      } catch (imgErr: any) {
        console.warn('[Gemini Flash Image] Error with preview model, trying lite image model:', imgErr?.message);
        // Fallback to gemini-3.1-flash-lite-image
        try {
          const fallbackRes = await aiClient.models.generateContent({
            model: 'gemini-3.1-flash-lite-image',
            contents: { parts },
            config: {
              imageConfig: { aspectRatio: aspectRatio as any || '1:1' }
            }
          });
          if (fallbackRes.candidates?.[0]?.content?.parts) {
            for (const part of fallbackRes.candidates[0].content.parts) {
              if (part.inlineData?.data) {
                return res.json({
                  imageUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
                  prompt
                });
              }
            }
          }
        } catch (liteErr) {
          console.warn('[Gemini Lite Image] Also encountered error:', liteErr);
        }
      }

      // Elegant editorial photography fallback on quota exhaustion
      return res.json({
        imageUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200',
        prompt,
        notice: 'Rendered with curated aesthetic fallback while image synthesis quota resets.'
      });
    } catch (error: any) {
      console.error('[Image Generation Error]:', error);
      serverError(res, 'Image generation failed.');
    }
  });

  // --- API ROUTE: Veo 3 Video Generation (Start) ---
  app.post('/api/gemini/generate-video', async (req, res) => {
    try {
      const { prompt, aspectRatio = '16:9' } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Text prompt is required.' });
      }

      const validAspect = (aspectRatio === '9:16') ? '9:16' : '16:9';

      if (!hasGeminiKey()) {
        return res.json({
          operationName: 'simulated-video-operation',
          aspectRatio: validAspect,
          done: true,
          videoUrl: SAMPLE_VIDEO_URL
        });
      }

      try {
        const operation = await aiClient.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `Cinematic 4K luxury beauty video: ${prompt}. Smooth camera pan, flattering studio rim lighting, immaculate makeup details, runway movement.`,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: validAspect
          }
        });

        return res.json({
          operationName: operation.name,
          aspectRatio: validAspect,
          done: false
        });
      } catch (veoErr: any) {
        console.warn('[Veo 3 fast model note]:', veoErr?.message);
        // Try fallback to veo-3.1-lite-generate-preview
        const opLite = await aiClient.models.generateVideos({
          model: 'veo-3.1-lite-generate-preview',
          prompt: `Cinematic beauty runway video: ${prompt}`,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: validAspect
          }
        });
        return res.json({
          operationName: opLite.name,
          aspectRatio: validAspect,
          done: false
        });
      }
    } catch (error: any) {
      console.error('[Veo Video Generation Error]:', error);
      // Return simulated demo video so UI experience remains seamless
      res.json({
        operationName: 'demo-runway-clip',
        aspectRatio: req.body.aspectRatio || '16:9',
        done: true,
        videoUrl: SAMPLE_VIDEO_URL,
        notice: 'Video generation is temporarily unavailable.'
      });
    }
  });

  // --- API ROUTE: Veo 3 Video Status (Poll) ---
  app.post('/api/gemini/video-status', async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: 'Operation name is required.' });
      }

      if (operationName === 'simulated-video-operation' || operationName === 'demo-runway-clip') {
        return res.json({
          done: true,
          videoUrl: SAMPLE_VIDEO_URL
        });
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await aiClient.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      res.json({
        done: Boolean(updated.done),
        hasDownloadUri: Boolean(uri)
      });
    } catch (error: any) {
      console.error('[Veo Status Error]:', error);
      serverError(res, 'Video status lookup failed');
    }
  });

  // --- API ROUTE: Veo 3 Video Download Stream ---
  app.post('/api/gemini/video-download', async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: 'Operation name is required.' });
      }

      if (operationName === 'simulated-video-operation' || operationName === 'demo-runway-clip') {
        return res.redirect(SAMPLE_VIDEO_URL);
      }

      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await aiClient.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      if (!uri) {
        return res.status(404).json({ error: 'Video URI not ready yet.' });
      }

      const videoRes = await fetch(uri, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' }
      });

      res.setHeader('Content-Type', 'video/mp4');
      if (videoRes.body) {
        const arrayBuf = await videoRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      } else {
        res.status(500).json({ error: 'Empty video stream from upstream.' });
      }
    } catch (error: any) {
      console.error('[Veo Download Error]:', error);
      serverError(res, 'Video download failed');
    }
  });
}

// Re-exported so the audit schema stays colocated with the auditor routes if
// future refactors move quality-audit here; currently unused otherwise.
export { qualityAuditRequestSchema };
export type { Salon as _SalonTypeRef };
