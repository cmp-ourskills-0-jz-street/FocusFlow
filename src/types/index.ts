// Type definitions for BrainBit data

export interface SensorInfo {
  name: string;
  address: string;
  serial_number: string;
  battery?: number;
  state?: string;
}

export interface SensorListItem {
  index: number;
  name: string;
  address: string;
  serial_number: string;
}

export interface SignalData {
  O1: number;
  O2: number;
  T3: number;
  T4: number;
}

export interface ResistData {
  O1: number;
  O2: number;
  T3: number;
  T4: number;
}

export interface StatusData {
  type: string;
  state?: string;
  battery?: number;
}

export interface EmotionsData {
  rel_relaxation?: number;
  rel_attention?: number;
  inst_relaxation?: number;
  inst_attention?: number;
  calibration_percent?: number;
  is_both_sides_artifacted?: boolean;
  is_sequence_artifacted?: boolean;
}

export interface WebSocketMessage {
  type: 'signal' | 'resist' | 'status' | 'emotions' | 'pong';
  data: SignalData[] | ResistData | StatusData | EmotionsData;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  sensors?: SensorListItem[];
  count?: number;
  sensor_info?: SensorInfo;
}

export type DataStreamType = 'signal' | 'resist' | 'spectrum' | 'emotions';
