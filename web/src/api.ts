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

import type {
  MerchantStatus,
  MerchantSide,
  MerchantOfferBlockReason,
  MerchantOffer,
  MerchantRecoveryEvent,
  MerchantSnapshot,
  MerchantResponse,
  MerchantOfferRequest,
  MerchantActionResponse,
  MerchantErrorCode,
  MerchantErrorResponse,
} from '../../shared/merchant.mts';

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
  MerchantStatus,
  MerchantSide,
  MerchantOfferBlockReason,
  MerchantOffer,
  MerchantRecoveryEvent,
  MerchantSnapshot,
  MerchantResponse,
  MerchantOfferRequest,
  MerchantActionResponse,
  MerchantErrorCode,
  MerchantErrorResponse,
};

export class ApiError extends Error {
  public status: number;
  public code?: FarmErrorCode | MerchantErrorCode;

  constructor(status: number, message: string, code?: FarmErrorCode | MerchantErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const LOCAL_STORAGE_FARM_KEY = 'farmverse_mock_farm_snapshot';
const LOCAL_STORAGE_MERCHANT_KEY = 'farmverse_mock_merchant_snapshot';

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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_FARM_KEY);
      localStorage.removeItem(LOCAL_STORAGE_MERCHANT_KEY);
    }
    this.mockSnapshot = null;
    return this.getMockFarm();
  }

  public getMockSnapshotDirect(): FarmSnapshot {
    return this.getMockFarm();
  }

  public saveMockDirect(farm: FarmSnapshot): void {
    this.mockSnapshot = farm;
    this.saveMock();
  }

  private async fetchWithCredentials(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
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
      const saved = localStorage.getItem(LOCAL_STORAGE_FARM_KEY);
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
      readyAtMs: Date.now() + 10000,
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
      throw new ApiError(409, 'Crop is not ready to harvest', 'PLOT_NOT_READY');
    }

    const totalSilo = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
    if (totalSilo >= farm.silo.capacity) {
      throw new ApiError(409, 'Silo is full (10/10)', 'SILO_FULL');
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
      throw new ApiError(409, `No ${crop} crops in silo to sell`, 'CROP_UNAVAILABLE');
    }

    const price = farm.quickSellPriceGold[crop];
    farm.silo.counts[crop]--;
    farm.gold += price;
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
      localStorage.setItem(LOCAL_STORAGE_FARM_KEY, JSON.stringify(this.mockSnapshot));
    }
  }
}

class MerchantApiClient {
  private useMock: boolean;
  private mockSnapshot: MerchantSnapshot | null = null;

