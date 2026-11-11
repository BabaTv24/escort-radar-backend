/**
 * Server-side switches for paid features whose service is not delivered yet.
 * They are deliberately code constants, not environment flags: a feature may be sold only
 * after its implementation ships, so enabling it is a reviewed code change.
 */

/** No signaling, WebRTC transport, TURN or call session exists yet. Never charge for a call attempt. */
export const VIDEO_CHAT_IMPLEMENTED = false;

/**
 * The communication_plus entitlement is not consumed by chat, video or booking yet.
 * New purchases stay closed until it unlocks a real benefit; existing entitlements remain visible.
 */
export const COMMUNICATION_PLUS_SALES_ENABLED = false;
