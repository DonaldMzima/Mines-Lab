import { footballErrorResponse } from "@/lib/football/http";
import { FootballAnalysisError } from "@/lib/football/analysis";
import { evaluateProviderForecasts } from "@/lib/football/analysis";
import { getForecastHistory } from "@/lib/football/storage";

export async function GET() {
  try {
    const records = (await getForecastHistory()).filter(({ forecast }) => forecast.provider === "API-Football");
    try {
      const evaluation = evaluateProviderForecasts(records);
      return Response.json({ records, evaluation, evaluationMessage: null }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!(error instanceof FootballAnalysisError)) throw error;
      return Response.json({
        records,
        evaluation: null,
        evaluationMessage: `Forecast evaluation is unavailable: ${error.message}`,
      }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    return footballErrorResponse(error);
  }
}
