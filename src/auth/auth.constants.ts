export const JWT_EXPIRES_IN_SECONDS = 3600;

export const jwtSecret = (): string =>
  process.env.JWT_SECRET ?? 'issueflow-dev-secret';
