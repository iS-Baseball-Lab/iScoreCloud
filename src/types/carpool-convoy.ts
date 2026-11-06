// filepath: src/types/carpool-convoy.ts

export type ConvoyDirection = "outbound" | "return";

export type ConvoyVehicleStatus = "moving" | "jam" | "rest" | "arrived";

export interface ConvoyVehicleLiveState {
  carpoolId: string;
  direction: ConvoyDirection;
  isSharing: boolean;
  status: ConvoyVehicleStatus;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  senderName: string | null;
  updatedAt: number;
}

export interface ConvoyTargetLocationInfo {
  name: string;
  address: string | null;
  mapUrl: string | null;
  directionsTarget: string;
  latitude: number | null;
  longitude: number | null;
  parkingInfo: string | null;
}

export interface ConvoyAvailableEventOption {
  eventId: string;
  title: string;
  dateLabel: string;
  carCount: number;
}

export interface ConvoySnapshotResponse {
  success: boolean;
  isDemo: boolean;
  eventId: string | null;
  direction: ConvoyDirection;
  serverTime: number;
  googleMapsApiKey: string | null;
  googleMapsKeySource: "env" | "org" | "none";
  canConfigureMapsKey: boolean;
  myAssignedCarpoolId: string | null;
  myDisplayName: string | null;
  destination: ConvoyTargetLocationInfo | null;
  gatherPoint: ConvoyTargetLocationInfo | null;
  states: Record<string, ConvoyVehicleLiveState>;
}

export interface ConvoyLocationUpdatePayload {
  teamId: string;
  eventId: string;
  carpoolId: string;
  direction: ConvoyDirection;
  isSharing: boolean;
  status: ConvoyVehicleStatus;
  latitude?: number | null;
  longitude?: number | null;
  heading?: number | null;
  speedKmh?: number | null;
  accuracyM?: number | null;
  clearLocation?: boolean;
  userId?: string | null;
  userName?: string | null;
}

