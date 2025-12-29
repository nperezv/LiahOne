declare module "jsonwebtoken" {
  export function sign(payload: any, secret: string, options?: any): string;
  export function verify(token: string, secret: string, options?: any): any;
}

declare module "nodemailer" {
  export function createTransport(options?: any): any;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}

declare module "geoip-lite" {
  export function lookup(ip: string): { country?: string } | null;
}

declare module "web-push";
