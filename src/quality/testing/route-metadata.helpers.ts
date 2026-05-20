import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

function normalizePath(...segments: (string | undefined)[]): string {
  const parts = segments
    .flatMap((segment) => (segment ?? '').split('/'))
    .filter((part) => part.length > 0);
  return parts.join('/');
}

export function getHandlerRoute(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
): { method: RequestMethod; path: string } {
  const handler = controllerClass.prototype[handlerName];
  const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
  const handlerPath =
    (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
  const controllerPath =
    (Reflect.getMetadata(PATH_METADATA, controllerClass) as string | undefined) ??
    '';

  return {
    method,
    path: normalizePath(controllerPath, handlerPath),
  };
}

export function expectHandlerRoute(
  controllerClass: new (...args: unknown[]) => unknown,
  handlerName: string,
  expectedMethod: RequestMethod,
  expectedPath: string,
): void {
  const { method, path } = getHandlerRoute(controllerClass, handlerName);
  expect(method).toBe(expectedMethod);
  expect(path).toBe(expectedPath);
}
