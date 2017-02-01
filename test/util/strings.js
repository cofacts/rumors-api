/* eslint import/prefer-default-export: off */

export function truncate(text, size = 25) {
  text = JSON.stringify(text);
  if (text.length > size - 3) return `${text.slice(0, size - 3)}...`;
  return text;
}
