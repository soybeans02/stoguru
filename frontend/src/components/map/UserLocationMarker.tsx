import { Marker } from '@react-google-maps/api';
import type { GPSPosition } from '../../hooks/useGPS';

const BLUE_DOT = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="10" fill="#3b82f6" fill-opacity="0.2"/>
  <circle cx="10" cy="10" r="6" fill="white" stroke="#3b82f6" stroke-width="2"/>
  <circle cx="10" cy="10" r="4" fill="#3b82f6"/>
</svg>`;

interface Props {
  position: GPSPosition | null;
}

export function UserLocationMarker({ position }: Props) {
  if (!position) return null;

  return (
    <Marker
      position={{ lat: position.lat, lng: position.lng }}
      icon={{
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BLUE_DOT)}`,
        scaledSize: new window.google.maps.Size(20, 20),
        anchor: new window.google.maps.Point(10, 10),
      }}
      title="現在地"
      zIndex={1000}
    />
  );
}
