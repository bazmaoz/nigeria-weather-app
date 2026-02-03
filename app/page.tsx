"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

type Units = "metric" | "imperial";
type Theme = "light" | "dark";

type GeoResult = {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
};

type SavedPlace = GeoResult;

function formatTimeFromUnix(dt: number) {
  return new Date(dt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDayFromUnix(dt: number) {
  return new Date(dt * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function owIconUrl(iconCode?: string, size: "sm" | "md" = "md") {
  if (!iconCode) return "";
  return `https://openweathermap.org/img/wn/${iconCode}${size === "md" ? "@2x" : ""}.png`;
}
function windLabel(units: Units, windSpeed: number) {
  if (typeof windSpeed !== "number") return "—";
  if (units === "metric") return `${(windSpeed * 3.6).toFixed(0)} km/h`;
  return `${windSpeed.toFixed(0)} mph`;
}

const SAVED_KEY = "ng_weather_saved_v1";
const THEME_KEY = "theme";

export default function Home() {
  // ---------- Theme ----------
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    } else {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      const initial: Theme = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
    }
  }, []);
  function toggleTheme() {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  }

  // ---------- App state ----------
  const [query, setQuery] = useState("Abuja,NG");
  const [units, setUnits] = useState<Units>("metric");

  const [results, setResults] = useState<GeoResult[]>([]);
  const [selected, setSelected] = useState<GeoResult | null>(null);
  const [forecast, setForecast] = useState<any>(null);

  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaflet marker icon fix (Next.js bundling)
  const [leafletReady, setLeafletReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = await import("leaflet");
        // @ts-ignore
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });
      } catch {
        // ignore
      }
      if (!cancelled) setLeafletReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load saved
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setSaved(parsed);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const locationLabel = useMemo(() => {
    if (!selected) return "No location selected";
    return `${selected.name}${selected.state ? `, ${selected.state}` : ""} — ${selected.country}`;
  }, [selected]);

  async function searchCity() {
    setLoading(true);
    setError(null);
    setForecast(null);
    setSelected(null);
    setResults([]);

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(JSON.stringify(data, null, 2));
        return;
      }
      if (!Array.isArray(data)) {
        setError(JSON.stringify(data, null, 2));
        return;
      }

      setResults(data);
      if (data.length === 0) setError("No results found. Try: Lagos,NG or Abuja,NG");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadForecast(place: GeoResult, autoSave = false) {
    setLoading(true);
    setError(null);
    setSelected(place);
    setForecast(null);

    try {
      const res = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}&units=${units}`);
      const data = await res.json();

      if (!res.ok) {
        setError(JSON.stringify(data, null, 2));
        return;
      }

      setForecast(data);

      if (autoSave) savePlace(place);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function savePlace(place: GeoResult) {
    setSaved((prev) => {
      const exists = prev.some((p) => p.lat === place.lat && p.lon === place.lon);
      if (exists) return prev;
      return [place, ...prev].slice(0, 12);
    });
  }

  function removeSaved(place: SavedPlace) {
    setSaved((prev) => prev.filter((p) => !(p.lat === place.lat && p.lon === place.lon)));
  }

  async function useMyLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }

    setLoading(true);
    setResults([]);
    setForecast(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        try {
          const revRes = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`);
          const revData = await revRes.json();

          let place: GeoResult = { name: "My location", lat, lon, country: "NG" };
          if (Array.isArray(revData) && revData[0]) {
            place = {
              name: revData[0].name ?? "My location",
              lat: revData[0].lat ?? lat,
              lon: revData[0].lon ?? lon,
              country: revData[0].country ?? "NG",
              state: revData[0].state,
            };
          }

          await loadForecast(place, true);
        } catch (e: any) {
          setError(e?.message ?? "Failed to load location weather");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        setError(err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Failed to get location.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Refetch when units change
  useEffect(() => {
    if (selected) loadForecast(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  // ---------- Normalized weather ----------
  const current = forecast?.current ?? null;
  const hourly = Array.isArray(forecast?.hourly) ? forecast.hourly.slice(0, 12) : [];
  const daily = Array.isArray(forecast?.daily) ? forecast.daily.slice(0, 7) : [];

  const temp = typeof current?.temp === "number" ? current.temp : null;
  const icon = current?.weather?.[0]?.icon as string | undefined;
  const desc =
    (current?.weather?.[0]?.description as string | undefined) ??
    (current?.weather?.[0]?.main as string | undefined) ??
    "—";

  const humidity = typeof current?.humidity === "number" ? current.humidity : null;
  const wind = typeof current?.wind_speed === "number" ? current.wind_speed : null;

  return (
    <main className={styles.container}>
      {/* HERO */}
      <div className={styles.hero}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Weather Worldwide</h1>
            <p className={styles.subtitle}>Weather Web-app Created By Abdulbasit</p>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.ghostButton} onClick={toggleTheme} title="Toggle theme">
              {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
            </button>
            <button
              className={styles.ghostButton}
              onClick={() => setUnits((u) => (u === "metric" ? "imperial" : "metric"))}
              title="Toggle units"
            >
              {units === "metric" ? "°C / km/h" : "°F / mph"}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <section className={styles.card}>
        {/* Search row */}
        <div className={styles.searchRow}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Lagos,NG or Abuja,NG"
          />
          <button className={styles.button} onClick={searchCity} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Actions */}
        <div className={styles.actionsRow}>
          <button className={styles.ghostButton} onClick={useMyLocation} disabled={loading}>
            📍 Use my location
          </button>

          {selected && (
            <button className={styles.ghostButton} onClick={() => savePlace(selected)} disabled={loading}>
              ⭐ Save city
            </button>
          )}
        </div>

        {/* Saved */}
        {saved.length > 0 && (
          <div className={styles.savedBlock}>
            <div className={styles.blockTitle}>Saved cities</div>
            <div className={styles.chips}>
              {saved.map((p) => (
                <div key={`${p.lat}-${p.lon}`} className={styles.chip}>
                  <button className={styles.chipBtn} onClick={() => loadForecast(p)} disabled={loading}>
                    {p.name}
                  </button>
                  <button className={styles.chipX} onClick={() => removeSaved(p)} title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {/* Two-column content */}
        <div className={styles.mainGrid}>
          {/* LEFT: results */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Search results</h2>
              <div className={styles.panelHint}>Click “View” to load weather</div>
            </div>

            {results.length === 0 ? (
              <div className={styles.empty}>Search a city to see results.</div>
            ) : (
              <ul className={styles.resultsList}>
                {results.map((r) => (
                  <li key={`${r.lat}-${r.lon}`} className={styles.resultItem}>
                    <div className={styles.resultMain}>
                      <div className={styles.resultTitle}>
                        {r.name}
                        {r.state ? `, ${r.state}` : ""}
                      </div>
                      <div className={styles.resultMeta}>
                        {r.country} • {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                      </div>
                    </div>
                    <button className={styles.smallBtn} onClick={() => loadForecast(r, true)} disabled={loading}>
                      View
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* RIGHT: selected details in ORDER */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Selected</h2>
              <div className={styles.panelHint}>{locationLabel}</div>
            </div>

            {/* 1) Summary card */}
            <div className={styles.detailCard}>
              <div className={styles.summaryTop}>
                <div>
                  <div className={styles.bigTemp}>
                    {temp === null ? "—" : Math.round(temp)}°{units === "metric" ? "C" : "F"}
                  </div>
                  <div className={styles.summaryDesc}>🌤️ {desc}</div>
                </div>

                {icon ? <img className={styles.icon} src={owIconUrl(icon, "md")} alt="icon" /> : null}
              </div>

              <div className={styles.statsRow}>
                <div className={styles.stat}>
                  <div className={styles.statLabel}>Humidity</div>
                  <div className={styles.statValue}>{humidity === null ? "—" : `${humidity}%`}</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statLabel}>Wind</div>
                  <div className={styles.statValue}>{wind === null ? "—" : windLabel(units, wind)}</div>
                </div>
              </div>
            </div>

            {/* 2) Map card */}
            {selected && leafletReady && (
              <div className={styles.detailCard}>
                <div className={styles.cardTitle}>Map</div>
                <div className={styles.mapWrap}>
                  <MapContainer
                    center={[selected.lat, selected.lon]}
                    zoom={11}
                    scrollWheelZoom
                    style={{ width: "100%", height: 320 }}
                  >
                    {theme === "dark" ? (
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                      />
                    ) : (
                      <TileLayer
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap contributors"
                      />
                    )}
                    <Marker position={[selected.lat, selected.lon]}>
                      <Popup>
                        {selected.name}
                        {selected.state ? `, ${selected.state}` : ""}
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>
                <div className={styles.smallNote}>Map data © OpenStreetMap contributors</div>
              </div>
            )}

            {/* 3) Hourly card */}
            <div className={styles.detailCard}>
              <div className={styles.cardTitle}>Next 12 hours</div>

              {hourly.length === 0 ? (
                <div className={styles.emptySmall}>No hourly data available.</div>
              ) : (
                <div className={styles.hourlyStrip}>
                  {hourly.map((h: any) => (
                    <div key={h.dt} className={styles.hourCard}>
                      <div className={styles.hourTime}>{formatTimeFromUnix(h.dt)}</div>
                      <div className={styles.hourMid}>
                        {h.weather?.[0]?.icon ? (
                          <img className={styles.iconSm} src={owIconUrl(h.weather?.[0]?.icon, "sm")} alt="icon" />
                        ) : (
                          <span className={styles.iconSmPlaceholder} />
                        )}
                        <div className={styles.hourTemp}>
                          {typeof h.temp === "number" ? Math.round(h.temp) : "—"}°
                        </div>
                      </div>
                      <div className={styles.hourCond}>{h.weather?.[0]?.main ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4) Daily card */}
            <div className={styles.detailCard}>
              <div className={styles.cardTitle}>Daily outlook</div>

              {daily.length === 0 ? (
                <div className={styles.emptySmall}>No daily data available.</div>
              ) : (
                <div className={styles.dailyList}>
                  {daily.map((d: any) => (
                    <div key={d.dt} className={styles.dailyRow}>
                      <div className={styles.dailyLeft}>
                        <div className={styles.dailyDay}>{formatDayFromUnix(d.dt)}</div>
                        <div className={styles.dailyMain}>{d.weather?.[0]?.main ?? "—"}</div>
                      </div>

                      <div className={styles.dailyRight}>
                        {d.weather?.[0]?.icon ? (
                          <img className={styles.iconSm} src={owIconUrl(d.weather?.[0]?.icon, "sm")} alt="icon" />
                        ) : (
                          <span className={styles.iconSmPlaceholder} />
                        )}
                        <div className={styles.dailyTemps}>
                          <span className={styles.dailyMin}>
                            {typeof d.temp?.min === "number" ? Math.round(d.temp.min) : "—"}°
                          </span>
                          <span className={styles.dailyMax}>
                            {typeof d.temp?.max === "number" ? Math.round(d.temp.max) : "—"}°
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.smallNote}>Free forecast provides ~5 days (not full 7).</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
