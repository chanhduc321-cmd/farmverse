import type { PaymentAmount } from '../../../shared/payments.mts';
import type { TradeDemoBlockReason, TradeDemoOrderStatus } from '../../../shared/trade-demo.mts';

export interface FormatAmountOptions {
  showSymbol?: boolean;
  decimalSeparator?: string;
  maxDecimals?: number;
}

/**
 * Format a PaymentAmount into a human-readable string without floating point inaccuracies.
 * Supports USDC (6 decimals), NEAR (24 decimals), or any token decimals.
 * By default uses Vietnamese comma ',' as decimal separator (e.g. 1,5 USDC).
 */
export function formatPaymentAmount(
  amount: PaymentAmount | null | undefined,
  options?: FormatAmountOptions
): string {
  if (!amount || !amount.asset) return '—';

  const showSymbol = options?.showSymbol ?? true;
  const decimalSeparator = options?.decimalSeparator ?? ',';
  const maxDecimals = options?.maxDecimals ?? 6;
  const { decimals, symbol } = amount.asset;

  const rawAtomic = amount.amountAtomic ? amount.amountAtomic.trim() : '0';
  const isNegative = rawAtomic.startsWith('-');
  const unsigned = isNegative ? rawAtomic.slice(1) : rawAtomic;

  if (!/^\d+$/.test(unsigned)) {
    return showSymbol ? `${amount.amountAtomic} ${symbol}` : amount.amountAtomic;
  }

  let formattedNum: string;
  if (decimals === 0) {
    formattedNum = unsigned;
  } else {
    const padded = unsigned.padStart(decimals + 1, '0');
    const intPart = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, '');
    let fracPart = padded.slice(padded.length - decimals);

    fracPart = fracPart.slice(0, maxDecimals).replace(/0+$/, '');
    formattedNum = fracPart.length > 0 ? `${intPart}${decimalSeparator}${fracPart}` : intPart;
  }

  const sign = isNegative ? '-' : '';
  const valueStr = `${sign}${formattedNum}`;
  return showSymbol ? `${valueStr} ${symbol}` : valueStr;
}

/**
 * Format gross profit with explicit '+' sign for positive amounts, '-' for negative,
 * or em-dash '—' when null as specified in T-62.
 */
export function formatGrossProfit(
  grossProfit: PaymentAmount | null | undefined,
  options?: FormatAmountOptions
): string {
  if (!grossProfit) return '—';

  const rawAtomic = grossProfit.amountAtomic ? grossProfit.amountAtomic.trim() : '0';
  const isNegative = rawAtomic.startsWith('-');
  const isZero = rawAtomic === '0' || /^0+$/.test(rawAtomic);

  const formatted = formatPaymentAmount(grossProfit, options);
  if (isZero || isNegative) {
    return formatted;
  }
  return `+${formatted}`;
}

export function getUnavailableReasonText(reason: TradeDemoBlockReason | null | undefined): string {
  switch (reason) {
    case 'WALLET_NOT_READY':
      return 'Ví chưa sẵn sàng hoặc đang khởi tạo. Vui lòng chờ trong giây lát.';
    case 'INSUFFICIENT_USDC':
      return 'Số dư USDC không đủ để hoàn tất giao dịch.';
    case 'NPC_INSUFFICIENT_USDC':
      return 'NPC hiện chưa đủ USDC để thu mua sản phẩm.';
    case 'ITEM_RESERVED':
      return 'Vật phẩm đang được giữ bởi một giao dịch khác.';
    default:
      return 'Hiện không thể thực hiện giao dịch này.';
  }
}

export function getOrderStatusText(status: TradeDemoOrderStatus): string {
  switch (status) {
    case 'awaiting_approval':
      return 'Chờ người dùng xác nhận giao dịch';
    case 'processing':
      return 'Hệ thống đang xử lý giao dịch';
    case 'verifying':
      return 'Đang xác minh giao dịch trên blockchain';
    case 'succeeded':
      return 'Giao dịch thành công';
    case 'failed':
      return 'Giao dịch thất bại';
    case 'cancelled':
      return 'Giao dịch đã bị hủy';
    case 'expired':
      return 'Yêu cầu giao dịch đã hết hạn';
    default:
      return status;
  }
}

export function truncateAccountId(accountId: string | null | undefined, keep = 6): string {
  if (!accountId) return '—';
  if (accountId.length <= keep * 2 + 3) return accountId;
  return `${accountId.slice(0, keep)}...${accountId.slice(-keep)}`;
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    }).format(date);
  } catch {
    return isoString;
  }
}
