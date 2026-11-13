import type { TradeDemoPnl } from '../../../shared/trade-demo.mts';
import { formatGrossProfit, formatPaymentAmount } from './helpers.ts';
import './trade-demo.css';

export interface TradeDemoPnlHandle {
  render(pnl: TradeDemoPnl): void;
  reset(): void;
}

export function mountTradeDemoPnl(container: HTMLElement): TradeDemoPnlHandle {
  const root = document.createElement('div');
  root.className = 'trade-pnl-widget';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Báo cáo hiệu quả kinh doanh PnL');

  root.innerHTML = `
    <div class="trade-pnl-header">
      <div class="trade-pnl-title-group">
        <span class="trade-pnl-icon" aria-hidden="true">📊</span>
        <h3 class="trade-pnl-title">Hiệu quả kinh doanh (PnL)</h3>
      </div>
      <span class="trade-pnl-badge">USDC Testnet</span>
    </div>
    <div class="trade-pnl-body">
      <div class="trade-pnl-empty">Chưa có dữ liệu kinh doanh</div>
    </div>
  `;

  container.appendChild(root);

  const bodyEl = root.querySelector<HTMLElement>('.trade-pnl-body')!;

  function render(pnl: TradeDemoPnl): void {
    const isProfitable = pnl.grossProfit && !pnl.grossProfit.amountAtomic.startsWith('-') && pnl.grossProfit.amountAtomic !== '0';
    const grossProfitText = formatGrossProfit(pnl.grossProfit);
    const costBasisText = formatPaymentAmount(pnl.costBasis);
    const revenueText = formatPaymentAmount(pnl.revenue);
    const sponsorGasText = formatPaymentAmount(pnl.sponsorGas);

    bodyEl.innerHTML = `
      <div class="trade-pnl-grid">
        <div class="trade-pnl-metric">
          <span class="trade-pnl-label">Tồn kho NPC</span>
          <span class="trade-pnl-value font-mono">${pnl.inventoryQuantity} Dâu tây</span>
        </div>
        <div class="trade-pnl-metric">
          <span class="trade-pnl-label">Giá vốn</span>
          <span class="trade-pnl-value font-mono">${costBasisText}</span>
        </div>
        <div class="trade-pnl-metric">
          <span class="trade-pnl-label">Doanh thu</span>
          <span class="trade-pnl-value font-mono">${revenueText}</span>
        </div>
        <div class="trade-pnl-metric trade-pnl-highlight ${isProfitable ? 'is-profit' : ''}">
          <span class="trade-pnl-label">Lãi gộp</span>
          <span class="trade-pnl-value font-mono font-bold">${grossProfitText}</span>
        </div>
        <div class="trade-pnl-metric trade-pnl-sponsor">
          <span class="trade-pnl-label">Gas bảo trợ (Sponsor)</span>
          <span class="trade-pnl-value font-mono">${sponsorGasText}</span>
        </div>
      </div>
    `;
  }

  function reset(): void {
    bodyEl.innerHTML = `<div class="trade-pnl-empty">Chưa có dữ liệu kinh doanh</div>`;
  }

  return {
    render,
    reset,
  };
}
