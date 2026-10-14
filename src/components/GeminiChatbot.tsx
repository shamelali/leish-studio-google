/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  Bot,
  CircleAlert,
  Loader2,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  User as UserIcon,
  X,
} from 'lucide-react';
import ConciergeArtistCards, {
  type ArtistSearchInput,
  type ArtistSearchResult,
} from './ConciergeArtistCards';
import type { Salon, Service } from '../types';

export type ConciergeTools = {
  searchArtists: {
    input: ArtistSearchInput;
    output: ArtistSearchResult;
  };
};

type ConciergeMessage = UIMessage<unknown, {}, ConciergeTools>;
type SearchArtistsPart = Extract<ConciergeMessage['parts'][number], { type: 'tool-searchArtists' }>;

interface GeminiChatbotProps {
  onClose?: () => void;
  isFloating?: boolean;
  onBook?: (salon: Salon, service: Service) => void;
}

const WELCOME =
  'Bonjour! I am your Leish! wedding beauty concierge. Tell me the wedding mood you are dreaming of, your city or neighbourhood, and your budget if you have one. I will curate real, bookable catalogue services for you.';

const EXAMPLE_PROMPTS = [
  'Find a soft, dewy bridal look in Kuala Lumpur',
  'I want camera-ready glam near Petaling Jaya under RM500',
  'Show me an independent MUA for a classic wedding in Bangsar',
];

const initialMessages: ConciergeMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    parts: [{ type: 'text', text: WELCOME, state: 'done' }],
  },
];

function isSearchArtistsPart(part: ConciergeMessage['parts'][number]): part is SearchArtistsPart {
  return part.type === 'tool-searchArtists';
}

function isToolResult(value: unknown): value is ArtistSearchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ArtistSearchResult>;
  return Array.isArray(result.artists) && typeof result.summary === 'string';
}

