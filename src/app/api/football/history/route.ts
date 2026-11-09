import { footballErrorResponse } from "@/lib/football/http";
import { FootballProviderError } from "@/lib/football/provider";
import { evaluateProviderForecasts, pythonServiceConfigured } from "@/lib/football/python-client";
import { getForecastHistory } from "@/lib/football/storage";

export async function GET() {
  try {
    const records = (await getForecastHistory()).filter(({ forecast }) => forecast.provider === "API-Football");
    if (!pythonServiceConfigured()) {
      return Response.json({
        records,
        evaluation: null,
        evaluationMessage: "Forecast evaluation is unavailable because the hosted Python service is not configured.",
      }, { headers: { "Cache-Control": "no-store" } });
    }
    try {
      const evaluation = await evaluateProviderForecasts(records);
      return Response.json({ records, evaluation, evaluationMessage: null }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!(error instanceof FootballProviderError)) throw error;
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
