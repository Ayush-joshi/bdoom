import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import * as maplibregl from 'maplibre-gl';
import { Map, Marker } from 'maplibre-gl';
import { environment } from '../../../../environments/environment';
import { SelectedLocation } from '../models/radio-station.model';

@Component({
  selector: 'app-radio-map',
  standalone: true,
  template: `<div #mapContainer class="radio-map" aria-label="Interactive world radio map"></div>`,
})
export class RadioMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') private readonly mapContainer?: ElementRef<HTMLDivElement>;
  @Output() readonly locationSelected = new EventEmitter<{ location: SelectedLocation; zoom: number }>();

  private _radius = 100;
  @Input() set radius(value: number) {
    this._radius = value;
    this.updateCircle();
  }
  get radius(): number {
    return this._radius;
  }

  private _location: SelectedLocation | null = null;
  @Input() set location(value: SelectedLocation | null) {
    this._location = value;
    this.updateCircle();
  }
  get location(): SelectedLocation | null {
    return this._location;
  }

  private map?: Map;
  private marker?: Marker;

  ngAfterViewInit(): void {
    if (!this.mapContainer) {
      return;
    }
    const map = new maplibregl.Map({
      container: this.mapContainer.nativeElement,
      style: environment.mapStyleUrl,
      center: [12, 22],
      zoom: 1.25,
      minZoom: 1,
      attributionControl: {},
    });
    this.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    
    map.on('click', (event) => {
      const location = {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      };
      this.locationSelected.emit({ location, zoom: map.getZoom() });
    });

    map.on('load', () => {
      this.updateCircle();
    });
  }

  ngOnDestroy(): void {
    this.marker?.remove();
    this.map?.remove();
  }

  private updateCircle(): void {
    if (!this.map || !this.map.isStyleLoaded() || !this._location) {
      return;
    }

    const lngLat = { lng: this._location.longitude, lat: this._location.latitude };
    
    if (this.marker) {
      this.marker.setLngLat(lngLat);
    } else {
      this.marker = new maplibregl.Marker({ color: '#14b8a6' });
      this.marker.setLngLat(lngLat).addTo(this.map);
    }

    const circleGeoJson = createGeoJsonCircle([this._location.longitude, this._location.latitude], this._radius);
    const source = this.map.getSource('radius-circle') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(circleGeoJson);
    } else {
      this.map.addSource('radius-circle', {
        type: 'geojson',
        data: circleGeoJson,
      });
      this.map.addLayer({
        id: 'radius-circle-fill',
        type: 'fill',
        source: 'radius-circle',
        layout: {},
        paint: {
          'fill-color': '#14b8a6',
          'fill-opacity': 0.15,
        },
      });
      this.map.addLayer({
        id: 'radius-circle-outline',
        type: 'line',
        source: 'radius-circle',
        layout: {},
        paint: {
          'line-color': '#14b8a6',
          'line-width': 2,
          'line-opacity': 0.5,
        },
      });
    }
  }
}

function createGeoJsonCircle(center: [number, number], radiusKm: number, points = 64): any {
  const coords = [];
  const distanceX = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]); // Close polygon

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {},
  };
}
