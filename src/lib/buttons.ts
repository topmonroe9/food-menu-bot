// telegram lets a bot pick one of three button colors, "" keeps the client's default look
export const BUTTON_STYLES = ["", "primary", "success", "danger"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export function toButtonStyle(value: unknown): ButtonStyle {
  return BUTTON_STYLES.includes(value as ButtonStyle) ? (value as ButtonStyle) : "";
}
