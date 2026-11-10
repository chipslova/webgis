// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ColumnMapperModalUI } from '../src/ui/column-mapper-modal';
import { DataPanelUI } from '../src/ui/data-panel';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { SidebarUI } from '../src/ui/sidebar';
import { TrainingSampler } from '../src/tools/training-sampler';

describe('ColumnMapperModalUI & DataPanelUI Subtabs', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="subtab-btn-layers" class="data-hub-tab-btn active"></div>
      <div id="subtab-btn-training" class="data-hub-tab-btn"></div>
      <div id="subtab-content-layers" style="display: block;"></div>
      <div id="subtab-content-training" style="display: none;"></div>
      <div id="layers-list"></div>
      <div id="training-class-list"></div>
      <div id="training-total-badge"></div>
      <div id="training-samples-list"></div>
      <div id="sampling-active-banner"></div>
      <button id="btn-toggle-sampling-mode"></button>
      <span id="label-sampling-mode"></span>
      <button id="btn-add-custom-class"></button>
      <button id="btn-reset-classes"></button>
      <button id="btn-export-samples-csv"></button>
      <button id="btn-export-samples-xlsx"></button>
      <button id="btn-export-samples-geojson"></button>
      <button id="btn-clear-all-samples"></button>
      <input type="file" id="file-geojson-input" />
      <div id="geojson-dropzone"></div>
      <button id="btn-quick-import"></button>
      <button id="btn-load-sample"></button>
    `;
  });

  it('should initialize ColumnMapperModalUI and render DOM correctly', () => {
    const modal = new ColumnMapperModalUI();
    const modalEl = document.getElementById('column-mapper-modal');
    expect(modalEl).not.toBeNull();
    expect(modalEl?.classList.contains('hidden')).toBe(true);

    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    modal.show({
      fileName: 'survey_2026.xlsx',
      fileType: 'excel',
      totalRows: 50,
      columns: ['coord_y', 'coord_x', 'label_tutupan'],
      previewRows: [
        { coord_y: -6.2, coord_x: 106.8, label_tutupan: 'Hutan' }
      ],
      detectedLatCol: 'coord_y',
      detectedLonCol: 'coord_x',
      detectedClassCol: 'label_tutupan',
      onConfirm,
      onCancel
    });

    expect(modalEl?.classList.contains('hidden')).toBe(false);
    expect(modalEl?.innerHTML).toContain('survey_2026.xlsx');
    expect(modalEl?.innerHTML).toContain('coord_y');
    expect(modalEl?.innerHTML).toContain('coord_x');

    // Simulate clicking cancel
    const cancelBtn = modalEl?.querySelector<HTMLButtonElement>('#btn-cancel-mapper');
    cancelBtn?.click();
    expect(onCancel).toHaveBeenCalled();
    expect(modalEl?.classList.contains('hidden')).toBe(true);
  });

  it('should submit mapped column configurations when form is submitted', () => {
    const modal = new ColumnMapperModalUI();
    const onConfirm = vi.fn();

    modal.show({
      fileName: 'custom_gps.csv',
      fileType: 'csv',
      totalRows: 10,
      columns: ['Y_POS', 'X_POS', 'TIPE'],
      previewRows: [{ Y_POS: -7.0, X_POS: 110.0, TIPE: 'Air' }],
      detectedLatCol: 'Y_POS',
      detectedLonCol: 'X_POS',
      detectedClassCol: 'TIPE',
      onConfirm
    });

    const form = document.querySelector<HTMLFormElement>('#column-mapper-form');
    expect(form).not.toBeNull();

    // Set select values in happy-dom
    const latSelect = document.getElementById('mapper-lat-select') as HTMLSelectElement;
    const lonSelect = document.getElementById('mapper-lon-select') as HTMLSelectElement;
    const classSelect = document.getElementById('mapper-class-select') as HTMLSelectElement;
    if (latSelect) latSelect.value = 'Y_POS';
    if (lonSelect) lonSelect.value = 'X_POS';
    if (classSelect) classSelect.value = 'TIPE';

    // Trigger form submit
    form?.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(onConfirm).toHaveBeenCalledWith({
      latCol: 'Y_POS',
      lonCol: 'X_POS',
      targetCrs: 'EPSG:4326',
      sheetName: undefined,
      classCol: 'TIPE',
      isTrainingSample: true
    });
  });

  it('should switch between subtabs in DataPanelUI', () => {
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getSource: vi.fn(),
      getLayer: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} }))
    };

    const loader = new GeoJsonLoader(mockMap);
    const sidebar = new SidebarUI();
    const sampler = new TrainingSampler();

    const dataPanel = new DataPanelUI(
      loader,
      sidebar,
      vi.fn(),
      undefined,
      sampler
    );

    expect(dataPanel.getActiveSubtab()).toBe('layers');

    dataPanel.switchSubtab('training');
    expect(dataPanel.getActiveSubtab()).toBe('training');
    const contentTraining = document.getElementById('subtab-content-training');
    expect(contentTraining?.style.display).toBe('block');

    dataPanel.switchSubtab('layers');
    expect(dataPanel.getActiveSubtab()).toBe('layers');
    const contentLayers = document.getElementById('subtab-content-layers');
    expect(contentLayers?.style.display).toBe('block');
  });
});
