import type { TradeDemoPnl } from '../../../shared/trade-demo.mts';
import { formatGrossProfit, formatPaymentAmount } from './helpers.ts';
import './trade-demo.css';

export interface TradeDemoPnlHandle {
  render(pnl: TradeDemoPnl): void;
  reset(): void;
}

export function mountTradeDemoPnl(container: HTMLElement): TradeDemoPnlHandle {
  const root = document.createElement('details');
  root.className = 'trade-pnl';
  root.innerHTML = '<summary>Sổ quầy</summary><dl></dl>';
  const metrics = root.querySelector('dl')!;
  root.hidden = true;
  container.append(root);

  return {
    render(pnl) {
      const values = [
        ['Tồn kho', pnl.inventoryQuantity + ' quả dâu'],
        ['Giá vốn', formatPaymentAmount(pnl.costBasis)],
        ['Doanh thu', formatPaymentAmount(pnl.revenue)],
        ['Lãi gộp', formatGrossProfit(pnl.grossProfit)],
        ['Phí mạng đã tài trợ', formatPaymentAmount(pnl.sponsorGas)],
      ];
      metrics.replaceChildren(...values.map(([label, value]) => {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = value;
        row.append(term, description);
        return row;
      }));
      root.hidden = false;
    },
    reset() {
      root.open = false;
      root.hidden = true;
      metrics.replaceChildren();
    },
  };
}
