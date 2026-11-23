import { reportStationClick } from './radioApi.js';
import { getCountryLabel } from '../data/presets.js';

let hlsModulePromise = null;
async function loadHls() {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js').then((m) => m.default || m);
  }
  return hlsModulePromise;
}

export class RadioAudioEngine {
  constructor({ onStateChange, onError, onTimerTick } = {}) {
    this.audio = document.createElement('audio');
    this.audio.id = 'worldradio-audio';
    this.audio.preload = 'none';
    this.audio.playsInline = true;
    this.audio.hidden = true;
    document.body.appendChild(this.audio);
    // IMPORTANT: Do NOT set audio.crossOrigin = 'anonymous' so non-CORS Icecast/Shoutcast streams still play on mobile & desktop!

    this.hls = null;
    this.currentStation = null;
    this.status = 'idle'; // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
    this.volume = 0.85;
    this.muted = false;
    this.audio.volume = this.volume;

    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});
    this.onTimerTick = onTimerTick || (() => {});

    this._watchdog = null;
    this._playSeq = 0;
    this._sleepInterval = null;
    this._sleepEndsAt = null;

    this._bindAudioEvents();
  }

  _bindAudioEvents() {
    this.audio.addEventListener('playing', () => {
      this._clearWatchdog();
      this._setStatus('playing');
      this._updateMediaSessionState('playing');
    });

    this.audio.addEventListener('waiting', () => {
      if (this.currentStation && this.status !== 'paused') {
        this._setStatus('loading');
      }
    });

    this.audio.addEventListener('pause', () => {
      this._clearWatchdog();
      if (this.status !== 'idle' && this.status !== 'error') {
        this._setStatus('paused');
        this._updateMediaSessionState('paused');
      }
    });

    this.audio.addEventListener('error', () => {
      this._clearWatchdog();
      if (!this.currentStation) return;
      this._handleStreamFailure('No se pudo conectar con esta emisora. Puede estar caída o bloqueada por CORS/HTTPS.');
    });
  }

  _setStatus(status, detail = '') {
    this.status = status;
    this.onStateChange({
      status: this.status,
      station: this.currentStation,
      volume: this.volume,
      muted: this.muted,
      detail,
    });
  }

  _clearWatchdog() {
    if (this._watchdog) {
      clearTimeout(this._watchdog);
      this._watchdog = null;
    }
  }

  _destroyHls() {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // ignore
      }
      this.hls = null;
    }
  }

  _handleStreamFailure(message) {
    this._clearWatchdog();
    this._destroyHls();
    this._setStatus('error', message);
    this.onError(message, this.currentStation);
  }

  async play(station) {
    if (!station) return;
    const streamUrl = station.url_resolved || station.url;
    if (!streamUrl) {
      this._handleStreamFailure('La emisora no tiene una URL de audio válida.');
      return;
    }

    // Warn immediately on mixed content if page is HTTPS and stream is HTTP
    if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
      this.currentStation = station;
      this._handleStreamFailure('Esta emisora transmite en HTTP sin cifrar y el navegador móvil la bloquea en HTTPS. Probá otra emisora.');
      return;
    }

    const seq = ++this._playSeq;
    this._clearWatchdog();
    this._destroyHls();

    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      // ignore
    }

    this.currentStation = station;
    this._setStatus('loading', 'Sintonizando señal...');
    this._updateMediaSessionMetadata(station);
    reportStationClick(station.stationuuid);

    // 13-second connection watchdog
    this._watchdog = setTimeout(() => {
      if (seq !== this._playSeq) return;
      if (this.status === 'loading') {
        this.stopAudioOnly();
        this._handleStreamFailure('Tiempo de espera agotado (la radio no respondió). Probá con otra emisora.');
      }
    }, 13000);

    const isHls =
      Boolean(station.hls) ||
      streamUrl.toLowerCase().includes('.m3u8');

    try {
      if (isHls) {
        const Hls = await loadHls();
        if (seq !== this._playSeq) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            manifestLoadingTimeOut: 9000,
            fragLoadingTimeOut: 9000,
          });
          this.hls = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(this.audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (seq !== this._playSeq) return;
            this.audio.play().catch((err) => {
              if (seq !== this._playSeq) return;
              this._handleStreamFailure(this._formatPlayError(err));
            });
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (seq !== this._playSeq) return;
            if (data?.fatal) {
              this._handleStreamFailure('Error de stream HLS en esta emisora. Probá otra señal.');
            }
          });
          return;
        }
      }
      this.audio.src = streamUrl;
      this.audio.load();
      await this.audio.play();
    } catch (err) {
      if (seq !== this._playSeq) return;
      this._handleStreamFailure(this._formatPlayError(err));
    }
  }

  _formatPlayError(err) {
    if (err?.name === 'NotAllowedError') {
      return 'El navegador pidió un toque manual para iniciar el audio. Tocá Play de nuevo.';
    }
    return 'No se pudo reproducir esta emisora. Probá otra similar.';
  }

  async togglePlayPause() {
    if (!this.currentStation) return;
    if (this.status === 'playing' || this.status === 'loading') {
      this.pause();
    } else {
      // Live radio should reconnect fresh rather than resuming a stale buffer
      await this.play(this.currentStation);
    }
  }

  pause() {
    this._playSeq++;
    this._clearWatchdog();
    this.stopAudioOnly();
    this._setStatus('paused');
    this._updateMediaSessionState('paused');
  }

  stopAudioOnly() {
    this._destroyHls();
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      // ignore
    }
  }

  setVolume(val) {
    const clamped = Math.max(0, Math.min(1, Number(val)));
    this.volume = clamped;
    this.muted = clamped === 0;
    this.audio.volume = clamped;
    this.audio.muted = this.muted;
    this._setStatus(this.status);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.muted = this.muted;
    this._setStatus(this.status);
  }

  // Sleep timer (minutes = 0 cancels)
  setSleepTimer(minutes) {
    if (this._sleepInterval) {
      clearInterval(this._sleepInterval);
      this._sleepInterval = null;
    }
    this._sleepEndsAt = null;

    if (!minutes || minutes <= 0) {
      this.onTimerTick(0);
      return;
    }

    this._sleepEndsAt = Date.now() + minutes * 60 * 1000;
    this.onTimerTick(minutes * 60);

    this._sleepInterval = setInterval(() => {
      const remainingSec = Math.max(0, Math.round((this._sleepEndsAt - Date.now()) / 1000));
      this.onTimerTick(remainingSec);
      if (remainingSec <= 0) {
        clearInterval(this._sleepInterval);
        this._sleepInterval = null;
        this._sleepEndsAt = null;
        this.pause();
      }
    }, 1000);
  }

  setMediaSessionHandlers({ onNext, onPrev } = {}) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.pause());
      if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
      if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
    } catch {
      // Some browsers don't support all handlers
    }
  }

  _updateMediaSessionMetadata(station) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const country = getCountryLabel(station.countrycode, station.country);
    const metaInfo = [country, station.codec, station.bitrate ? `${station.bitrate} kbps` : '']
      .filter(Boolean)
      .join(' · ');

    const artwork = [];
    if (station.favicon && station.favicon.startsWith('https://')) {
      artwork.push({ src: station.favicon, sizes: '192x192' });
    }
    artwork.push(
      { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    );

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: metaInfo || 'WorldRadio en vivo',
        album: 'WorldRadio — Sintonizador Mundial',
        artwork,
      });
    } catch {
      // ignore
    }
  }

  _updateMediaSessionState(state) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // ignore
    }
  }
}
