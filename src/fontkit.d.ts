declare module "fontkit" {
  export interface Font {
    name?: {
      records?: Record<number, string | Record<string, string>>;
    };
    "OS/2"?: {
      achVendID?: string;
    };
  }

  export function create(buffer: Buffer | Uint8Array): Font;
}