export interface Recipient {
  phone: string;
  name: string;
}

export interface MessageJobData {
  blastId: string;
  sessionId: string;
  message: string;
  recipient: Recipient;
  media?: {
    buffer: Buffer;
    mimetype: string;
    filename: string;
  }
}

export interface FileProcessJobData {
  blastId: string;
  sessionId: string;
  message: string;
  filePath: string;
  campaignId?: string;
  media?: {
    buffer: Buffer;
    mimetype: string;
    filename: string;
  };
}

export interface SessionConfig {
  id: string;
  friendlyName: string;
  businessUnit?: string;
}

export type SessionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AWAITING_QR'
  | 'CONNECTING'
  | 'LOGGED_OUT'
  | 'TIMEOUT';

export interface SessionState {
  id: string;
  status: SessionStatus;
}
