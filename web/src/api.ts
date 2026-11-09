import type {
  CropVariant,
  FarmPlot,
  FarmSnapshot,
  FarmResponse,
  HarvestResponse,
  PlotActionRequest,
  QuickSellRequest,
} from '../../shared/farm.mts';

export type {
  CropVariant,
  FarmPlot,
  FarmSnapshot,
  FarmResponse,
  HarvestResponse,
  PlotActionRequest,
  QuickSellRequest,
};

const LOCAL_STORAGE_KEY = 'farmverse_mock_farm_snapshot';

class FarmApiClient {
  private useMock = false;
  private mockSnapshot: FarmSnapshot | null = null;

  public isUsingMock(): boolean {
    return this.useMock;
  }

  public async getFarm(): Promise<FarmSnapshot> {
    try {
      const res = await fetch('/api/farm', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as FarmResponse;
        this.useMock = false;
        return data.farm;
      }
    } catch {
      // Server not reachable
    }

    // Fallback to local simulation conforming strictly to shared/farm.mts
    this.useMock = true;
    return this.getMockFarm();
  }

  public async plant(plotId: number, expectedRevision: number): Promise<FarmSnapshot> {
    if (!this.useMock) {
      try {
        const body: PlotActionRequest = { plotId, expectedRevision };
        const res = await fetch('/api/farm/plant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = (await res.json()) as FarmResponse;
          return data.farm;
        }
      } catch {
        // Fallback
      }
    }

    return this.mockPlant(plotId, expectedRevision);
  }

  public async harvest(
    plotId: number,
    expectedRevision: number
  ): Promise<{ farm: FarmSnapshot; harvested: CropVariant }> {
    if (!this.useMock) {
      try {
        const body: PlotActionRequest = { plotId, expectedRevision };
        const res = await fetch('/api/farm/harvest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = (await res.json()) as HarvestResponse;
          return { farm: data.farm, harvested: data.harvested };
        }
      } catch {
        // Fallback
      }
    }

    return this.mockHarvest(plotId, expectedRevision);
  }

  public async quickSell(crop: CropVariant, expectedRevision: number): Promise<FarmSnapshot> {
    if (!this.useMock) {
      try {
        const body: QuickSellRequest = { crop, expectedRevision };
        const res = await fetch('/api/farm/quick-sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = (await res.json()) as FarmResponse;
          return data.farm;
        }
      } catch {
        // Fallback
      }
    }

    return this.mockQuickSell(crop, expectedRevision);
  }

  public async unlock(plotId: number, expectedRevision: number): Promise<FarmSnapshot> {
    if (!this.useMock) {
      try {
        const body: PlotActionRequest = { plotId, expectedRevision };
        const res = await fetch('/api/farm/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = (await res.json()) as FarmResponse;
          return data.farm;
        }
      } catch {
        // Fallback
      }
    }

    return this.mockUnlock(plotId, expectedRevision);
  }

  public resetMockSession(): FarmSnapshot {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    this.mockSnapshot = null;
    return this.getMockFarm();
  }

  // --- Mock Local Simulation (Strictly mirrors C01 and shared/farm.mts) ---

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
        revision: 1,
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
          { id: 4, state: 'LOCKED', unlockCostGold: 50 },
          { id: 5, state: 'LOCKED', unlockCostGold: 100 },
          { id: 6, state: 'LOCKED', unlockCostGold: 200 },
        ],
      };
      this.saveMock();
    }

    // Update server time & derive growing -> ready
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
    if (idx === -1) return farm;
    const plot = farm.plots[idx];
    if (plot.state !== 'EMPTY') {
      return farm;
    }

    farm.plots[idx] = {
      id: plotId,
      state: 'GROWING',
      readyAtMs: Date.now() + 10_000, // 10s grow time
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
    if (idx === -1) throw new Error('PLOT_NOT_FOUND');
    const plot = farm.plots[idx];
    if (plot.state !== 'READY') {
      throw new Error('PLOT_NOT_READY');
    }

    const currentTotal = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
    if (currentTotal >= farm.silo.capacity) {
      throw new Error('SILO_FULL');
    }

    // 90% normal, 10% golden
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
      throw new Error('CROP_UNAVAILABLE');
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
    if (idx === -1) throw new Error('PLOT_NOT_FOUND');
    const plot = farm.plots[idx];
    if (plot.state !== 'LOCKED') {
      throw new Error('PLOT_NOT_LOCKED');
    }

    if (farm.gold < plot.unlockCostGold) {
      throw new Error('INSUFFICIENT_GOLD');
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
