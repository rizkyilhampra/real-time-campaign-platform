export interface Recipient {
  phone: string;
  name: string;
}

export interface MessageJobData {
  blastId: string;
  sessionId: string;
  message: string;
  recipient: Recipient;
}

export type SessionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AWAITING_QR'
  | 'CONNECTING';

export interface SessionState {
  id: string;
  status: SessionStatus;
}
