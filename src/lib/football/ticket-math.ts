import { FootballProviderError } from "./errors";

export function calculateTicketPayout(stake: number, prices: number[]) {
  if (!Number.isFinite(stake) || stake < 1 || stake > 100_000 || prices.length < 1 || prices.length > 10 || prices.some(price => !Number.isFinite(price) || price < 1.01 || price > 1000)) throw new FootballProviderError("Use a ZAR stake from 1 to 100000 and one to ten valid decimal prices.", 400);
  const stakeZar = Math.round(stake * 100) / 100;
  const combinedOdds = prices.reduce((total, price) => total * price, 1);
  if (combinedOdds > 1_000_000_000) throw new FootballProviderError("Combined odds exceed the supported limit.", 400);
  if (stakeZar * combinedOdds * 100 > Number.MAX_SAFE_INTEGER) throw new FootballProviderError("The potential payout exceeds the supported cent-precision range.", 400);
  const potentialReturnZar = Math.round(stakeZar * combinedOdds * 100) / 100;
  const potentialProfitZar = Math.round((potentialReturnZar - stakeZar) * 100) / 100;
  return { stakeZar, combinedOdds, potentialReturnZar, potentialProfitZar };
}

