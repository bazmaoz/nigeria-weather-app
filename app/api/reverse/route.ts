import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing API key" }, { status: 500 });

  const ow = new URL("https://api.openweathermap.org/geo/1.0/reverse");
  ow.searchParams.set("lat", lat);
  ow.searchParams.set("lon", lon);
  ow.searchParams.set("limit", "1");
  ow.searchParams.set("appid", key);

  const res = await fetch(ow.toString());
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: "OpenWeather reverse geocode failed", details: data }, { status: res.status });
  }

  return NextResponse.json(data);
}
