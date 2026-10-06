// ─── Wird playback (الاستماع) ────────────────────────────────────────────────
//
// One module-level <audio> element playing a queue of ayat (per-ayah MP3s from the
// reciters CDN, served through the service worker's cache when offline). The queue is
// the wird's scope, so "ended" simply advances; the current ayah is exposed for the
// reader to highlight and auto-turn pages. Media Session wires the lock screen /
// headset buttons. Playback always starts from a user gesture (the play button or the
// tafseer sheet's استماع) — never programmatically on load.

import * as React from 'react';
import { getSurah, globalAyahIndex, type AyahRef } from '@wird/quran-data';
import {
  audioUrl,
  loadBitrate,
  loadReciterId,
  reciterById,
  saveBitrate,
  saveReciterId,
  type AudioBitrate,
} from './reciters';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface PlayerSnapshot {
  status: PlayerStatus;
  queue: AyahRef[];
  index: number;
  reciterId: string;
  bitrate: AudioBitrate;
  /** Repeat every ayah ×7 before advancing (a memorization aid matching the wird steps). */
  repeatEach: boolean;
  /** How many replays of the current ayah are still owed (read-only mirror). */
  repeatsLeft: number;
  speed: number;
  error: string | null;
}

const IDLE: PlayerSnapshot = {
  status: 'idle',
  queue: [],
  index: 0,
  reciterId: loadReciterId(),
  bitrate: loadBitrate(),
  repeatEach: false,
  repeatsLeft: 1,
  speed: 1,
  error: null,
};

const REPEAT_COUNT = 7;
const SPEEDS = [0.75, 1, 1.25, 1.5];

class WirdPlayer {
  private state: PlayerSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private prefetched = new Set<string>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): PlayerSnapshot => this.state;

  private set(patch: Partial<PlayerSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** The ayah currently loaded (null when idle). */
  current(): AyahRef | null {
    return this.state.queue[this.state.index] ?? null;
  }

  /** Starts (or restarts) a queue at an index. */
  playQueue(queue: AyahRef[], index = 0): void {
    if (queue.length === 0) return;
    this.set({ queue, index, error: null, status: 'loading', repeatsLeft: this.repeats() });
    this.load(true);
  }

  toggle(): void {
    const a = this.ensureAudio();
    if (this.state.status === 'idle') return;
    if (a.paused) void a.play();
    else a.pause();
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    const a = this.ensureAudio();
    // A long tap into the current ayah restarts it, like any audio player.
    if (a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    this.step(-1);
  }

  stop(): void {
    this.audio?.pause();
    this.set({ status: 'idle', queue: [], index: 0, error: null });
  }

  setSpeed(speed: number): void {
    this.set({ speed });
    if (this.audio) this.audio.playbackRate = speed;
  }

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.state.speed);
    this.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!);
  }

  setRepeatEach(on: boolean): void {
    this.set({ repeatEach: on, repeatsLeft: this.repeats(on) });
  }

  setReciter(id: string): void {
    saveReciterId(id);
    this.set({ reciterId: id });
    if (this.state.status !== 'idle') {
      this.set({ status: 'loading' });
      this.load(true); // same ayah in the new voice — still inside the user's tap
    }
  }

  setBitrate(b: AudioBitrate): void {
    saveBitrate(b);
    this.set({ bitrate: b });
    if (this.state.status !== 'idle') {
      this.set({ status: 'loading' });
      this.load(true);
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private repeats(on = this.state.repeatEach): number {
    return on ? REPEAT_COUNT : 1;
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('ended', () => this.onEnded());
    a.addEventListener('play', () => this.set({ status: 'playing', error: null }));
    a.addEventListener('pause', () => {
      if (this.state.status === 'playing') this.set({ status: 'paused' });
    });
    a.addEventListener('error', () => {
      if (this.state.status === 'idle') return;
      this.set({
        status: 'paused',
        error: 'تعذر تشغيل الصوت — تحقق من اتصالك بالإنترنت أو نزّل صوت الورد مسبقًا',
      });
    });
    this.audio = a;
    this.attachMediaSession(a);
    return a;
  }

  private load(autoplay: boolean): void {
    const ayah = this.current();
    if (!ayah) {
      this.stop();
      return;
    }
    const a = this.ensureAudio();
    const url = audioUrl(
      this.state.reciterId,
      this.state.bitrate,
      globalAyahIndex(ayah.surah, ayah.ayah),
    );
    a.playbackRate = this.state.speed;
    a.src = url;
    if (autoplay) {
      a.play().catch(() => {
        // Not an autoplay-policy issue (playback is user-initiated) — network or decode.
        this.set({ status: 'paused', error: 'تعذر تشغيل الصوت — تحقق من اتصالك بالإنترنت' });
      });
    }
    this.updateMediaSession(ayah);
    this.prefetchNext();
  }

  private onEnded(): void {
    if (this.state.repeatEach && this.state.repeatsLeft > 1) {
      this.set({ repeatsLeft: this.state.repeatsLeft - 1 });
      const a = this.ensureAudio();
      a.currentTime = 0;
      void a.play();
      return;
    }
    this.set({ repeatsLeft: this.repeats() });
    this.step(1);
  }

  private step(dir: 1 | -1): void {
    const next = this.state.index + dir;
    if (next < 0 || next >= this.state.queue.length) {
      this.stop();
      return;
    }
    this.set({ index: next, status: 'loading', error: null, repeatsLeft: this.repeats() });
    this.load(true);
  }

  /** Warms the next ayah through the SW's audio cache so the advance is gapless-ish. */
  private prefetchNext(): void {
    const next = this.state.queue[this.state.index + 1];
    if (!next) return;
    const url = audioUrl(
      this.state.reciterId,
      this.state.bitrate,
      globalAyahIndex(next.surah, next.ayah),
    );
    if (this.prefetched.has(url)) return;
    this.prefetched.add(url);
    fetch(url, { mode: 'no-cors' }).catch(() => {
      this.prefetched.delete(url); // offline right now — try again on the next track
    });
  }

  private attachMediaSession(a: HTMLAudioElement): void {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.setActionHandler('play', () => void a.play());
    ms.setActionHandler('pause', () => a.pause());
    ms.setActionHandler('previoustrack', () => this.prev());
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('stop', () => this.stop());
  }

  private updateMediaSession(ayah: AyahRef): void {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const surah = getSurah(ayah.surah);
    ms.metadata = new MediaMetadata({
      title: `سورة ${surah.nameAr} · الآية ${ayah.ayah.toLocaleString('ar-u-nu-latn')}`,
      artist: reciterById(this.state.reciterId).name,
      album: 'ورد',
      artwork: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }
}

export const wirdPlayer = new WirdPlayer();

export function useWirdPlayerSnapshot(): PlayerSnapshot {
  return React.useSyncExternalStore(wirdPlayer.subscribe, wirdPlayer.getSnapshot);
}
