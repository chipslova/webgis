import { AINavigator, type AIAction } from '../tools/ai-navigator';
import { escapeHtml } from '../utils/sanitize';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  actions?: AIAction[];
  timestamp: Date;
  isError?: boolean;
}

export class AIAssistantDockUI {
  private navigator: AINavigator;
  private containerEl: HTMLElement | null = null;
  private messagesContainerEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private floatingFabEl: HTMLElement | null = null;
  private headerBtnEl: HTMLElement | null = null;
  private isOpen: boolean = false;
  private isLoading: boolean = false;
  private messages: ChatMessage[] = [];

  private quickSuggestions = [
    { label: '🌋 Bromo 3D', prompt: 'Terbangkan kamera ke Gunung Bromo dengan sudut 3D miring 60 derajat' },
    { label: '🛰️ Citra Satelit', prompt: 'Ubah peta dasar menjadi citra satelit resolusi tinggi' },
    { label: '🏛️ IKN Nusantara', prompt: 'Arahkan peta ke kawasan Ibu Kota Nusantara (IKN)' },
    { label: '🌧️ Stasiun Cuaca', prompt: 'Tampilkan stasiun pengamatan cuaca di Pulau Jawa' },
    { label: '🌍 Bola Bumi 3D', prompt: 'Ubah proyeksi peta menjadi Bola Bumi 3D Globe' },
    { label: '📐 Ukur Jarak', prompt: 'Aktifkan alat pengukuran jarak' },
    { label: '🌊 Danau Toba', prompt: 'Terbang ke Danau Toba Sumatera Utara' }
  ];

  constructor(navigator: AINavigator) {
    this.navigator = navigator;
    this.initDOM();
    this.bindEvents();
    this.addWelcomeMessage();
  }

  private initDOM() {
    // 1. Create Floating Action Button (FAB)
    let fab = document.getElementById('ai-floating-fab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'ai-floating-fab';
      fab.className = 'ai-floating-fab';
      fab.title = 'AI Navigator & Geospatial Copilot (Alt+A)';
      fab.setAttribute('aria-label', 'Buka AI Navigator');
      fab.innerHTML = `
        <span class="ai-fab-glow"></span>
        <svg class="ai-fab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          <path d="M5 3v4"/>
          <path d="M3 5h4"/>
          <path d="M19 17v4"/>
          <path d="M17 19h4"/>
        </svg>
        <span class="ai-fab-text">AI Copilot</span>
        <span class="ai-fab-badge">GRATIS</span>
      `;
      document.body.appendChild(fab);
    }
    this.floatingFabEl = fab;

    // 2. Create Floating AI Assistant Dock Window
    let dock = document.getElementById('ai-assistant-dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'ai-assistant-dock';
      dock.className = 'ai-assistant-dock hidden';
      dock.setAttribute('role', 'region');
      dock.setAttribute('aria-label', 'Jendela AI Map Navigator');

      dock.innerHTML = `
        <div class="ai-dock-header">
          <div class="ai-dock-title-group">
            <div class="ai-dock-avatar" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
            </div>
            <div>
              <div class="ai-dock-title">
                <span>AI Map Navigator</span>
                <span class="ai-zero-cost-tag" title="Terkonfigurasi dengan Google Gemini Free Tier dan perlindungan kuota harian">Rp 0 / Bebas Biaya</span>
              </div>
              <div class="ai-dock-subtitle">Didukung Google Gemini Flash • Pengendali Navigasi Peta Otomatis</div>
            </div>
          </div>
          <div class="ai-dock-actions">
            <button id="ai-dock-settings-btn" class="ai-dock-icon-btn" title="Pengaturan Kunci API Kustom (Opsional)" aria-label="Pengaturan">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button id="ai-dock-close-btn" class="ai-dock-icon-btn" title="Tutup Jendela AI" aria-label="Tutup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Optional Custom Key Drawer (Hidden by default) -->
        <div id="ai-dock-settings-panel" class="ai-dock-settings-panel hidden">
          <div class="ai-settings-desc">
            Kunci server bawaan telah aktif dengan proteksi kuota <strong>Rp 0 (Bebas Biaya)</strong>. Jika Anda ingin menggunakan API Key Gemini pribadi tanpa batas kuota bersama:
          </div>
          <div class="ai-settings-input-group">
            <input type="password" id="ai-custom-key-input" placeholder="Masukkan Gemini API Key pribadi (opsional)..." autocomplete="off" />
            <button id="ai-custom-key-save" class="btn btn-primary btn-sm">Simpan</button>
          </div>
          <div id="ai-settings-status" class="ai-settings-status"></div>
        </div>

        <!-- Chat Messages Area -->
        <div id="ai-dock-messages" class="ai-dock-messages"></div>

        <!-- Quick Suggestions Chips -->
        <div class="ai-dock-suggestions">
          <div class="ai-suggestions-scroll" id="ai-suggestions-list"></div>
        </div>

        <!-- Prompt Input Bar -->
        <div class="ai-dock-footer">
          <form id="ai-dock-form" class="ai-dock-input-wrapper">
            <input
              type="text"
              id="ai-dock-input"
              placeholder="Perintahkan AI (cth: 'Terbang ke Danau Toba', 'Ganti ke Citra Satelit')..."
              maxlength="400"
              autocomplete="off"
            />
            <button type="submit" id="ai-dock-send-btn" class="ai-dock-send-btn" title="Kirim Perintah" aria-label="Kirim Perintah">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
          <div class="ai-dock-guard-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Proteksi Anti-Tagihan: Batas IP & Kuota Harian Terproteksi 100% Bebas Biaya</span>
          </div>
        </div>
      `;
      document.body.appendChild(dock);
    }
    this.containerEl = dock;
    this.messagesContainerEl = document.getElementById('ai-dock-messages');
    this.inputEl = document.getElementById('ai-dock-input') as HTMLInputElement;
    this.sendBtnEl = document.getElementById('ai-dock-send-btn') as HTMLButtonElement;

    // Render suggestion chips
    this.renderSuggestions();

    // Check custom key input value
    const customKeyInput = document.getElementById('ai-custom-key-input') as HTMLInputElement;
    if (customKeyInput) {
      customKeyInput.value = this.navigator.getCustomApiKey();
    }
  }

