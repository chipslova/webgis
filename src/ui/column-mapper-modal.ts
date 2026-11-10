// Modal Pemetaan Kolom Interaktif (Interactive Column Mapper Modal)
// Menangani pemetaan koordinat (Lat/Lon atau UTM) & label kelas sampel latih
import { escapeHtml } from '../utils/sanitize';

export interface ColumnMapperRequest {
  fileName: string;
  fileType: 'excel' | 'csv' | 'parquet';
  totalRows: number;
  columns: string[];
  previewRows: Record<string, any>[];
  detectedLatCol?: string;
  detectedLonCol?: string;
  detectedClassCol?: string;
  sheets?: string[];
  selectedSheet?: string;
  onConfirm: (result: ColumnMappingConfirmResult) => void;
  onCancel?: () => void;
}

export interface ColumnMappingConfirmResult {
  sheetName?: string;
  latCol: string;
  lonCol: string;
  classCol?: string;
  targetCrs: string;
  isTrainingSample: boolean;
}

export class ColumnMapperModalUI {
  private modalEl: HTMLElement | null = null;
  private currentRequest: ColumnMapperRequest | null = null;

  constructor() {
    this.initDOM();
  }

  private initDOM() {
    let el = document.getElementById('column-mapper-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'column-mapper-modal';
      el.className = 'column-mapper-overlay hidden';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'column-mapper-title');
      document.body.appendChild(el);
    }
    this.modalEl = el;
  }

  public show(request: ColumnMapperRequest) {
    this.currentRequest = request;
    if (!this.modalEl) return;

    const { fileName, fileType, totalRows, columns, previewRows, detectedLatCol, detectedLonCol, detectedClassCol, sheets, selectedSheet } = request;

    const typeBadges: Record<string, string> = {
      excel: '<span class="badge" style="background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.4);">Excel (XLSX)</span>',
      csv: '<span class="badge" style="background: rgba(59,130,246,0.2); color: #60a5fa; border: 1px solid rgba(59,130,246,0.4);">CSV / TSV</span>',
      parquet: '<span class="badge" style="background: rgba(168,85,247,0.2); color: #c084fc; border: 1px solid rgba(168,85,247,0.4);">GeoParquet</span>'
    };

    // Build Table Preview
    let tableHeaderHtml = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
    let tableRowsHtml = previewRows.slice(0, 3).map((row) => {
      const cells = columns.map((col) => `<td>${escapeHtml(String(row[col] ?? ''))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const hasSheets = sheets && sheets.length > 1;

    this.modalEl.innerHTML = `
      <div class="column-mapper-dialog">
        <div class="column-mapper-header">
          <div>
            <h3 id="column-mapper-title" style="margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <span>📍 Pemetaan Kolom Geospasial</span>
              ${typeBadges[fileType] || ''}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-muted, #94a3b8);">
              Berkas: <strong>${escapeHtml(fileName)}</strong> (${totalRows} baris data ditemukan)
            </p>
          </div>
          <button id="btn-close-mapper" class="close-btn" aria-label="Tutup Dialog">✕</button>
        </div>

        <div class="column-mapper-body">
          <div style="font-size: 12px; color: var(--text-muted, #94a3b8); margin-bottom: 8px;">
            👀 Pratinjau 3 Baris Teratas Berkas:
          </div>
          <div class="column-mapper-table-container">
            <table class="column-mapper-table">
              <thead><tr>${tableHeaderHtml}</tr></thead>
              <tbody>${tableRowsHtml}</tbody>
            </table>
          </div>

          <form id="column-mapper-form" class="column-mapper-form" style="margin-top: 16px; display: grid; gap: 12px;">
            ${hasSheets ? `
            <div class="form-group">
              <label for="mapper-sheet-select" style="font-size: 12px; font-weight: 500; display: block; margin-bottom: 4px;">Pilih Sheet Excel:</label>
              <select id="mapper-sheet-select" class="form-select" style="width: 100%; padding: 8px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); color: #fff;">
                ${sheets.map((s) => `<option value="${escapeHtml(s)}" ${s === selectedSheet ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
              </select>
            </div>
            ` : ''}

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label for="mapper-lat-select" style="font-size: 12px; font-weight: 500; display: block; margin-bottom: 4px;">
                  🌐 Kolom Lintang / Y (Latitude):
                </label>
                <select id="mapper-lat-select" class="form-select" style="width: 100%; padding: 8px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); color: #fff;" required>
                  <option value="" disabled ${!detectedLatCol ? 'selected' : ''}>-- Pilih Kolom Lintang --</option>
                  ${columns.map((c) => `<option value="${escapeHtml(c)}" ${c === detectedLatCol ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="mapper-lon-select" style="font-size: 12px; font-weight: 500; display: block; margin-bottom: 4px;">
                  🌐 Kolom Bujur / X (Longitude):
                </label>
                <select id="mapper-lon-select" class="form-select" style="width: 100%; padding: 8px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); color: #fff;" required>
                  <option value="" disabled ${!detectedLonCol ? 'selected' : ''}>-- Pilih Kolom Bujur --</option>
                  ${columns.map((c) => `<option value="${escapeHtml(c)}" ${c === detectedLonCol ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="mapper-crs-select" style="font-size: 12px; font-weight: 500; display: block; margin-bottom: 4px;">
                📐 Sistem Referensi Koordinat (CRS):
              </label>
              <select id="mapper-crs-select" class="form-select" style="width: 100%; padding: 8px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); color: #fff;">
                <option value="EPSG:4326" selected>WGS 84 (Derajat Desimal: Lintang/Bujur)</option>
                <optgroup label="Zona UTM Indonesia (Selatan Equator)">
                  <option value="EPSG:32748">UTM Zona 48S (Jawa Barat, Jakarta, Lampung, Sumsel)</option>
                  <option value="EPSG:32749">UTM Zona 49S (Jawa Tengah, DIY, Jatim Barat, Kalsel)</option>
                  <option value="EPSG:32750">UTM Zona 50S (Jatim Timur, Madura, Bali, NTB, Kaltim)</option>
                  <option value="EPSG:32751">UTM Zona 51S (NTT, Sulsel, Sulbar, Sulteng)</option>
                  <option value="EPSG:32752">UTM Zona 52S (Maluku, Sultra, Malut)</option>
                  <option value="EPSG:32753">UTM Zona 53S (Papua Barat Daya, Fakfak)</option>
                  <option value="EPSG:32754">UTM Zona 54S (Papua, Merauke, Jayapura)</option>
                </optgroup>
                <optgroup label="Zona UTM Indonesia (Utara Equator)">
                  <option value="EPSG:32646">UTM Zona 46N (Aceh Barat, Sabang)</option>
                  <option value="EPSG:32647">UTM Zona 47N (Sumut, Riau Daratan)</option>
                  <option value="EPSG:32648">UTM Zona 48N (Kepri, Batam, Bintan)</option>
                  <option value="EPSG:32649">UTM Zona 49N (Kalbar Utara, Natuna)</option>
                  <option value="EPSG:32650">UTM Zona 50N (Kaltara, Nunukan, Tarakan)</option>
                  <option value="EPSG:32651">UTM Zona 51N (Sulut, Gorontalo)</option>
                  <option value="EPSG:32652">UTM Zona 52N (Morotai, Halmahera Utara)</option>
                </optgroup>
              </select>
            </div>

            <!-- Training Sample Toggle Section -->
            <div class="mapper-training-box" style="padding: 10px; border-radius: 8px; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25);">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: #93c5fd;">
                <input type="checkbox" id="mapper-is-training-sample" ${detectedClassCol ? 'checked' : ''} />
                <span>🎯 Jadikan Titik Sampel Latih (Training Sample Ground Truth)</span>
              </label>

              <div id="mapper-class-wrapper" style="margin-top: 8px; display: ${detectedClassCol ? 'block' : 'none'};">
                <label for="mapper-class-select" style="font-size: 11px; color: var(--text-muted, #94a3b8); display: block; margin-bottom: 4px;">
                  Pilih Kolom Label / Kelas Sampel Tutupan Lahan:
                </label>
                <select id="mapper-class-select" class="form-select" style="width: 100%; padding: 6px 8px; font-size: 12px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); color: #fff;">
                  <option value="">-- Buat / Gunakan Kelas Default --</option>
                  ${columns.map((c) => `<option value="${escapeHtml(c)}" ${c === detectedClassCol ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="column-mapper-actions" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
              <button type="button" id="btn-cancel-mapper" class="btn btn-secondary" style="padding: 8px 14px; font-size: 12px;">Batal</button>
              <button type="submit" id="btn-apply-mapper" class="btn btn-primary" style="padding: 8px 16px; font-size: 12px; background: #3b82f6; color: #fff; font-weight: 600; border: none; border-radius: 6px; cursor: pointer;">
                🚀 Terapkan &amp; Muat ke Peta
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
    this.modalEl.classList.remove('hidden');
  }

  public hide() {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
    this.currentRequest = null;
  }

  private bindEvents() {
    if (!this.modalEl) return;

    const closeBtn = this.modalEl.querySelector('#btn-close-mapper');
    const cancelBtn = this.modalEl.querySelector('#btn-cancel-mapper');
    const form = this.modalEl.querySelector('#column-mapper-form') as HTMLFormElement | null;
    const isTrainingSampleCheckbox = this.modalEl.querySelector('#mapper-is-training-sample') as HTMLInputElement | null;
    const classWrapper = this.modalEl.querySelector('#mapper-class-wrapper') as HTMLElement | null;

    closeBtn?.addEventListener('click', () => {
      this.currentRequest?.onCancel?.();
      this.hide();
    });

    cancelBtn?.addEventListener('click', () => {
      this.currentRequest?.onCancel?.();
      this.hide();
    });

    isTrainingSampleCheckbox?.addEventListener('change', () => {
      if (classWrapper) {
        classWrapper.style.display = isTrainingSampleCheckbox.checked ? 'block' : 'none';
      }
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const latSelect = this.modalEl?.querySelector('#mapper-lat-select') as HTMLSelectElement | null;
      const lonSelect = this.modalEl?.querySelector('#mapper-lon-select') as HTMLSelectElement | null;
      const crsSelect = this.modalEl?.querySelector('#mapper-crs-select') as HTMLSelectElement | null;
      const sheetSelect = this.modalEl?.querySelector('#mapper-sheet-select') as HTMLSelectElement | null;
      const classSelect = this.modalEl?.querySelector('#mapper-class-select') as HTMLSelectElement | null;
      const isTrainingSample = isTrainingSampleCheckbox?.checked ?? false;

      const latCol = latSelect?.value || '';
      const lonCol = lonSelect?.value || '';
      const targetCrs = crsSelect?.value || 'EPSG:4326';
      const sheetName = sheetSelect?.value;
      const classCol = isTrainingSample ? (classSelect?.value || undefined) : undefined;

      if (!latCol || !lonCol) {
        alert('Silakan pilih kolom Lintang (Y) dan Bujur (X).');
        return;
      }

      this.currentRequest?.onConfirm({
        latCol,
        lonCol,
        targetCrs,
        sheetName,
        classCol,
        isTrainingSample
      });

      this.hide();
    });
  }
}

let columnMapperInstance: ColumnMapperModalUI | null = null;
export function getColumnMapperModal(): ColumnMapperModalUI {
  if (!columnMapperInstance) {
    columnMapperInstance = new ColumnMapperModalUI();
  }
  return columnMapperInstance;
}

