"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

// Fix default marker icons in bundlers like Next.js
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type Props = {
  lat: number;
  lon: number;
  label: string;
};

export default function WeatherMap({ lat, lon, label }: Props) {
  const center = useMemo<[number, number]>(() => [lat, lon], [lat, lon]);

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom
      style={{ width: "100%", height: 320, borderRadius: 18 }}
    >
      <TileLayer
        // OpenStreetMap standard tiles
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        // Required attribution for OSM
        attribution='&copy; OpenStreetMap contributors'
      />
      <Marker position={center} icon={markerIcon}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}
