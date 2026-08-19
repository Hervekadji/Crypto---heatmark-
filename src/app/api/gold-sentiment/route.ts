import { NextResponse } from "next/server";

// Cache en mémoire pour respecter la limite gratuite Myfxbook (100 requêtes/24h)
let cachedSession: string | null = null;
let cachedOutlook: any = null;
let lastFetch = 0;
const CACHE_MS = 15 * 60 * 1000; // 15 minutes

async function login(): Promise<string | null> {
  const email = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) return null;

  const res = await fetch(
    `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(
      email
    )}&password=${encodeURIComponent(password)}`
  );
  const data = await res.json();
  if (data.error) return null;
  return data.session;
}

export async function GET() {
  const now = Date.now();

  if (cachedOutlook && now - lastFetch < CACHE_MS) {
    return NextResponse.json(cachedOutlook);
  }

  try {
    if (!cachedSession) {
      cachedSession = await login();
    }
    if (!cachedSession) {
      return NextResponse.json({ error: "Identifiants Myfxbook manquants ou invalides" }, { status: 401 });
    }

    let res = await fetch(
      `https://www.myfxbook.com/api/get-community-outlook.json?session=${cachedSession}&symbols=XAUUSD`
    );
    let data = await res.json();

    // Session expirée -> on se reconnecte une fois
    if (data.error) {
      cachedSession = await login();
      res = await fetch(
        `https://www.myfxbook.com/api/get-community-outlook.json?session=${cachedSession}&symbols=XAUUSD`
      );
      data = await res.json();
    }

    if (data.error) {
      return NextResponse.json({ error: data.message || "Erreur Myfxbook" }, { status: 500 });
    }

    const symbolData = data.symbols?.[0] || null;
    cachedOutlook = symbolData;
    lastFetch = now;

    return NextResponse.json(symbolData);
  } catch (e) {
    return NextResponse.json({ error: "Erreur réseau Myfxbook" }, { status: 500 });
  }
}
