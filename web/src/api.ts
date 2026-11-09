import type {
  CropVariant,
  FarmPlot,
  FarmSnapshot,
  FarmResponse,
  HarvestResponse,
  PlotActionRequest,
  QuickSellRequest,
  FarmErrorCode,
  FarmErrorResponse,
} from '../../shared/farm.mts';

export type {
  CropVariant,
  FarmPlot,
  FarmSnapshot,
  FarmResponse,
  HarvestResponse,
  PlotActionRequest,
  QuickSellRequest,
  FarmErrorCode,
  FarmErrorResponse,
};

export class ApiError extends Error {
  public status: number;
  public code?: FarmErrorCode;

  constructor(status: number, message: string, code?: FarmErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const LOCAL_STORAGE_KEY = 'farmverse_mock_farm_snapshot';

class FarmApiClient {
  private useMock: boolean;
  private mockSnapshot: FarmSnapshot | null = null;

  constructor() {
    // Mock only runs if explicitly selected via URL query parameter (?mock=1 or ?mode=mock)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      this.useMock = params.get('mock') === '1' || params.get('mode') === 'mock';
    } else {
      this.useMock = false;
    }
  }

  public isUsingMock(): boolean {
    return this.useMock;
  }

  public setMode(mode: 'live' | 'mock'): void {
    this.useMock = mode === 'mock';
  }

  public async getFarm(): Promise<FarmSnapshot> {
    if (this.useMock) {
      return this.getMockFarm();
    }

    const res = await this.fetchWithCredentials('/api/farm');
    if (!res.ok) {
      throw await this.parseError(res);
    }

    const data = (await res.json()) as FarmResponse;
    return data.farm;
  }

  public async plant(plotId: number, expectedRevision: number): Promise<FarmSnapshot> {
    if (this.useMock) {
      return this.mockPlant(plotId, expectedRevision);
    }

    const body: PlotActionRequest = { plotId, expectedRevision };
    const res = await this.fetchWithCredentials('/api/farm/plant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    const data = (await res.json()) as FarmResponse;
    return data.farm;
  }

  public async harvest(
    plotId: number,
    expectedRevision: number
  ): Promise<{ farm: FarmSnapshot; harvested: CropVariant }> {
    if (this.useMock) {
      return this.mockHarvest(plotId, expectedRevision);
    }

    const body: PlotActionRequest = { plotId, expectedRevision };
    const res = await this.fetchWithCredentials('/api/farm/harvest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    const data = (await res.json()) as HarvestResponse;
    return { farm: data.farm, harvested: data.harvested };
  }

  public async quickSell(crop: CropVariant, expectedRevision: number): Promise<FarmSnapshot> {
    if (this.useMock) {
      return this.mockQuickSell(crop, expectedRevision);
    }

    const body: QuickSellRequest = { crop, expectedRevision };
    const res = await this.fetchWithCredentials('/api/farm/quick-sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    const data = (await res.json()) as FarmResponse;
    return data.farm;
  }

  public async unlock(plotId: number, expectedRevision: number): Promise<FarmSnapshot> {
    if (this.useMock) {
      return this.mockUnlock(plotId, expectedRevision);
    }

    const body: PlotActionRequest = { plotId, expectedRevision };
    const res = await this.fetchWithCredentials('/api/farm/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    const data = (await res.json()) as FarmResponse;
    return data.farm;
  }

  public resetMockSession(): FarmSnapshot {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    this.mockSnapshot = null;
    return this.getMockFarm();
  }

  private async fetchWithCredentials(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(input, {
        ...init,
        credentials: 'include',
      });
    } catch {
      throw new ApiError(0, 'Không thể kết nối đến máy chủ API (Kiểm tra backend)');
    }
  }

  private async parseError(res: Response): Promise<ApiError> {
    try {
      const data = (await res.json()) as FarmErrorResponse;
      if (data?.error?.message) {
        return new ApiError(res.status, data.error.message, data.error.code);
      }
    } catch {
      // Body not JSON
    }
    return new ApiError(res.status, `Lỗi yêu cầu (${res.status})`);
  }

  // --- Explicit Mock Local Simulation (Used ONLY when ?mock=1 or ?mode=mock) ---

  private getMockFarm(): FarmSnapshot {
    if (!this.mockSnapshot) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          this.mockSnapshot = JSON.parse(saved);
        } catch {
          this.mockSnapshot = null;
        }
      }
    }

    if (!this.mockSnapshot) {
      this.mockSnapshot = {
        revision: 0,
        serverTimeMs: Date.now(),
        gold: 0,
        silo: {
          capacity: 10,
          counts: { NORMAL: 0, GOLDEN: 0 },
        },
        quickSellPriceGold: { NORMAL: 10, GOLDEN: 30 },
        plots: [
          { id: 1, state: 'EMPTY' },
          { id: 2, state: 'EMPTY' },
          { id: 3, state: 'LOCKED', unlockCostGold: 20 },
          { id: 4, state: 'LOCKED', unlockCostGold: 20 },
          { id: 5, state: 'LOCKED', unlockCostGold: 20 },
          { id: 6, state: 'LOCKED', unlockCostGold: 20 },
        ],
      };
      this.saveMock();
    }

    this.mockSnapshot.serverTimeMs = Date.now();
    this.updateMockGrowth();
    return this.mockSnapshot;
  }

  private updateMockGrowth(): void {
    if (!this.mockSnapshot) return;
    const now = this.mockSnapshot.serverTimeMs;
    for (let i = 0; i < this.mockSnapshot.plots.length; i++) {
      const plot = this.mockSnapshot.plots[i];
      if (plot.state === 'GROWING' && now >= plot.readyAtMs) {
        this.mockSnapshot.plots[i] = {
          id: plot.id,
          state: 'READY',
        };
      }
    }
  }

  private mockPlant(plotId: number, _expectedRevision: number): FarmSnapshot {
    const farm = this.getMockFarm();
    const idx = farm.plots.findIndex((p) => p.id === plotId);
    if (idx === -1) throw new ApiError(404, 'Plot not found', 'PLOT_NOT_FOUND');
    const plot = farm.plots[idx];
    if (plot.state !== 'EMPTY') {
      throw new ApiError(409, 'Plot is not empty', 'PLOT_NOT_EMPTY');
    }

    farm.plots[idx] = {
      id: plotId,
      state: 'GROWING',
      readyAtMs: Date.now() + 10_000,
    };
    farm.revision++;
    this.saveMock();
    return farm;
  }

  private mockHarvest(
    plotId: number,
    _expectedRevision: number
  ): { farm: FarmSnapshot; harvested: CropVariant } {
    const farm = this.getMockFarm();
    const idx = farm.plots.findIndex((p) => p.id === plotId);
    if (idx === -1) throw new ApiError(404, 'Plot not found', 'PLOT_NOT_FOUND');
    const plot = farm.plots[idx];
    if (plot.state !== 'READY') {
      throw new ApiError(409, 'Plot is not ready', 'PLOT_NOT_READY');
    }

    const currentTotal = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
    if (currentTotal >= farm.silo.capacity) {
      throw new ApiError(409, 'Silo is at full capacity', 'SILO_FULL');
    }

    const isGolden = Math.random() < 0.1;
    const harvested: CropVariant = isGolden ? 'GOLDEN' : 'NORMAL';

    farm.silo.counts[harvested]++;
    farm.plots[idx] = {
      id: plotId,
      state: 'EMPTY',
    };
    farm.revision++;
    this.saveMock();
    return { farm, harvested };
  }

  private mockQuickSell(crop: CropVariant, _expectedRevision: number): FarmSnapshot {
    const farm = this.getMockFarm();
    if (farm.silo.counts[crop] <= 0) {
      throw new ApiError(409, 'Crop not available in silo', 'CROP_UNAVAILABLE');
    }

    farm.silo.counts[crop]--;
    farm.gold += farm.quickSellPriceGold[crop];
    farm.revision++;
    this.saveMock();
    return farm;
  }

  private mockUnlock(plotId: number, _expectedRevision: number): FarmSnapshot {
    const farm = this.getMockFarm();
    const idx = farm.plots.findIndex((p) => p.id === plotId);
    if (idx === -1) throw new ApiError(404, 'Plot not found', 'PLOT_NOT_FOUND');
    const plot = farm.plots[idx];
    if (plot.state !== 'LOCKED') {
      throw new ApiError(409, 'Plot is not locked', 'PLOT_NOT_LOCKED');
    }

    if (farm.gold < plot.unlockCostGold) {
      throw new ApiError(409, 'Insufficient gold', 'INSUFFICIENT_GOLD');
    }

    farm.gold -= plot.unlockCostGold;
    farm.plots[idx] = {
      id: plotId,
      state: 'EMPTY',
    };
    farm.revision++;
    this.saveMock();
    return farm;
  }

  private saveMock(): void {
    if (this.mockSnapshot) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.mockSnapshot));
    }
  }
}

export const farmApi = new FarmApiClient();
