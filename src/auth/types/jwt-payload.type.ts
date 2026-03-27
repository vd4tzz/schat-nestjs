export interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
  iat?: number;
  exp?: number;
}
