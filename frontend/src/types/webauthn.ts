import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

export type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON };

export interface WebAuthnCredential {
  id: string;
  credentialId: string;
  friendlyName: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  transports: string[];
}

export interface RegisterCredentialResult {
  credentialId: string;
  friendlyName: string | null;
}
