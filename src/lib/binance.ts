export type OrderBookLevel = { price: number; qty: number };

export async function fetchOrderBook(symbol: string) {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=500`
  );
  const data = await res.json();
  const bids: OrderBookLevel[] = data.bids.map((b: string[]) => ({
    price: parseFloat(b[0]),
    qty: parseFloat(b[1]),
  }));
  const asks: OrderBookLevel[] = data.asks.map((a: string[]) => ({
    price: parseFloat(a[0]),
    qty: parseFloat(a[1]),
  }));
  return { bids, asks };
}

export async function fetchOpenInterest(symbol: string) {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`
  );
  const data = await res.json();
  return parseFloat(data.openInterest);
}

export async function fetchFundingRate(symbol: string) {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`
  );
  const data = await res.json();
  return {
    fundingRate: parseFloat(data.lastFundingRate),
    markPrice: parseFloat(data.markPrice),
  };
}
