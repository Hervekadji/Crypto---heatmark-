import { NextRequest, NextResponse } from "next/server";

// Route interne pour éviter les soucis de CORS du navigateur avec Yahoo Finance
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") || "15m";
  const range = searchParams.get("range") || "2d";

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Impossible de récupérer les données de l'or" }, { status: 500 });
  }
}
