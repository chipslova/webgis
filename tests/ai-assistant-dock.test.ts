// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIAssistantDockUI } from '../src/ui/ai-assistant-dock';
import { AINavigator } from '../src/tools/ai-navigator';
describe('AIAssistantDockUI Component & Button Interactivity', () => {
  let mockNavigator: any;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="map" style="width: 800px; height: 600px;"></div>
      <button id="btn-ai-assistant">AI Copilot</button>
    `;
    mockNavigator = {
      sendPrompt: vi.fn().mockResolvedValue({
        success: true,
        reply: 'Halo! Lapisan telah diaktifkan.',
        actions: [
          { name: 'toggleLayer', args: { layerId: 'precipitation' } },
          { name: 'flyToLocation', args: { locationName: 'Bromo', latitude: -7.942, longitude: 112.953, zoom: 13, pitch: 60 } }
        ]
      }),
      executeAction: vi.fn().mockResolvedValue(undefined),
      getCustomApiKey: vi.fn().mockReturnValue(''),
      setCustomApiKey: vi.fn()
    };
    new AIAssistantDockUI(mockNavigator as unknown as AINavigator);
  });
  it('should initialize FAB and Dock in DOM with proper button types', () => {
    const fab = document.getElementById('ai-floating-fab') as HTMLButtonElement;
    expect(fab).not.toBeNull();
    expect(fab.tagName.toLowerCase()).toBe('button');
    expect(fab.type).toBe('button');
    const dock = document.getElementById('ai-assistant-dock');
    expect(dock).not.toBeNull();
    expect(dock?.classList.contains('hidden')).toBe(true);
    const sendBtn = document.getElementById('ai-dock-send-btn') as HTMLButtonElement;
    expect(sendBtn).not.toBeNull();
    expect(sendBtn.type).toBe('submit');
  });
  it('should toggle dock visibility when FAB is clicked', () => {
    const fab = document.getElementById('ai-floating-fab') as HTMLButtonElement;
    const dock = document.getElementById('ai-assistant-dock') as HTMLElement;
    expect(dock.classList.contains('hidden')).toBe(true);
    fab.click();
    expect(dock.classList.contains('hidden')).toBe(false);
    fab.click();
    expect(dock.classList.contains('hidden')).toBe(true);
  });
  it('should trigger handleSend when suggestion chip is clicked', async () => {
    const chip = document.querySelector('.ai-suggestion-chip') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    chip.click();
    expect(mockNavigator.sendPrompt).toHaveBeenCalledTimes(1);
  });
  it('should trigger handleSend when send button is clicked with input query', async () => {
    const input = document.getElementById('ai-dock-input') as HTMLInputElement;
    const sendBtn = document.getElementById('ai-dock-send-btn') as HTMLButtonElement;
    input.value = 'Tampilkan citra satelit';
    sendBtn.click();
    expect(mockNavigator.sendPrompt).toHaveBeenCalledWith('Tampilkan citra satelit', expect.any(Array));
  });
  it('should shake input wrapper and focus input when send is clicked while empty', () => {
    const input = document.getElementById('ai-dock-input') as HTMLInputElement;
    const sendBtn = document.getElementById('ai-dock-send-btn') as HTMLButtonElement;
    const wrapper = input.closest('.ai-dock-input-wrapper');
    input.value = '   ';
    sendBtn.click();
    expect(mockNavigator.sendPrompt).not.toHaveBeenCalled();
    expect(wrapper?.classList.contains('ai-input-shake')).toBe(true);
  });
  it('should render action badges as interactive buttons and re-execute action on click', async () => {
    const input = document.getElementById('ai-dock-input') as HTMLInputElement;
    const sendBtn = document.getElementById('ai-dock-send-btn') as HTMLButtonElement;
    input.value = 'Aktifkan curah hujan';
    await sendBtn.click();
    // Allow promise resolution
    await new Promise((r) => setTimeout(r, 50));
    const badges = document.querySelectorAll<HTMLButtonElement>('.ai-action-badge');
    expect(badges.length).toBe(2);
    expect(badges[0].tagName.toLowerCase()).toBe('button');
    expect(badges[0].type).toBe('button');
    expect(badges[0].textContent).toContain('Lapisan: Curah Hujan Harian');
    expect(badges[1].tagName.toLowerCase()).toBe('button');
    expect(badges[1].textContent).toContain('Terbang ke Bromo');
    // Click first badge (toggleLayer)
    await badges[0].click();
    expect(mockNavigator.executeAction).toHaveBeenCalledWith({
      name: 'toggleLayer',
      args: { layerId: 'precipitation' }
    });
    // Click second badge (flyToLocation)
    await badges[1].click();
    expect(mockNavigator.executeAction).toHaveBeenCalledWith({
      name: 'flyToLocation',
      args: { locationName: 'Bromo', latitude: -7.942, longitude: 112.953, zoom: 13, pitch: 60 }
    });
  });
});