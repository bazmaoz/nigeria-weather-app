import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "Missing city query" }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key missing" }, { status: 500 });
  }

  const ow = new URL("https://api.openweathermap.org/geo/1.0/direct");
  ow.searchParams.set("q", q);
  ow.searchParams.set("limit", "5");
  ow.searchParams.set("appid", key);

  const res = await fetch(ow.toString());
  const data = await res.json();

  return NextResponse.json(data);
}
