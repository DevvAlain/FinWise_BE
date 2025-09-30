import { EventEmitter } from 'events';

const domainEventEmitter = new EventEmitter();
domainEventEmitter.setMaxListeners(50);

export const publishDomainEvents = async (events = []) => {
  if (!Array.isArray(events) || events.length === 0) return;
  for (const event of events) {
    if (!event || !event.name) continue;
    domainEventEmitter.emit(event.name, {
      ...event,
      publishedAt: new Date().toISOString(),
    });
  }
};

export const subscribeDomainEvent = (eventName, handler) => {
  domainEventEmitter.on(eventName, handler);
  return () => domainEventEmitter.off(eventName, handler);
};

export default domainEventEmitter;
