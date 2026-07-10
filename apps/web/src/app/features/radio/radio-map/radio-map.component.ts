import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
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
  @Output() readonly locationSelected = new EventEmitter<SelectedLocation>();

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
      this.marker ??= new maplibregl.Marker({ color: '#14b8a6' });
      this.marker.setLngLat(event.lngLat).addTo(map);
      this.locationSelected.emit(location);
    });
  }

  ngOnDestroy(): void {
    this.marker?.remove();
    this.map?.remove();
  }
}
