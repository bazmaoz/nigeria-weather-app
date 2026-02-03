import { NextResponse } from "next/server";

function startOfDayUnix(dt: number) {
  const d = new Date(dt * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const units = searchParams.get("units") || "metric";

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  // ✅ FREE endpoints
  const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
  currentUrl.searchParams.set("lat", lat);
  currentUrl.searchParams.set("lon", lon);
  currentUrl.searchParams.set("units", units);
  currentUrl.searchParams.set("appid", key);

  const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
  forecastUrl.searchParams.set("lat", lat);
  forecastUrl.searchParams.set("lon", lon);
  forecastUrl.searchParams.set("units", units);
  forecastUrl.searchParams.set("appid", key);

  const [currentRes, forecastRes] = await Promise.all([
    fetch(currentUrl.toString(), { cache: "no-store" }),
    fetch(forecastUrl.toString(), { cache: "no-store" }),
  ]);

  const currentData = await currentRes.json();
  const forecastData = await forecastRes.json();

  if (!currentRes.ok) {
    return NextResponse.json(
      { error: "Current weather fetch failed", details: currentData },
      { status: currentRes.status }
    );
  }

  if (!forecastRes.ok) {
    return NextResponse.json(
      { error: "Forecast fetch failed", details: forecastData },
      { status: forecastRes.status }
    );
  }

  // -----------------------------
  // Normalize into One-Call-like shape
  // -----------------------------
  const current = {
    dt: currentData?.dt,
    temp: currentData?.main?.temp,
    feels_like: currentData?.main?.feels_like,
    humidity: currentData?.main?.humidity,
    wind_speed: currentData?.wind?.speed,
    weather: currentData?.weather ?? [],
  };

  // Hourly-ish: OpenWeather gives 3-hour steps. Use next 12 hours ≈ next 4 items.
  const list = Array.isArray(forecastData?.list) ? forecastData.list : [];
  const hourly = list.slice(0, 12).map((item: any) => ({
    dt: item?.dt,
    temp: item?.main?.temp,
    weather: item?.weather ?? [],
  }));

  // Daily aggregation (forecast only covers ~5 days)
  // Group items by day and compute min/max + pick a representative condition (midday if possible)
  const byDay = new Map<number, any[]>();
  for (const item of list) {
    const dayKey = startOfDayUnix(item.dt);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey)!.push(item);
  }

  const daily = Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, 7) // max 7 but free data usually yields 5 days
    .map(([dayDt, items]) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;

      for (const it of items) {
        const t = it?.main?.temp;
        if (typeof t === "number") {
          if (t < min) min = t;
          if (t > max) max = t;
        }
      }

      // Prefer 12:00 item if present for icon/condition, else take first
      const noon = items.find((it) => {
        const d = new Date(it.dt * 1000);
        return d.getHours() === 12;
      });
      const rep = noon ?? items[0];

      return {
        dt: dayDt,
        temp: {
          min: Number.isFinite(min) ? min : null,
          max: Number.isFinite(max) ? max : null,
        },
        weather: rep?.weather ?? [],
      };
    });

  return NextResponse.json({
    current,
    hourly,
    daily,
    source: "free_current+5day_forecast",
  });
}