export default function GeminiChatbot({
  onClose,
  isFloating = false,
  onBook,
}: GeminiChatbotProps) {
  const transport = useMemo(
    () => new DefaultChatTransport<ConciergeMessage>({
      api: '/api/gemini/concierge',
      // Never re-send catalogue cards, images or tool results as model history.
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages: messages.slice(-24).map(message => ({
            id: message.id,
            role: message.role,
            parts: message.parts.filter(part => part.type === 'text').map(part => ({
              type: 'text', text: part.text.slice(0, 2000),
            })),
          })),
        },
      }),
    }),
    [],
  );
  const {
    messages,
    sendMessage,
    stop,
    regenerate,
    error,
    clearError,
    status,
  } = useChat<ConciergeMessage>({
    messages: initialMessages,
    transport,
  });
  const [input, setInput] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasBusy = useRef(false);
  const wasStopped = useRef(false);
  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, status]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setLastSubmitted(trimmed);
    clearError();
    await sendMessage({ text: trimmed });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(input);
  };

  const handleRetry = () => {
    if (!lastSubmitted) return;
    clearError();
    void regenerate();
  };

  const handleStop = () => {
    wasStopped.current = true;
    stop();
  };

  useEffect(() => {
    if (status === 'ready' && wasBusy.current && !wasStopped.current) setInput('');
    if (status === 'ready') wasStopped.current = false;
    wasBusy.current = isBusy;
  }, [isBusy, status]);

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 font-mono text-xs font-bold text-on-primary shadow-2xl transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span>Open Beauty AI Concierge</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Leish wedding beauty concierge"
      className={`flex flex-col overflow-hidden rounded-3xl border border-line bg-canvas shadow-2xl ${
        isFloating
          ? 'fixed bottom-3 right-3 z-50 h-[min(720px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] sm:w-[480px]'
          : 'h-[min(720px,calc(100vh-7rem))] min-h-[560px] w-full'
      }`}
    >
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent-soft/50 bg-accent/20">
            <Sparkles className="h-4 w-4 text-fg" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-serif text-sm font-bold text-fg">
              <span className="truncate">Leish! Wedding Concierge</span>
              <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[9px] uppercase text-on-primary">AI</span>
            </h2>
            <p className="text-[10px] text-fg-muted">Real catalogue matches, thoughtfully curated</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isFloating && (
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize concierge"
              className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close concierge"
              className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-busy={isBusy}>
        <p className="sr-only" role="status">
          {isBusy ? 'The concierge is curating recommendations.' : status === 'error' ? 'The concierge encountered an error.' : ''}
        </p>
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'assistant' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-soft/50 bg-surface">
                <Bot className="h-3.5 w-3.5 text-fg" aria-hidden="true" />
              </div>
            )}
            <div className={`min-w-0 flex-1 space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              {message.parts.map((part, index) => {
                if (part.type === 'text' && part.text) {
                  return (
                    <div
                      key={`${message.id}-text-${index}`}
                      className={`rounded-2xl p-3.5 text-xs leading-relaxed ${
                        message.role === 'user'
                          ? 'rounded-br-none bg-primary text-on-primary shadow-md'
                          : 'rounded-bl-none border border-line bg-surface text-fg'
                      }`}
                    >
                      <p className="whitespace-pre-line">{part.text}</p>
                    </div>
                  );
                }
                if (!isSearchArtistsPart(part)) return null;
                if (part.state === 'input-streaming' || part.state === 'input-available') {
                  return isBusy
                    ? <ConciergeArtistCards key={`${message.id}-tool-${index}`} state="loading" />
                    : <p key={`${message.id}-tool-${index}`} className="text-xs text-fg-muted">Search interrupted. Send your brief again to resume.</p>;
                }
                if (part.state === 'output-error') {
                  return (
                    <div key={`${message.id}-tool-error-${index}`} role="alert" className="rounded-2xl border border-danger/30 bg-danger-surface/10 p-4 text-xs text-fg">
                      <div className="flex items-center gap-2 font-semibold"><CircleAlert className="h-4 w-4 text-danger" aria-hidden="true" /> We couldn&apos;t search the catalogue.</div>
                      <p className="mt-1 text-fg-muted">{part.errorText || 'Please try that search again.'}</p>
                    </div>
                  );
                }
                if (part.state === 'output-available' && isToolResult(part.output)) {
                  return <ConciergeArtistCards key={`${message.id}-tool-${index}`} state="result" result={part.output} onBook={onBook} />;
                }
                return null;
              })}
              {message.role === 'assistant' && <span className="sr-only">Concierge response</span>}
            </div>
            {message.role === 'user' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line">
                <UserIcon className="h-3.5 w-3.5 text-fg" aria-hidden="true" />
              </div>
            )}
          </div>
        ))}

        {isBusy && (
          <div className="flex items-center gap-3 text-xs text-fg-muted" role="status">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-soft/50 bg-surface">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-fg" aria-hidden="true" />
            </div>
            <span>{status === 'submitted' ? 'Preparing your beauty brief…' : 'Curating real catalogue matches…'}</span>
          </div>
        )}

        {error && status === 'error' && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-surface/10 p-3 text-xs text-fg">
            <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" /><span>{error.message || 'The concierge is temporarily unavailable.'}</span></div>
            <button type="button" onClick={handleRetry} className="inline-flex shrink-0 items-center gap-1 font-semibold text-fg underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Retry</button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-line bg-recessed-deep px-4 py-2.5">
        <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-fg-dim">Try a wedding brief</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              disabled={isBusy}
              className="shrink-0 rounded-full border border-line bg-inset px-2.5 py-1.5 text-left text-[10px] text-fg-muted transition-colors hover:border-accent-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line bg-canvas p-3">
        <label htmlFor="concierge-message" className="sr-only">Describe your wedding beauty brief</label>
        <input
          id="concierge-message"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Tell us your vibe, locality, and budget…"
          disabled={isBusy}
          autoComplete="off"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl border border-accent-soft bg-surface px-3.5 py-2.5 text-xs text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong disabled:opacity-60"
        />
        {isBusy ? (
          <button type="button" onClick={handleStop} aria-label="Stop response" className="inline-flex items-center gap-1.5 rounded-xl bg-line px-3 py-2.5 font-mono text-xs font-bold text-fg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /><span className="hidden sm:inline">Stop</span>
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Send message" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 font-mono text-xs font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong">
            <Send className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Ask</span>
          </button>
        )}
      </form>
    </section>
  );
}
