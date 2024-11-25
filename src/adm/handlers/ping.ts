/** Input and output types are manually aligned to the actual API */
export default function pingHandler({ echo }: { echo: string }): string {
  return `pong ${echo}`;
}