  constructor() {
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

  public async getMerchantState(): Promise<MerchantResponse> {
    if (this.useMock) {
      return this.getMockMerchantState();
    }

    const res = await this.fetchWithCredentials('/api/merchant');
    if (!res.ok) {
      throw await this.parseError(res);
    }

    return (await res.json()) as MerchantResponse;
  }

  public async acceptOffer(
    offerId: string,
    expectedRevision: number,
    expectedMerchantRevision: number
  ): Promise<MerchantActionResponse> {
    if (this.useMock) {
      return this.mockAcceptOffer(offerId, expectedRevision, expectedMerchantRevision);
    }

    const body: MerchantOfferRequest = {
      offerId,
      expectedRevision,
      expectedMerchantRevision,
    };
    const res = await this.fetchWithCredentials('/api/merchant/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    return (await res.json()) as MerchantActionResponse;
  }

  public async rejectOffer(
    offerId: string,
    expectedRevision: number,
    expectedMerchantRevision: number
  ): Promise<MerchantActionResponse> {
    if (this.useMock) {
      return this.mockRejectOffer(offerId, expectedRevision, expectedMerchantRevision);
    }

    const body: MerchantOfferRequest = {
      offerId,
      expectedRevision,
      expectedMerchantRevision,
    };
    const res = await this.fetchWithCredentials('/api/merchant/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res);
    }

    return (await res.json()) as MerchantActionResponse;
  }

  private async fetchWithCredentials(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        credentials: 'include',
      });
    } catch {
      throw new ApiError(0, 'Không thể kết nối đến máy chủ API (Kiểm tra backend)');
    }
  }

  private async parseError(res: Response): Promise<ApiError> {
    try {
      const data = (await res.json()) as MerchantErrorResponse;
      if (data?.error?.message) {
        return new ApiError(res.status, data.error.message, data.error.code);
      }
    } catch {
      // Body not JSON
    }
    return new ApiError(res.status, `Lỗi yêu cầu merchant (${res.status})`);
  }

  // --- Mock Simulation ---
  public getMockMerchantState(): MerchantResponse {
    const farm = farmApi.getMockSnapshotDirect();
    if (!this.mockSnapshot) {
      const saved = localStorage.getItem(LOCAL_STORAGE_MERCHANT_KEY);
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
        status: 'ACTIVE',
        goldBudget: 200,
        referenceBudget: 300,
        inventory: { capacity: 10, counts: { NORMAL: 3, GOLDEN: 1 } },
        demand: 5,
        sellFailStreak: 0,
        grantUsed: false,
        isSelfSustaining: true,
        pricing: { buyMultiplier: 1.5, sellMultiplier: 1.5 },
        cooldownUntilMs: null,
        nextOfferAtMs: null,
        offers: [],
        recoveryEvents: [],
      };
    }

    const now = Date.now();
    // Clear expired cooldown
    if (this.mockSnapshot.cooldownUntilMs && now >= this.mockSnapshot.cooldownUntilMs) {
      this.mockSnapshot.cooldownUntilMs = null;
    }

    // Clear expired offers
    if (this.mockSnapshot.offers.length > 0 && this.mockSnapshot.offers[0].expiresAtMs <= now) {
      this.mockSnapshot.offers = [];
    }

    // Generate a new mock offer if none active and not on cooldown
    if (!this.mockSnapshot.cooldownUntilMs && this.mockSnapshot.offers.length === 0) {
      const mInv = this.mockSnapshot.inventory.counts;
      const mInvTotal = mInv.NORMAL + mInv.GOLDEN;
      const pSiloTotal = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;

      // Choose side: alternate between BUY and SELL when conditions allow
      const canSell = mInvTotal > 0 && farm.gold >= 30 && pSiloTotal < farm.silo.capacity;
      const isSell = canSell && this.mockSnapshot.revision % 2 === 1;

      if (isSell) {
        // NPC SELLS to player (C02 anti-arbitrage price: Normal 30G, Golden 90G)
        const crop: CropVariant = mInv.GOLDEN > 0 && farm.gold >= 90 ? 'GOLDEN' : 'NORMAL';
        const price = crop === 'GOLDEN' ? 90 : 30;
        this.mockSnapshot.offers = [
          {
            id: `mock-offer-${Date.now()}`,
            side: 'SELL',
            crop,
            quantity: 1,
            currency: 'GOLD',
            priceGold: price,
            expiresAtMs: now + 20000,
            canAccept: true as true,
            unavailableReason: null,
          },
        ];
      } else {
        // NPC BUYS from player (Normal 15G, Golden 25G)
        const offerCrop: CropVariant = farm.silo.counts.GOLDEN > 0 ? 'GOLDEN' : 'NORMAL';
        const price = offerCrop === 'GOLDEN' ? 25 : 15;
        this.mockSnapshot.offers = [
          {
            id: `mock-offer-${Date.now()}`,
            side: 'BUY',
            crop: offerCrop,
            quantity: 1,
            currency: 'GOLD',
            priceGold: price,
            expiresAtMs: now + 20000,
            canAccept: true as true,
            unavailableReason: null,
          },
        ];
      }

      this.mockSnapshot.revision++;
      this.saveMock();
    }

    // BUG-09: Dynamically re-evaluate canAccept and unavailableReason against current snapshot
    if (this.mockSnapshot.offers.length > 0) {
      const offer = this.mockSnapshot.offers[0];
      const mInvTotal = this.mockSnapshot.inventory.counts.NORMAL + this.mockSnapshot.inventory.counts.GOLDEN;
      const pSiloTotal = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;

      if (offer.side === 'BUY') {
        const hasCrop = farm.silo.counts[offer.crop] > 0;
        const hasBudget = this.mockSnapshot.goldBudget >= offer.priceGold;
        const hasSpace = mInvTotal < this.mockSnapshot.inventory.capacity;

        if (!hasCrop) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'CROP_UNAVAILABLE';
        } else if (!hasBudget) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'MERCHANT_INSUFFICIENT_GOLD';
        } else if (!hasSpace) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'MERCHANT_FULL';
        } else {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = true;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = null;
        }
      } else {
        // SELL
        const mHasCrop = this.mockSnapshot.inventory.counts[offer.crop] > 0;
        const pHasGold = farm.gold >= offer.priceGold;
        const pHasSpace = pSiloTotal < farm.silo.capacity;

        if (!mHasCrop) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'MERCHANT_CROP_UNAVAILABLE';
        } else if (!pHasGold) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'INSUFFICIENT_GOLD';
        } else if (!pHasSpace) {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = false;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = 'SILO_FULL';
        } else {
          (offer as { canAccept: boolean; unavailableReason: string | null }).canAccept = true;
          (offer as { canAccept: boolean; unavailableReason: string | null }).unavailableReason = null;
        }
      }
    }

    return {
      farm,
      merchant: this.mockSnapshot,
    };
  }

  private mockAcceptOffer(
    offerId: string,
    expectedRevision: number,
    expectedMerchantRevision: number
  ): MerchantActionResponse {
    const state = this.getMockMerchantState();
    const farm = state.farm;
    const merchant = state.merchant;

    if (farm.revision !== expectedRevision) {
      throw new ApiError(409, 'Trạng thái Farm không khớp', 'STALE_FARM');
    }
    if (merchant.revision !== expectedMerchantRevision) {
      throw new ApiError(409, 'Trạng thái Thương nhân không khớp', 'STALE_MERCHANT');
    }

    const offerIdx = merchant.offers.findIndex((o) => o.id === offerId);
    if (offerIdx === -1) {
      throw new ApiError(404, 'Báo giá không tìm thấy', 'OFFER_NOT_FOUND');
    }

    const offer = merchant.offers[offerIdx];
    if (Date.now() > offer.expiresAtMs) {
      throw new ApiError(409, 'Báo giá đã hết hạn', 'OFFER_NOT_ACTIVE');
    }

    if (offer.side === 'BUY') {
      if (farm.silo.counts[offer.crop] <= 0) {
        throw new ApiError(409, 'Bạn không có nông sản này', 'CROP_UNAVAILABLE');
      }
      if (merchant.goldBudget < offer.priceGold) {
        throw new ApiError(409, 'Thương nhân không đủ GOLD', 'MERCHANT_INSUFFICIENT_GOLD');
      }
      farm.silo.counts[offer.crop]--;
      farm.gold += offer.priceGold;
      merchant.goldBudget -= offer.priceGold;
      merchant.inventory.counts[offer.crop]++;
    } else {
      if (merchant.inventory.counts[offer.crop] <= 0) {
        throw new ApiError(409, 'Thương nhân không còn nông sản này', 'MERCHANT_CROP_UNAVAILABLE');
      }
      if (farm.gold < offer.priceGold) {
        throw new ApiError(409, 'Bạn không đủ GOLD', 'INSUFFICIENT_GOLD');
      }
      const totalSilo = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
      if (totalSilo >= farm.silo.capacity) {
        throw new ApiError(409, 'Kho Silo của bạn đã đầy (10/10)', 'SILO_FULL');
      }
      farm.gold -= offer.priceGold;
      farm.silo.counts[offer.crop]++;
      merchant.inventory.counts[offer.crop]--;
      merchant.goldBudget += offer.priceGold;
    }

    farm.revision++;
    merchant.revision++;
    merchant.offers = [];
    merchant.cooldownUntilMs = Date.now() + 5000;

    farmApi.saveMockDirect(farm);
    this.saveMock();

    return {
      farm,
      merchant,
      resolvedOffer: { id: offerId, status: 'ACCEPTED' },
    };
  }

  private mockRejectOffer(
    offerId: string,
    _expectedRevision: number,
    expectedMerchantRevision: number
  ): MerchantActionResponse {
    const state = this.getMockMerchantState();
    const farm = state.farm;
    const merchant = state.merchant;

    if (merchant.revision !== expectedMerchantRevision) {
      throw new ApiError(409, 'Trạng thái Thương nhân không khớp', 'STALE_MERCHANT');
    }

    const offerIdx = merchant.offers.findIndex((o) => o.id === offerId);
    if (offerIdx === -1) {
      throw new ApiError(404, 'Báo giá không tìm thấy', 'OFFER_NOT_FOUND');
    }

    merchant.offers = [];
    merchant.sellFailStreak++;
    merchant.revision++;
    merchant.cooldownUntilMs = Date.now() + 5000;
    this.saveMock();

    return {
      farm,
      merchant,
      resolvedOffer: { id: offerId, status: 'REJECTED' },
    };
  }

  private saveMock(): void {
    if (this.mockSnapshot) {
      localStorage.setItem(LOCAL_STORAGE_MERCHANT_KEY, JSON.stringify(this.mockSnapshot));
    }
  }
}

export const farmApi = new FarmApiClient();
export const merchantApi = new MerchantApiClient();
