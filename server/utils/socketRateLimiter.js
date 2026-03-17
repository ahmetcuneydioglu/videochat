const buckets = new Map();

function consumeSocketEvent(socket, eventName, { limit, windowMs }) {
  const key = `${socket.id}:${eventName}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

module.exports = {
  consumeSocketEvent,
};
