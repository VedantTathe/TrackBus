/**
 * Global Centralized Error Handling Middleware for Express.
 */
export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  const responsePayload = {
    status: err.status,
    message: err.message || 'An unexpected error occurred on the server',
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    responsePayload.stack = err.stack;
  }

  // Handle specific database errors
  if (err.name === 'CastError') {
    responsePayload.message = `Invalid ${err.path}: ${err.value}`;
    err.statusCode = 400;
  }

  if (err.code === 11000) {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    responsePayload.message = `Duplicate field value: ${value}. Please use another value!`;
    err.statusCode = 400;
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    responsePayload.message = `Invalid input data: ${errors.join('. ')}`;
    err.statusCode = 400;
  }

  if (err.name === 'JsonWebTokenError') {
    responsePayload.message = 'Invalid token. Please log in again!';
    err.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    responsePayload.message = 'Your token has expired! Please log in again.';
    res.statusCode = 401;
  }

  res.status(err.statusCode).json(responsePayload);
};
