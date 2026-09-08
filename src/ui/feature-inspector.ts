export class FeatureInspectorUI {
  private cardEl: HTMLElement | null;
  private titleEl: HTMLElement | null;
  private contentEl: HTMLElement | null;

  constructor() {
    this.cardEl = document.getElementById('feature-inspector');
    this.titleEl = document.getElementById('inspector-layer-name');
    this.contentEl = document.getElementById('inspector-content');
    this.bindEvents();
  }

  private bindEvents() {
    const closeBtn = document.getElementById('inspector-close-btn');

    closeBtn?.addEventListener('click', () => {
      this.close();
    });

    // Escape key closes feature inspector modal
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.cardEl && this.cardEl.style.display !== 'none') {
        this.close();
      }
    });
  }

  public show(properties: Record<string, any>, layerName: string) {
    if (!this.cardEl || !this.titleEl || !this.contentEl) return;

    this.titleEl.innerText = `Layer: ${layerName}`;

    let rowsHtml = '<table class="inspector-table">';
    for (const [k, v] of Object.entries(properties)) {
      rowsHtml += `
        <tr>
          <td class="prop-key">${k}</td>
          <td class="prop-val">${typeof v === 'object' ? JSON.stringify(v) : v}</td>
        </tr>
      `;
    }
    rowsHtml += '</table>';

    this.contentEl.innerHTML = rowsHtml;
    this.cardEl.style.display = 'flex';
  }

  public close() {
    if (this.cardEl) {
      this.cardEl.style.display = 'none';
    }
  }
}
