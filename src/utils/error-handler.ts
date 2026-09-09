import { logger } from './logger';
import { showToast } from '../ui/toast';
import { announceToScreenReader } from './a11y';

export class ErrorHandler {
  private static instance: ErrorHandler | null = null;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private offlineBanner: HTMLElement | null = null;
  private lastToastTime: number = 0;
  private networkListeners: Array<(online: boolean) => void> = [];

  private constructor() {
    this.initGlobalListeners();
    this.initNetworkMonitoring();
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  private initGlobalListeners() {
    if (typeof window === 'undefined') return;

    // 1. Catch unhandled errors
    window.addEventListener('error', (event) => {
      logger.error('[GlobalErrorHandler] Uncaught Error:', event.error || event.message);
      
      // Filter out noisy or extension-injected script errors
      const isExtension = event.filename && (event.filename.startsWith('chrome-extension') || event.filename.startsWith('moz-extension'));
      if (isExtension) return;

      this.showThrottledError('Terjadi kendala rendering/sistem. Klik muat ulang jika peta tidak merespons.', 8000);
    });

    // 2. Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('[GlobalErrorHandler] Unhandled Promise Rejection:', event.reason);
      
      // If network failure / fetch failure while offline, suppress spam
      if (!this.isOnline) return;

      const reasonStr = String(event.reason?.message || event.reason || '');
      if (reasonStr.includes('Failed to fetch') || reasonStr.includes('NetworkError') || reasonStr.includes('Load failed')) {
        this.showThrottledError('Kendala koneksi ke server geospasial eksternal.', 6000);
      }
    });
  }

  private initNetworkMonitoring() {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      this.isOnline = true;
      logger.info('[Network] Back online');
      this.hideOfflineBanner();
      showToast('Koneksi internet pulih kembali.', 'success', 3000);
      announceToScreenReader('Koneksi internet pulih kembali.');
      this.notifyNetworkChange(true);
    };

    const handleOffline = () => {
      this.isOnline = false;
      logger.warn('[Network] Offline detected');
      this.showOfflineBanner();
      showToast('Koneksi terputus. Mode peta offline aktif.', 'warning', 5000);
      announceToScreenReader('Peringatan: Koneksi internet terputus. Beralih ke mode offline.');
      this.notifyNetworkChange(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!this.isOnline) {
      setTimeout(() => this.showOfflineBanner(), 500);
    }
  }

  public onNetworkChange(callback: (online: boolean) => void) {
    this.networkListeners.push(callback);
    callback(this.isOnline);
  }

  private notifyNetworkChange(online: boolean) {
    this.networkListeners.forEach((cb) => {
      try {
        cb(online);
      } catch (err) {
        logger.error('Error in network change callback:', err);
      }
    });
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public showThrottledError(message: string, minIntervalMs: number = 5000) {
    const now = Date.now();
    if (now - this.lastToastTime > minIntervalMs) {
      this.lastToastTime = now;
      showToast(message, 'error', 4000);
    }
  }

  public showOfflineBanner() {
    if (this.offlineBanner) {
      this.offlineBanner.style.display = 'flex';
      return;
    }

    this.offlineBanner = document.getElementById('offline-banner');
    if (!this.offlineBanner) {
      this.offlineBanner = document.createElement('div');
      this.offlineBanner.id = 'offline-banner';
      this.offlineBanner.className = 'offline-banner';
      this.offlineBanner.setAttribute('role', 'alert');
      this.offlineBanner.innerHTML = `
        <span class="offline-icon" aria-hidden="true">⚠️</span>
        <div class="offline-text">
          <strong>Mode Offline</strong> — Koneksi internet terputus. Data citra dan layer baru tidak dapat dimuat hingga koneksi kembali.
        </div>
      `;
      document.body.prepend(this.offlineBanner);
    } else {
      this.offlineBanner.style.display = 'flex';
    }
  }

  public hideOfflineBanner() {
    if (this.offlineBanner) {
      this.offlineBanner.style.display = 'none';
    }
    const banner = document.getElementById('offline-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  /**
   * Safe execution wrapper for async tasks with user-friendly error toast
   */
  public async wrapAsync<T>(task: () => Promise<T>, fallbackMessage: string, fallbackValue?: T): Promise<T | undefined> {
    try {
      return await task();
    } catch (err) {
      logger.warn(`[SafeExecution] ${fallbackMessage}:`, err);
      showToast(fallbackMessage, 'error');
      return fallbackValue;
    }
  }
}
