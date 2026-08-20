// An Express Router whose async handlers cannot take the process down with them.
//
// Express 4 does not understand a rejected promise: when an `async` handler
// throws — a dropped database connection, a malformed row, any unforeseen bug —
// nothing calls `next(err)`, so the rejection goes unhandled and Node (>=15)
// kills the process. One bad request would restart the whole service, and on a
// free host that means a cold start for everybody else.
//
// So every handler registered through this router is wrapped: its rejection is
// routed to `next()`, which lands in the central error handler in app.js and
// returns a clean localized 500 to that one request. Route files import `Router`
// from here instead of from express and are otherwise unchanged.

import { Router as ExpressRouter } from 'express';

// `use` is patched too, so async middleware is covered as well.
const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'];
const ROUTER_METHODS = [...ROUTE_METHODS, 'use'];

/** Wraps one handler; anything that is not a function (a path string) passes through. */
function wrap(fn) {
  if (typeof fn !== 'function') return fn;
  // Express identifies error handlers purely by arity, so a 4-argument handler
  // has to stay 4-argument or it silently stops being one.
  if (fn.length === 4)
    return function wrappedErrorHandler(err, req, res, next) {
      return Promise.resolve(fn.call(this, err, req, res, next)).catch(next);
    };
  return function wrappedHandler(req, res, next) {
    return Promise.resolve(fn.call(this, req, res, next)).catch(next);
  };
}

/** Replaces the given methods so every handler argument is wrapped first. */
function patch(target, methods) {
  for (const method of methods) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    target[method] = function patched(...args) {
      return original.apply(this, args.map(wrap));
    };
  }
}

export function Router(options) {
  const router = ExpressRouter(options);
  patch(router, ROUTER_METHODS);

  // `router.route('/x').get(...).post(...)` builds a separate Route object, so
  // it needs the same treatment or those handlers slip through unwrapped.
  const route = router.route.bind(router);
  router.route = (path) => patchedRoute(route(path));

  return router;
}

function patchedRoute(routeObject) {
  patch(routeObject, ROUTE_METHODS);
  return routeObject;
}

export default Router;
