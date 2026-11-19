import { BcvRateState } from '../types';

export const FALLBACK_BCV_RATE = 915.75;

/**
 * Fetches official BCV USD/VES rate.
 * Checks DolarVzla (current.usd) and DolarAPI (promedio) and picks the freshest
 * published BCV figure so it stays aligned with the current official BCV rate.
 */
export async function fetchOfficialBcvRate(): Promise<BcvRateState> {
  const candidates: Array<{
    rate: number;
    date: string;
    source: string;
  }> = [];

  const fetchWithTimeout = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const [dolarVzlaData, dolarApiData] = await Promise.all([
    fetchWithTimeout('https://rates.dolarvzla.com/bcv/current.json'),
    fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial'),
  ]);

  if (dolarVzlaData) {
    const val = Number(
      dolarVzlaData?.current?.usd ??
        dolarVzlaData?.USD?.rate ??
        dolarVzlaData?.usd ??
        dolarVzlaData?.rate
    );
    if (Number.isFinite(val) && val > 10) {
      candidates.push({
        rate: Number(val.toFixed(2)),
        date: String(dolarVzlaData?.current?.date || new Date().toISOString().slice(0, 10)),
        source: `BCV Oficial (${dolarVzlaData?.current?.date || 'DolarVzla'})`,
      });
    }
  }

  if (dolarApiData) {
    const val = Number(
      dolarApiData?.promedio ?? dolarApiData?.venta ?? dolarApiData?.compra
    );
    if (Number.isFinite(val) && val > 10) {
      const datePart = String(dolarApiData?.fechaActualizacion || '').slice(0, 10);
      candidates.push({
        rate: Number(val.toFixed(2)),
        date: datePart || new Date().toISOString().slice(0, 10),
        source: `DolarAPI BCV (${datePart || 'Oficial'})`,
      });
    }
  }

  if (candidates.length > 0) {
    // Pick the entry with the most recent BCV effective date
    candidates.sort((a, b) => b.date.localeCompare(a.date));
    const best = candidates[0];
    return {
      officialRate: best.rate,
      source: best.source,
      lastUpdated: best.date,
      isLoading: false,
      isFallback: false,
    };
  }

  return {
    officialRate: FALLBACK_BCV_RATE,
    source: 'Respaldo Local BCV',
    lastUpdated: new Date().toISOString(),
    isLoading: false,
    isFallback: true,
  };
}
