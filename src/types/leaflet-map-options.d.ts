import 'leaflet'

declare module 'leaflet' {
  interface MapOptions {
    /** @types/leaflet 未収録（Leaflet 本体はサポート） */
    tap?: boolean
  }
}