  private renderSuggestions() {
    const listEl = document.getElementById('ai-suggestions-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.quickSuggestions.forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ai-suggestion-chip';
      chip.textContent = item.label;
      chip.title = item.prompt;
      chip.addEventListener('click', () => {
        if (this.inputEl) {
          this.inputEl.value = item.prompt;
          this.handleSend();
        }
      });
      listEl.appendChild(chip);
    });
  }

  private addWelcomeMessage() {
    this.messages.push({
      id: 'welcome',
      sender: 'ai',
      text: 'Halo! Saya **AI Map Navigator** untuk Digital Earth Indonesia. Anda dapat meminta saya untuk mengendalikan peta, menerbangkan kamera ke kota atau gunung dalam 3D, mengganti basemap satelit, atau mencari stasiun cuaca. Apa yang ingin Anda jelajahi hari ini?',
      timestamp: new Date()
    });
    this.renderMessages();
  }

  private bindEvents() {
    // FAB click
    this.floatingFabEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Header AI button if present
    this.headerBtnEl = document.getElementById('btn-ai-assistant');
    this.headerBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close button
    const closeBtn = document.getElementById('ai-dock-close-btn');
    closeBtn?.addEventListener('click', () => this.setOpen(false));

    // Form submit
    const form = document.getElementById('ai-dock-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSend();
    });

    // Settings Toggle
    const settingsBtn = document.getElementById('ai-dock-settings-btn');
    const settingsPanel = document.getElementById('ai-dock-settings-panel');
    settingsBtn?.addEventListener('click', () => {
      settingsPanel?.classList.toggle('hidden');
    });

    // Save Custom Key
    const saveKeyBtn = document.getElementById('ai-custom-key-save');
    const customKeyInput = document.getElementById('ai-custom-key-input') as HTMLInputElement;
    const keyStatus = document.getElementById('ai-settings-status');

    saveKeyBtn?.addEventListener('click', () => {
      if (customKeyInput) {
        const val = customKeyInput.value.trim();
        this.navigator.setCustomApiKey(val);
        if (keyStatus) {
          keyStatus.textContent = val ? 'Kunci kustom tersimpan di browser.' : 'Kunci kustom dihapus (kembali ke kunci server gratis).';
          keyStatus.style.color = '#10b981';
          setTimeout(() => {
            if (keyStatus) keyStatus.textContent = '';
          }, 3000);
        }
      }
    });

    // Global shortcut: Alt + A
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.setOpen(false);
      }
    });

    // Prevent map click propagation
    this.containerEl?.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.containerEl?.addEventListener('wheel', (e) => e.stopPropagation());
  }

  public toggle(): boolean {
    this.setOpen(!this.isOpen);
    return this.isOpen;
  }

  public setOpen(open: boolean) {
    this.isOpen = open;
    if (this.containerEl) {
      if (open) {
        this.containerEl.classList.remove('hidden');
        this.floatingFabEl?.classList.add('ai-fab-active');
        setTimeout(() => this.inputEl?.focus(), 150);
      } else {
        this.containerEl.classList.add('hidden');
        this.floatingFabEl?.classList.remove('ai-fab-active');
      }
    }
  }

  private async handleSend() {
    if (!this.inputEl || this.isLoading) return;
    const query = this.inputEl.value.trim();
    if (!query) return;

    this.inputEl.value = '';

    // Add user message
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: query,
      timestamp: new Date()
    };
    this.messages.push(userMsg);

    this.isLoading = true;
    this.renderMessages();

    // Disable input while executing
    if (this.sendBtnEl) this.sendBtnEl.disabled = true;

    try {
      const res = await this.navigator.sendPrompt(query);

      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: res.reply,
        actions: res.actions,
        timestamp: new Date(),
        isError: !res.success
      };
      this.messages.push(aiMsg);
    } catch (e: any) {
      this.messages.push({
        id: String(Date.now() + 1),
        sender: 'ai',
        text: `Terjadi gangguan: ${e?.message || 'Gagal memproses perintah.'}`,
        timestamp: new Date(),
        isError: true
      });
    } finally {
      this.isLoading = false;
      if (this.sendBtnEl) this.sendBtnEl.disabled = false;
      this.renderMessages();
      this.inputEl?.focus();
    }
  }

  private renderMessages() {
    if (!this.messagesContainerEl) return;
    this.messagesContainerEl.innerHTML = '';

    this.messages.forEach((msg) => {
      const bubble = document.createElement('div');
      bubble.className = `ai-message-row ai-msg-${msg.sender}`;

      let actionBadgesHtml = '';
      if (msg.actions && msg.actions.length > 0) {
        actionBadgesHtml = msg.actions
          .map((a) => {
            let label = a.name;
            let icon = '⚡';
            if (a.name === 'flyToLocation') {
              label = `Terbang ke ${a.args.locationName || 'Lokasi'} (Pitch ${a.args.pitch || 0}°)`;
              icon = '✈️';
            } else if (a.name === 'switchBasemap') {
              label = `Basemap: ${a.args.basemapId}`;
              icon = '🗺️';
            } else if (a.name === 'toggleProjection') {
              label = `Proyeksi: ${a.args.projection === 'globe' ? '3D Globe' : '2D Mercator'}`;
              icon = '🌍';
            } else if (a.name === 'activateTool') {
              label = `Alat: ${a.args.toolName}`;
              icon = '🛠️';
            } else if (a.name === 'filterStations') {
              label = `Filter Stasiun: "${a.args.query || 'Semua'}"`;
              icon = '🌦️';
            }
            return `<div class="ai-action-badge"><span class="ai-badge-icon">${icon}</span> <span>${escapeHtml(label)}</span></div>`;
          })
          .join('');
      }

      // Convert simple markdown **bold**
      let formattedText = escapeHtml(msg.text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      bubble.innerHTML = `
        <div class="ai-bubble ${msg.isError ? 'ai-bubble-error' : ''}">
          <div class="ai-bubble-content">${formattedText}</div>
          ${actionBadgesHtml ? `<div class="ai-bubble-actions">${actionBadgesHtml}</div>` : ''}
          <div class="ai-bubble-time">${msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `;
      this.messagesContainerEl!.appendChild(bubble);
    });

    if (this.isLoading) {
      const loader = document.createElement('div');
      loader.className = 'ai-message-row ai-msg-ai ai-loading-row';
      loader.innerHTML = `
        <div class="ai-bubble ai-bubble-loading">
          <div class="ai-typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <span class="ai-thinking-text">Gemini sedang menavigasi...</span>
        </div>
      `;
      this.messagesContainerEl.appendChild(loader);
    }

    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
  }
}
